import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve, relative, join, dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import ignore from 'ignore';
import { Database } from '../store/db.js';
import { RepoRegistry } from '../store/registry.js';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION: string = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')).version;

// ── Lazy DB connection with idle eviction ──

class LazyDb {
  private instance: Database | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private static IDLE_TIMEOUT = 5 * 60_000;

  constructor(private dbPath: string) {}

  get(): Database {
    this.resetTimer();
    if (!this.instance) this.instance = new Database(this.dbPath);
    return this.instance;
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.evict(), LazyDb.IDLE_TIMEOUT);
  }

  private evict(): void {
    this.instance?.close();
    this.instance = null;
    this.timer = null;
  }

  shutdown(): void {
    if (this.timer) clearTimeout(this.timer);
    this.instance?.close();
    this.instance = null;
  }
}

// ── Compact formatters (token-efficient for AI agents) ──

type DetailLevel = 'L0' | 'L1' | 'L2';

function fmtSymbol(s: { id?: string; name: string; kind: string; filePath: string; startLine: number; role?: string; heat?: number }, detail: DetailLevel = 'L1') {
  const base = `${s.name} [${s.kind}] ${s.filePath}:${s.startLine}`;
  if (detail === 'L0') return `${s.name} [${s.kind}]`;
  if (detail === 'L2') {
    const meta: string[] = [];
    if (s.role) meta.push(s.role);
    if (s.heat != null && s.heat > 0) meta.push(`heat:${s.heat}`);
    return meta.length > 0 ? `${base} {${meta.join(',')}}` : base;
  }
  return base;
}

function fmtImpact(items: Array<{ symbol: any; depth: number; via: string }>, detail: DetailLevel = 'L1') {
  const grouped = new Map<number, string[]>();
  for (const { symbol, depth, via } of items) {
    const arr = grouped.get(depth) ?? [];
    arr.push(`${fmtSymbol(symbol, detail)} (${via})`);
    grouped.set(depth, arr);
  }
  const lines: string[] = [];
  for (const [depth, refs] of [...grouped].sort((a, b) => a[0] - b[0])) {
    lines.push(`depth ${depth}:`);
    for (const r of refs) lines.push(`  ${r}`);
  }
  return lines.join('\n');
}

/** Check if a file path looks like a test/spec file */
function isTestFilePath(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    /^tests?[/\\]/.test(filePath) ||
    /__tests__[/\\]/.test(filePath) ||
    /_test\.(go|py|rb|rs|java|php)$/.test(filePath) ||
    /^test_.*\.py$/.test(filePath.split('/').pop() ?? '');
}

// ── Text grep across project files ──

const GREP_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit',
  '__pycache__', '.venv', 'venv', 'env',
  'vendor', 'target',
  '.idea', '.vscode',
  'coverage', '.nyc_output',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.br',
  '.pdf', '.doc', '.docx',
  '.mp3', '.mp4', '.avi', '.mov',
  '.wasm', '.node', '.so', '.dll', '.dylib',
  '.lock',
]);

interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

function grepFiles(
  rootPath: string,
  pattern: string,
  options: { isRegex?: boolean; caseSensitive?: boolean; maxResults?: number; includePattern?: string },
): GrepMatch[] {
  const { isRegex = false, caseSensitive = false, maxResults = 50, includePattern } = options;
  const flags = caseSensitive ? '' : 'i';
  let regex: RegExp;
  try {
    regex = isRegex ? safeRegex(pattern, flags) : new RegExp(escapeRegExp(pattern), flags);
  } catch {
    return [];
  }

  const ig = loadGrepIgnoreRules(rootPath);
  const includeRe = includePattern ? globToRegex(includePattern) : null;
  const results: GrepMatch[] = [];

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const abs = join(dir, entry);
      const rel = relative(rootPath, abs).replace(/\\/g, '/');

      if (entry.startsWith('.') && entry !== '.') continue;
      if (GREP_SKIP_DIRS.has(entry)) continue;
      if (ig.ignores(rel)) continue;

      let stat;
      try { stat = statSync(abs); } catch { continue; }

      if (stat.isDirectory()) {
        walk(abs);
      } else if (stat.isFile()) {
        const ext = '.' + entry.split('.').pop()?.toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;
        if (stat.size > 512 * 1024) continue; // skip files > 512KB
        if (includeRe && !includeRe.test(rel)) continue;

        try {
          const content = readFileSync(abs, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (regex.test(lines[i])) {
              results.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) });
            }
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  walk(rootPath);
  return results;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Line-level scope matching for scoped grep */
function matchesScope(lineText: string, scope: 'imports' | 'definitions'): boolean {
  const trimmed = lineText.trimStart();
  if (scope === 'imports') {
    return /^(import\s|from\s|require\(|use\s|include\s|require_relative|require\s)/.test(trimmed);
  }
  // definitions: function, class, interface, struct, trait, enum, type, def, fn, pub fn, etc.
  return /^(export\s+)?(async\s+)?(function|class|interface|type|enum|struct|trait|const|let|var|def|fn|pub\s+fn|pub\s+struct|pub\s+enum|module)\s/.test(trimmed);
}

/** Validate user-supplied regex is safe from catastrophic backtracking (ReDoS). */
function safeRegex(pattern: string, flags: string): RegExp {
  if (pattern.length > 200) throw new Error('Pattern too long');
  // Reject nested quantifiers like (a+)+, (a*)*,  (a{1,})+
  if (/([+*}])\)?[+*{]/.test(pattern)) throw new Error('Unsafe regex pattern');
  // Reject overlapping alternation inside quantified groups: (a|a)*, (ab|a)+
  if (/\((?:[^)]*\|[^)]*)\)[+*{]/.test(pattern)) throw new Error('Unsafe regex pattern');
  // Reject backreferences inside quantified groups (exponential matching)
  if (/\((?:[^)]*\\[1-9][^)]*)\)[+*{]/.test(pattern)) throw new Error('Unsafe regex pattern');
  // Reject deeply nested groups (>3 levels)
  let depth = 0, maxDepth = 0;
  for (const ch of pattern) {
    if (ch === '(') { depth++; maxDepth = Math.max(maxDepth, depth); }
    else if (ch === ')') depth--;
  }
  if (maxDepth > 3) throw new Error('Unsafe regex pattern');
  return new RegExp(pattern, flags);
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§STARSTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§STARSTAR§/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function loadGrepIgnoreRules(rootPath: string): ReturnType<typeof ignore> {
  const ig = ignore();
  ig.add(['node_modules', 'dist', 'build', '.git', '__pycache__', 'vendor', 'target']);
  try {
    const content = readFileSync(join(rootPath, '.gitignore'), 'utf-8');
    ig.add(content);
  } catch { /* no .gitignore */ }
  return ig;
}

// ── Server instructions (sent to client via MCP protocol on initialize) ──

const MILENS_INSTRUCTIONS = `milens — code intelligence engine. Indexes codebases into symbol graphs.

## Tool selection
- \`query\` — find symbol definitions (code identifiers only)
- \`grep\` — text search ALL files. Use \`scope\` param: all (default), code (source only), imports, definitions
- \`context\` — 360° view: incoming + outgoing for a symbol
- \`impact\` — blast radius: what breaks if symbol changes
- \`overview\` — combined context + impact + grep in one call (preferred for editing workflows)
- \`edit_check\` — pre-edit safety: callers + export status + re-export chains + test coverage + ⚠ warnings (fastest for edits)
- \`trace\` — execution flow: call chains from entrypoints to a symbol (or downstream from it)
- \`routes\` — detect framework routes/endpoints (Express, FastAPI, NestJS, Flask, Go, PHP, Rails)
- \`smart_context\` — intent-aware context: understand/edit/debug/test (returns only what matters for intent)
- \`detect_changes\` — git diff → affected symbols
- \`explain_relationship\` — shortest path between two symbols
- \`find_dead_code\` — unused exports
- \`get_file_symbols\` — all symbols in a file
- \`get_type_hierarchy\` — inheritance tree

## Rules
- Before editing a symbol: run \`edit_check\` or \`smart_context\` with intent=edit
- For debugging: run \`smart_context\` with intent=debug or \`trace\` to=symbol
- For writing tests: run \`smart_context\` with intent=test — shows deps to mock + callers to cover
- \`impact\` only tracks code deps — always pair with \`grep\` for templates/configs
- Use \`query\` for camelCase/PascalCase identifiers, \`grep\` for display text or multi-word strings
- impact depth: 1=WILL BREAK, 2=LIKELY AFFECTED, 3=MAY NEED TESTING
- ⚠ markers indicate unresolved INTERNAL references — external package imports/calls are tracked separately
- ✓ test coverage shown on edit_check — symbols with no test coverage get a warning
`;

// ── Server setup ──

export function createMcpServer(rootPath?: string): McpServer {
  const registry = new RepoRegistry();
  const pools = new Map<string, LazyDb>();

  function resolveRoot(repoPath?: string): string {
    if (repoPath) {
      const root = resolve(repoPath);
      const entry = registry.findByRoot(root);
      if (!entry) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);
      return root;
    }
    if (rootPath) {
      const root = resolve(rootPath);
      const entry = registry.findByRoot(root);
      if (!entry) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);
      return root;
    }
    // Auto-resolve: if exactly 1 repo is indexed, use it
    const all = registry.listAll();
    if (all.length === 1) return all[0].rootPath;
    if (all.length === 0) throw new Error('No indexed repositories. Run `milens analyze` first.');
    throw new Error(`Multiple repos indexed (${all.length}). Specify \`repo\` parameter.`);
  }

  function getDb(repoPath?: string): { db: Database; root: string } {
    const root = resolveRoot(repoPath);
    const dbPath = registry.findDbPath(root);
    if (!dbPath) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);

    if (!pools.has(root)) pools.set(root, new LazyDb(dbPath));
    return { db: pools.get(root)!.get(), root };
  }

  const server = new McpServer(
    { name: 'milens', version: PKG_VERSION },
    { instructions: MILENS_INSTRUCTIONS },
  );

  // ── Tool: query ──
  server.tool(
    'query',
    'Search indexed symbol definitions by name/kind. For text in templates/configs/docs, use `grep`.',
    {
      query: z.string().describe('Symbol name, kind, or keyword to search'),
      repo: z.string().optional().describe('Repository root path (optional if only one indexed)'),
      limit: z.number().optional().default(15).describe('Max results'),
    },
    async ({ query, repo, limit }) => {
      const { db } = getDb(repo);
      const results = db.searchSymbols(query, limit);
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No symbols matching "${query}". Try \`grep\` for non-code references.` }] };
      }
      const text = results.map(s => fmtSymbol(s)).join('\n');
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ── Tool: grep ──
  server.tool(
    'grep',
    'Text search ALL project files (templates, styles, configs, docs). Finds every text occurrence, not just symbols.',
    {
      pattern: z.string().describe('Text or regex pattern to search for'),
      repo: z.string().optional().describe('Repository root path (optional)'),
      isRegex: z.boolean().optional().default(false).describe('Treat pattern as regex'),
      caseSensitive: z.boolean().optional().default(false),
      include: z.string().optional().describe('Glob filter for file paths (e.g. "**/*.vue", "*.scss")'),
      scope: z.enum(['all', 'code', 'imports', 'definitions']).optional().default('all')
        .describe('Scope: all=everything, code=source files only (no configs/docs), imports=import/require lines only, definitions=function/class/interface declarations only'),
      limit: z.number().optional().default(50).describe('Max results'),
    },
    async ({ pattern, repo, isRegex, caseSensitive, include, scope, limit }) => {
      const root = resolveRoot(repo);
      const effectiveInclude = scope === 'code' && !include
        ? '**/*.{ts,tsx,js,jsx,mjs,cjs,vue,py,go,rs,java,php,rb}'
        : include;
      const matches = grepFiles(root, pattern, {
        isRegex, caseSensitive, maxResults: limit, includePattern: effectiveInclude,
      });

      // Apply scope-specific line filtering
      const filtered = scope === 'all' || scope === 'code'
        ? matches
        : matches.filter(m => matchesScope(m.text, scope));

      if (filtered.length === 0) {
        return { content: [{ type: 'text' as const, text: `No matches for "${pattern}"${scope !== 'all' ? ` (scope: ${scope})` : ''}` }] };
      }

      // Group by file for compact output
      const grouped = new Map<string, { line: number; text: string }[]>();
      for (const m of filtered) {
        const arr = grouped.get(m.file) ?? [];
        arr.push({ line: m.line, text: m.text });
        grouped.set(m.file, arr);
      }

      const lines: string[] = [`${filtered.length} matches in ${grouped.size} files${scope !== 'all' ? ` (scope: ${scope})` : ''}:\n`];
      for (const [file, hits] of grouped) {
        lines.push(file);
        for (const h of hits) {
          lines.push(`  L${h.line}: ${h.text}`);
        }
      }

      if (filtered.length >= limit) {
        lines.push(`\n(truncated at ${limit} results — increase limit or narrow pattern)`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: context ──
  server.tool(
    'context',
    'Symbol 360°: incoming refs + outgoing deps. Use `overview` for combined context+impact+grep.',
    {
      name: z.string().describe('Symbol name to inspect'),
      repo: z.string().optional(),
      detail: z.enum(['L0', 'L1', 'L2']).optional().default('L1').describe('Output detail: L0=names only, L1=default, L2=full metadata'),
    },
    async ({ name, repo, detail }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found. Try \`grep\`.` }] };
      }

      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`## ${fmtSymbol(sym, detail)}${sym.exported ? ' (exported)' : ''}`);

        const incoming = db.getIncomingLinks(sym.id);
        if (incoming.length > 0) {
          lines.push('incoming:');
          const inSyms = incoming.map(l => ({ link: l, sym: db.findSymbolById(l.fromId) }));
          if (detail === 'L2') inSyms.sort((a, b) => ((b.sym as any)?.heat ?? 0) - ((a.sym as any)?.heat ?? 0));
          for (const { link: l, sym: from } of inSyms) {
            lines.push(`  ${l.type}: ${from ? fmtSymbol(from, detail) : l.fromId}`);
          }
        }

        const outgoing = db.getOutgoingLinks(sym.id);
        if (outgoing.length > 0) {
          lines.push('outgoing:');
          const outSyms = outgoing.map(l => ({ link: l, sym: db.findSymbolById(l.toId) }));
          if (detail === 'L2') outSyms.sort((a, b) => ((b.sym as any)?.heat ?? 0) - ((a.sym as any)?.heat ?? 0));
          for (const { link: l, sym: to } of outSyms) {
            lines.push(`  ${l.type}: ${to ? fmtSymbol(to, detail) : l.toId}`);
          }
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: impact ──
  server.tool(
    'impact',
    'Blast radius: what symbols break if target changes. Code deps only — pair with `grep` for templates/configs.',
    {
      target: z.string().describe('Symbol name to analyze'),
      direction: z.enum(['upstream', 'downstream']).default('upstream'),
      depth: z.number().optional().default(3),
      repo: z.string().optional(),
      detail: z.enum(['L0', 'L1', 'L2']).optional().default('L1').describe('Output detail: L0=names only, L1=default, L2=full metadata'),
    },
    async ({ target, direction, depth, repo, detail }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(target);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${target}" not found. Try \`grep\`.` }] };
      }

      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`TARGET: ${fmtSymbol(sym, detail)}`);
        const refs = direction === 'upstream'
          ? db.findUpstream(sym.id, depth)
          : db.findDownstream(sym.id, depth);

        if (refs.length === 0) {
          lines.push(`No ${direction} deps found.`);
        } else {
          lines.push(`${direction} (${refs.length} symbols):`);
          lines.push(fmtImpact(refs, detail));
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: status ──
  server.tool(
    'status',
    'Index stats for a repository.',
    {
      repo: z.string().optional(),
    },
    async ({ repo }) => {
      const { db, root } = getDb(repo);
      const stats = db.getStats();
      const unresolved = db.getUnresolvedStats();
      const coverage = db.getTestCoverage();
      let text = `repo: ${root}\nsymbols: ${stats.symbols}\nlinks: ${stats.links}\nfiles: ${stats.files}`;
      if (unresolved.imports > 0 || unresolved.calls > 0) {
        text += `\n⚠ unresolved (internal): ${unresolved.imports} imports, ${unresolved.calls} calls — callers may be incomplete`;
      }
      if (unresolved.externalImports > 0 || unresolved.externalCalls > 0) {
        text += `\nexternal (expected): ${unresolved.externalImports} imports, ${unresolved.externalCalls} calls`;
      }
      if (coverage.testFiles > 0) {
        const pct = coverage.exportedProductionSymbols > 0
          ? Math.round(coverage.testedSymbols / coverage.exportedProductionSymbols * 100)
          : 0;
        text += `\ntest coverage: ${coverage.testedSymbols}/${coverage.exportedProductionSymbols} exported symbols (${pct}%) from ${coverage.testFiles} test files`;
      }
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ── Tool: overview ──
  server.tool(
    'overview',
    'Combined context + impact + grep in ONE call. Preferred before editing/deleting/renaming a symbol. Saves 2-3 round trips.',
    {
      name: z.string().describe('Symbol name'),
      repo: z.string().optional(),
      depth: z.number().optional().default(2).describe('Impact traversal depth (default: 2)'),
      detail: z.enum(['L0', 'L1', 'L2']).optional().default('L1').describe('Output detail level'),
    },
    async ({ name, repo, depth, detail }) => {
      const { db, root } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      const sections: string[] = [];

      // Section 1: Symbol definitions
      if (symbols.length === 0) {
        sections.push(`[symbol] "${name}" not found in index.`);
      } else {
        for (const sym of symbols) {
          sections.push(`[symbol] ${fmtSymbol(sym, detail)}${sym.exported ? ' (exported)' : ''}`);
        }
      }

      // Section 2: Context (incoming + outgoing) for each symbol
      if (symbols.length > 0) {
        for (const sym of symbols) {
          const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
          const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');

          if (incoming.length > 0) {
            sections.push(`[incoming] ${incoming.length} refs:`);
            const inSyms = incoming.map(l => {
              const s = db.findSymbolById(l.fromId);
              return s ? `  ${l.type}: ${fmtSymbol(s, detail)}` : `  ${l.type}: ${l.fromId}`;
            });
            sections.push(...inSyms);
          }

          if (outgoing.length > 0) {
            sections.push(`[outgoing] ${outgoing.length} deps:`);
            const outSyms = outgoing.map(l => {
              const s = db.findSymbolById(l.toId);
              return s ? `  ${l.type}: ${fmtSymbol(s, detail)}` : `  ${l.type}: ${l.toId}`;
            });
            sections.push(...outSyms);
          }
        }

        // Section 3: Impact (upstream)
        for (const sym of symbols) {
          const upstream = db.findUpstream(sym.id, depth);
          if (upstream.length > 0) {
            sections.push(`[impact] ${upstream.length} upstream deps:`);
            sections.push(fmtImpact(upstream, detail));
          } else {
            sections.push(`[impact] No upstream deps.`);
          }
        }
      }

      // Section 4: Grep (text references across all files)
      const grepMatches = grepFiles(root, name, { maxResults: 20 });
      if (grepMatches.length > 0) {
        const grouped = new Map<string, { line: number; text: string }[]>();
        for (const m of grepMatches) {
          const arr = grouped.get(m.file) ?? [];
          arr.push({ line: m.line, text: m.text });
          grouped.set(m.file, arr);
        }
        sections.push(`[grep] ${grepMatches.length} text matches in ${grouped.size} files:`);
        for (const [file, hits] of grouped) {
          sections.push(`  ${file}`);
          for (const h of hits) sections.push(`    L${h.line}: ${h.text}`);
        }
      } else {
        sections.push(`[grep] No text matches.`);
      }

      // Section 5: Unresolved warnings (only for internal)
      const unresolved = db.getUnresolvedStats();
      if (unresolved.imports > 0 || unresolved.calls > 0) {
        sections.push(`[⚠ unresolved internal] ${unresolved.imports} imports, ${unresolved.calls} calls — some references may be missing`);
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    },
  );

  // ── Tool: detect_changes ──
  server.tool(
    'detect_changes',
    'Git diff → affected symbols + direct dependents.',
    {
      ref: z.string().optional().default('HEAD').describe('Git ref to diff against (default: HEAD)'),
      repo: z.string().optional(),
    },
    async ({ ref, repo }) => {
      const { db, root } = getDb(repo);
      // Validate ref: only allow safe git ref characters (alphanumeric, /, ., -, _, ~, ^)
      if (!/^[a-zA-Z0-9\/._~^\-]+$/.test(ref)) {
        return { content: [{ type: 'text' as const, text: 'Invalid git ref.' }] };
      }
      let changedFiles: string[];
      try {
        const output = execFileSync('git', ['diff', '--name-only', ref], { cwd: root, encoding: 'utf-8' });
        const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf-8' });
        changedFiles = [...new Set([...output.trim().split('\n'), ...staged.trim().split('\n')])].filter(Boolean);
      } catch {
        return { content: [{ type: 'text' as const, text: 'Not a git repository or git not available.' }] };
      }

      if (changedFiles.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No changed files detected.' }] };
      }

      const lines: string[] = [`${changedFiles.length} changed files:\n`];
      let totalAffected = 0;
      for (const file of changedFiles) {
        const syms = db.getSymbolsByFile(file);
        if (syms.length === 0) {
          lines.push(`${file}: (not indexed)`);
          continue;
        }
        lines.push(`${file}: ${syms.length} symbols`);
        for (const sym of syms) {
          const upstream = db.findUpstream(sym.id, 1);
          if (upstream.length > 0) {
            lines.push(`  ${sym.name} [${sym.kind}] → ${upstream.length} direct dependents`);
            totalAffected += upstream.length;
          }
        }
      }
      lines.push(`\nTotal direct dependents affected: ${totalAffected}`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: explain_relationship ──
  server.tool(
    'explain_relationship',
    'Shortest dependency path between two symbols.',
    {
      from: z.string().describe('Source symbol name'),
      to: z.string().describe('Target symbol name'),
      repo: z.string().optional(),
    },
    async ({ from, to, repo }) => {
      const { db } = getDb(repo);
      const path = db.findPath(from, to);
      if (!path) {
        return { content: [{ type: 'text' as const, text: `No path between "${from}" and "${to}".` }] };
      }

      const fromSym = db.findSymbolByName(from)[0];
      const lines = [`FROM: ${fmtSymbol(fromSym)}`, ''];
      for (const { symbol, depth, via } of path) {
        lines.push(`  ${'→'.repeat(depth)} [${via}] ${fmtSymbol(symbol)}`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: find_dead_code ──
  server.tool(
    'find_dead_code',
    'Exported symbols with zero incoming references (potentially unused).',
    {
      kind: z.string().optional().describe('Filter by symbol kind (function, class, method, etc.)'),
      limit: z.number().optional().default(30),
      repo: z.string().optional(),
    },
    async ({ kind, limit, repo }) => {
      const { db } = getDb(repo);
      const dead = db.findDeadCode(kind, limit);
      if (dead.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No unreferenced exported symbols found.' }] };
      }
      const lines = [`${dead.length} unreferenced exported symbols:\n`];
      for (const sym of dead) {
        lines.push(fmtSymbol(sym));
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: get_file_symbols ──
  server.tool(
    'get_file_symbols',
    'All symbols in a file with ref/dep counts.',
    {
      file: z.string().describe('File path (relative to repo root)'),
      repo: z.string().optional(),
      detail: z.enum(['L0', 'L1', 'L2']).optional().default('L1').describe('Output detail: L0=names only, L1=default, L2=full metadata'),
    },
    async ({ file, repo, detail }) => {
      const { db } = getDb(repo);
      const symbols = db.getSymbolsByFile(file);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `No symbols found in "${file}". Is the path relative to repo root?` }] };
      }

      // Sort by heat descending in L2 mode for relevance-first output
      const sorted = detail === 'L2'
        ? [...symbols].sort((a, b) => ((b as any).heat ?? 0) - ((a as any).heat ?? 0))
        : symbols;

      const lines: string[] = [`${file}: ${symbols.length} symbols\n`];
      for (const sym of sorted) {
        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
        const exp = sym.exported ? ' (exported)' : '';
        if (detail === 'L0') {
          lines.push(`${sym.name} [${sym.kind}]${exp}`);
        } else if (detail === 'L2') {
          const meta: string[] = [];
          if (sym.role) meta.push(sym.role);
          if (sym.heat != null && sym.heat > 0) meta.push(`heat:${sym.heat}`);
          const metaStr = meta.length > 0 ? ` {${meta.join(',')}}` : '';
          lines.push(`${sym.name} [${sym.kind}] L${sym.startLine}-${sym.endLine}${exp}${metaStr} ← ${incoming.length} refs, → ${outgoing.length} deps`);
        } else {
          lines.push(`${sym.name} [${sym.kind}] L${sym.startLine}-${sym.endLine}${exp} ← ${incoming.length} refs, → ${outgoing.length} deps`);
        }
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: get_type_hierarchy ──
  server.tool(
    'get_type_hierarchy',
    'Inheritance/implementation tree for a class, interface, or trait.',
    {
      name: z.string().describe('Symbol name to show hierarchy for'),
      repo: z.string().optional(),
    },
    async ({ name, repo }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found. Try \`grep\`.` }] };
      }

      const lines: string[] = [];
      for (const sym of symbols) {
        const { ancestors, descendants } = db.getTypeHierarchy(sym.id);
        lines.push(`## ${fmtSymbol(sym)}`);

        if (ancestors.length > 0) {
          lines.push('extends/implements:');
          for (const { symbol: a, depth } of ancestors) {
            lines.push(`  ${'↑'.repeat(depth)} ${fmtSymbol(a)}`);
          }
        }

        if (descendants.length > 0) {
          lines.push('extended/implemented by:');
          for (const { symbol: d, depth } of descendants) {
            lines.push(`  ${'↓'.repeat(depth)} ${fmtSymbol(d)}`);
          }
        }

        if (ancestors.length === 0 && descendants.length === 0) {
          lines.push('No inheritance relationships.');
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: edit_check ──
  server.tool(
    'edit_check',
    'Pre-edit safety check: callers, export status, re-export chains, ⚠ warnings. Focused for editing intent — no downstream deps, no outgoing calls. Use BEFORE modifying a symbol.',
    {
      name: z.string().describe('Symbol name to check before editing'),
      repo: z.string().optional(),
    },
    async ({ name, repo }) => {
      const { db, root } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      const sections: string[] = [];

      if (symbols.length === 0) {
        sections.push(`"${name}" not found in index. Try \`grep\`.`);
        return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
      }

      for (const sym of symbols) {
        // 1. Symbol info
        sections.push(`${fmtSymbol(sym)}${sym.exported ? ' (exported)' : ''}`);

        // 2. Who calls/uses this? (direct upstream only — what WILL break)
        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        if (incoming.length > 0) {
          sections.push(`callers (${incoming.length}):`);
          for (const l of incoming) {
            const from = db.findSymbolById(l.fromId);
            sections.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
          }
        } else {
          sections.push(`callers: none`);
        }

        // 3. Export chain — is this re-exported from barrel files?
        const grepMatches = grepFiles(root, name, { maxResults: 10, includePattern: '**/index.{ts,js,mjs}' });
        const reExportMatches = grepMatches.filter(m =>
          /export\s*\{[^}]*/.test(m.text) && m.text.includes('from')
        );
        if (reExportMatches.length > 0) {
          sections.push(`re-exported via:`);
          for (const m of reExportMatches) {
            sections.push(`  ${m.file}:${m.line}`);
          }
        }

        // 4. Heritage — is this a parent class?
        const descendants = db.getTypeHierarchy(sym.id).descendants;
        if (descendants.length > 0) {
          sections.push(`⚠ inherited by ${descendants.length} types:`);
          for (const { symbol: d } of descendants) {
            sections.push(`  ${fmtSymbol(d)}`);
          }
        }
      }

      // 5. Unresolved warning (only for internal)
      const unresolved = db.getUnresolvedStats();
      if (unresolved.imports > 0 || unresolved.calls > 0) {
        sections.push(`⚠ index has ${unresolved.imports} unresolved internal imports, ${unresolved.calls} unresolved internal calls — callers list may be incomplete`);
      }

      // 6. Test coverage for this symbol
      for (const sym of symbols) {
        const incoming = db.getIncomingLinks(sym.id);
        const testRefs = incoming.filter(l => {
          const from = db.findSymbolById(l.fromId);
          return from && isTestFilePath(from.filePath);
        });
        if (testRefs.length > 0) {
          const testFiles = [...new Set(testRefs.map(l => {
            const from = db.findSymbolById(l.fromId);
            return from?.filePath;
          }).filter(Boolean))];
          sections.push(`✓ tested from: ${testFiles.join(', ')}`);
        } else if (sym.exported) {
          sections.push(`⚠ no test coverage for this exported symbol`);
        }
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    },
  );

  // ── Tool: trace ──
  server.tool(
    'trace',
    'Trace execution flow: find call chains from entrypoints to a target symbol, or from a symbol downstream. Shows HOW code gets executed.',
    {
      name: z.string().describe('Symbol name to trace'),
      direction: z.enum(['to', 'from']).optional().default('to')
        .describe('to=trace paths TO this symbol from entrypoints, from=trace paths FROM this symbol downstream'),
      repo: z.string().optional(),
      depth: z.number().optional().default(8).describe('Max chain depth'),
    },
    async ({ name, direction, repo, depth }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found. Try \`grep\`.` }] };
      }

      const sections: string[] = [];

      for (const sym of symbols) {
        if (direction === 'to') {
          // Trace upstream to entrypoints
          const traces = db.traceToEntrypoints(sym.id, depth);
          sections.push(`## Execution paths TO ${fmtSymbol(sym)}\n`);
          if (traces.length === 0) {
            sections.push('No call chains found (symbol may be an entrypoint itself or unreachable).');
          } else {
            for (let i = 0; i < traces.length; i++) {
              const chain = traces[i].path;
              sections.push(`path ${i + 1} (${chain.length} steps):`);
              sections.push(chain.map((step, idx) => {
                const arrow = idx === chain.length - 1 ? '→ (target)' : `→ [${chain[idx + 1]?.via ?? ''}]`;
                return `  ${' '.repeat(idx)}${fmtSymbol(step.symbol)} ${arrow}`;
              }).join('\n'));
              sections.push('');
            }
          }
        } else {
          // Trace downstream — show call/dependency tree from this symbol
          const downstream = db.findDownstream(sym.id, depth);
          sections.push(`## Execution paths FROM ${fmtSymbol(sym)}\n`);
          if (downstream.length === 0) {
            sections.push('No downstream dependencies (leaf symbol).');
          } else {
            // Group by depth and show as tree
            const byDepth = new Map<number, string[]>();
            for (const { symbol, depth: d, via } of downstream) {
              const arr = byDepth.get(d) ?? [];
              arr.push(`${'  '.repeat(d)}[${via}] ${fmtSymbol(symbol)}`);
              byDepth.set(d, arr);
            }
            for (const [, items] of [...byDepth].sort((a, b) => a[0] - b[0])) {
              sections.push(...items);
            }
          }
        }
        sections.push('');
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    },
  );

  // ── Tool: routes ──
  server.tool(
    'routes',
    'Detect framework routes/endpoints and map them to handler symbols. Scans for Express, FastAPI, NestJS, Flask, Go HTTP, PHP, Rails patterns.',
    {
      repo: z.string().optional(),
      framework: z.string().optional().describe('Filter by framework (express, fastapi, nestjs, flask, go, php, rails). Default: auto-detect all.'),
      limit: z.number().optional().default(50),
    },
    async ({ repo, framework, limit }) => {
      const root = resolveRoot(repo);
      const { db } = getDb(repo);

      // Route patterns for different frameworks
      const routePatterns: Array<{ name: string; pattern: RegExp; fileGlob: string }> = [
        { name: 'express', pattern: /\b(?:app|router)\.(get|post|put|patch|delete|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/, fileGlob: '**/*.{ts,js,mjs,cjs}' },
        { name: 'fastapi', pattern: /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.py' },
        { name: 'flask', pattern: /@(?:app|bp|blueprint)\.(route|get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.py' },
        { name: 'nestjs', pattern: /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"]?([^'")]*?)['"]?\s*\)/, fileGlob: '**/*.ts' },
        { name: 'go', pattern: /\b(?:mux|router|http)\.(HandleFunc|Handle|Get|Post|Put|Delete)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.go' },
        { name: 'php', pattern: /Route::(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.php' },
        { name: 'rails', pattern: /\b(get|post|put|patch|delete|resources?|root)\s+['"]([^'"]+)['"]/, fileGlob: '**/*.rb' },
      ];

      const activePatterns = framework
        ? routePatterns.filter(p => p.name === framework.toLowerCase())
        : routePatterns;

      if (activePatterns.length === 0) {
        return { content: [{ type: 'text' as const, text: `Unknown framework "${framework}". Available: express, fastapi, nestjs, flask, go, php, rails` }] };
      }

      interface RouteMatch { framework: string; method: string; path: string; file: string; line: number; handler?: string }
      const routes: RouteMatch[] = [];

      for (const rp of activePatterns) {
        const matches = grepFiles(root, rp.pattern.source, {
          isRegex: true, maxResults: limit, includePattern: rp.fileGlob,
        });

        for (const m of matches) {
          const match = rp.pattern.exec(m.text);
          if (!match) continue;
          const method = match[1].toUpperCase();
          const path = match[2] || '/';

          // Try to find the handler symbol on this line or nearby
          const fileSymbols = db.getSymbolsByFile(m.file);
          const handler = fileSymbols.find(s =>
            s.startLine <= m.line && s.endLine >= m.line && s.kind === 'method'
          ) ?? fileSymbols.find(s =>
            s.startLine <= m.line && s.endLine >= m.line
          ) ?? fileSymbols.find(s =>
            Math.abs(s.startLine - m.line) <= 3 && (s.kind === 'function' || s.kind === 'method')
          );

          routes.push({
            framework: rp.name,
            method,
            path,
            file: m.file,
            line: m.line,
            handler: handler ? `${handler.name} [${handler.kind}]` : undefined,
          });
        }
      }

      if (routes.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No framework routes detected.' }] };
      }

      // Group by framework
      const grouped = new Map<string, RouteMatch[]>();
      for (const r of routes) {
        const arr = grouped.get(r.framework) ?? [];
        arr.push(r);
        grouped.set(r.framework, arr);
      }

      const lines: string[] = [`${routes.length} routes detected:\n`];
      for (const [fw, fwRoutes] of grouped) {
        lines.push(`[${fw}]`);
        for (const r of fwRoutes) {
          const handlerInfo = r.handler ? ` → ${r.handler}` : '';
          lines.push(`  ${r.method.padEnd(7)} ${r.path}  (${r.file}:${r.line})${handlerInfo}`);
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: smart_context ──
  server.tool(
    'smart_context',
    'Intent-aware context: returns different information based on what you want to do. Saves tokens by showing only what matters for your intent.',
    {
      name: z.string().describe('Symbol name'),
      intent: z.enum(['understand', 'edit', 'debug', 'test'])
        .describe('understand=360° view, edit=callers+blast radius, debug=execution paths+data flow, test=coverage+dependencies'),
      repo: z.string().optional(),
    },
    async ({ name, intent, repo }) => {
      const { db, root } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found. Try \`grep\`.` }] };
      }

      const sections: string[] = [];

      for (const sym of symbols) {
        sections.push(`${fmtSymbol(sym, 'L2')}${sym.exported ? ' (exported)' : ''}\n`);

        if (intent === 'understand') {
          // Full 360° — context + downstream + file structure
          const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
          const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');

          if (incoming.length > 0) {
            sections.push(`incoming (${incoming.length}):`);
            for (const l of incoming) {
              const from = db.findSymbolById(l.fromId);
              sections.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
            }
          }
          if (outgoing.length > 0) {
            sections.push(`outgoing (${outgoing.length}):`);
            for (const l of outgoing) {
              const to = db.findSymbolById(l.toId);
              sections.push(`  ${l.type}: ${to ? fmtSymbol(to) : l.toId}`);
            }
          }

          // Heritage
          const { ancestors, descendants } = db.getTypeHierarchy(sym.id);
          if (ancestors.length > 0) {
            sections.push(`extends: ${ancestors.map(a => fmtSymbol(a.symbol)).join(', ')}`);
          }
          if (descendants.length > 0) {
            sections.push(`extended by: ${descendants.map(d => fmtSymbol(d.symbol)).join(', ')}`);
          }

          // Siblings — other symbols in same file
          const siblings = db.getSymbolsByFile(sym.filePath)
            .filter(s => s.id !== sym.id && !s.parentId)
            .slice(0, 10);
          if (siblings.length > 0) {
            sections.push(`file peers: ${siblings.map(s => `${s.name} [${s.kind}]`).join(', ')}`);
          }

        } else if (intent === 'edit') {
          // Focused: who calls this + blast radius + test coverage
          const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
          const upstream = db.findUpstream(sym.id, 2);

          if (incoming.length > 0) {
            sections.push(`direct callers (${incoming.length}):`);
            for (const l of incoming) {
              const from = db.findSymbolById(l.fromId);
              sections.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
            }
          } else {
            sections.push(`direct callers: none`);
          }

          if (upstream.length > incoming.length) {
            const depth2 = upstream.filter(u => u.depth === 2);
            if (depth2.length > 0) {
              sections.push(`indirect dependents (depth 2): ${depth2.length} symbols`);
            }
          }

          // Re-export detection
          const reExportMatches = grepFiles(root, name, { maxResults: 5, includePattern: '**/index.{ts,js,mjs}' })
            .filter(m => /export\s*\{/.test(m.text) && m.text.includes('from'));
          if (reExportMatches.length > 0) {
            sections.push(`re-exported via: ${reExportMatches.map(m => `${m.file}:${m.line}`).join(', ')}`);
          }

          // Test coverage
          const testRefs = incoming.filter(l => {
            const from = db.findSymbolById(l.fromId);
            return from && isTestFilePath(from.filePath);
          });
          if (testRefs.length > 0) {
            sections.push(`✓ has test coverage`);
          } else if (sym.exported) {
            sections.push(`⚠ no test coverage`);
          }

        } else if (intent === 'debug') {
          // Execution paths + data flow
          const traces = db.traceToEntrypoints(sym.id, 6);
          if (traces.length > 0) {
            sections.push(`execution paths (${traces.length}):`);
            for (let i = 0; i < Math.min(traces.length, 3); i++) {
              const chain = traces[i].path;
              sections.push(`  ${chain.map(s => s.symbol.name).join(' → ')}`);
            }
          } else {
            sections.push(`no call chains found (may be entrypoint or unreachable)`);
          }

          // What does this call? (downstream immediate)
          const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type === 'calls');
          if (outgoing.length > 0) {
            sections.push(`calls (${outgoing.length}):`);
            for (const l of outgoing) {
              const to = db.findSymbolById(l.toId);
              sections.push(`  ${to ? fmtSymbol(to) : l.toId}`);
            }
          }

          // Data types used
          const dataTypes = db.getOutgoingLinks(sym.id)
            .filter(l => l.type === 'imports')
            .map(l => db.findSymbolById(l.toId))
            .filter(s => s && (s.kind === 'interface' || s.kind === 'type' || s.kind === 'class'))
            .slice(0, 10);
          if (dataTypes.length > 0) {
            sections.push(`data types: ${dataTypes.map(s => s!.name).join(', ')}`);
          }

        } else if (intent === 'test') {
          // Test coverage + what to mock
          const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
          const testRefs = incoming.filter(l => {
            const from = db.findSymbolById(l.fromId);
            return from && isTestFilePath(from.filePath);
          });

          if (testRefs.length > 0) {
            const testFiles = [...new Set(testRefs.map(l => {
              const from = db.findSymbolById(l.fromId);
              return from?.filePath;
            }).filter(Boolean))];
            sections.push(`✓ tested from: ${testFiles.join(', ')}`);
          } else {
            sections.push(`⚠ no existing tests`);
          }

          // Dependencies to mock
          const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
          const externalDeps = outgoing.filter(l => {
            const to = db.findSymbolById(l.toId);
            return to && to.filePath !== sym.filePath;
          });
          if (externalDeps.length > 0) {
            sections.push(`dependencies to mock (${externalDeps.length}):`);
            for (const l of externalDeps) {
              const to = db.findSymbolById(l.toId);
              if (to) sections.push(`  ${l.type}: ${fmtSymbol(to)}`);
            }
          }

          // Inputs — what calls this? (test should cover these call patterns)
          const nonTestCallers = incoming.filter(l => {
            const from = db.findSymbolById(l.fromId);
            return from && !isTestFilePath(from.filePath);
          });
          if (nonTestCallers.length > 0) {
            sections.push(`callers to cover (${nonTestCallers.length}):`);
            for (const l of nonTestCallers.slice(0, 5)) {
              const from = db.findSymbolById(l.fromId);
              if (from) sections.push(`  ${fmtSymbol(from)}`);
            }
          }
        }

        sections.push('');
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    },
  );

  // ── Prompt: delete-feature ──
  server.prompt(
    'delete-feature',
    'Step-by-step workflow for safely deleting a feature from the codebase',
    { name: z.string().describe('Feature or symbol name to delete') },
    ({ name }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to safely delete the feature "${name}" from this codebase. Follow these steps:\n\n` +
            `1. Run \`grep\` with pattern "${name}" to find ALL text references (templates, styles, configs, routes, docs)\n` +
            `2. Run \`impact\` with target "${name}" and direction "upstream" to find code-level dependents\n` +
            `3. Run \`context\` on "${name}" to see full relationships\n` +
            `4. Combine grep + impact results to build a complete deletion plan\n` +
            `5. List ALL files that need changes, ordered by dependency (leaf nodes first)\n\n` +
            `Important: grep catches template/config/route references that impact cannot see. Always use both.`,
        },
      }],
    }),
  );

  // ── Prompt: refactor-symbol ──
  server.prompt(
    'refactor-symbol',
    'Step-by-step workflow for safely renaming or refactoring a symbol',
    { name: z.string().describe('Symbol name to refactor') },
    ({ name }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to safely refactor/rename "${name}". Follow these steps:\n\n` +
            `1. Run \`context\` on "${name}" to understand all relationships\n` +
            `2. Run \`impact\` with target "${name}" and direction "upstream" to find all dependents\n` +
            `3. Run \`grep\` with pattern "${name}" to find ALL text references (templates, SCSS, configs, routes, docs)\n` +
            `4. Run \`get_type_hierarchy\` if it's a class/interface to check inheritance\n` +
            `5. List every file and location that needs updating\n\n` +
            `Important: grep catches template/config references that impact cannot see. Always use both.`,
        },
      }],
    }),
  );

  // ── Prompt: explore-symbol ──
  server.prompt(
    'explore-symbol',
    'Deep exploration of an unfamiliar symbol — what it is, who uses it, what it depends on',
    { name: z.string().describe('Symbol name to explore') },
    ({ name }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to understand "${name}" in this codebase. Run these tools:\n\n` +
            `1. \`query\` for "${name}" to find its definition\n` +
            `2. \`context\` on "${name}" for full 360° view (incoming refs, outgoing deps)\n` +
            `3. \`impact\` upstream to see what depends on it\n` +
            `4. \`impact\` downstream to see what it depends on\n` +
            `5. \`grep\` for "${name}" to find all text references including templates and configs\n` +
            `6. Summarize: what it does, who uses it, what it depends on, and how important it is`,
        },
      }],
    }),
  );

  return server;
}

// ── Transport: stdio ──

export async function startStdio(rootPath?: string): Promise<void> {
  const server = createMcpServer(rootPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ── Transport: HTTP (Streamable) ──

export async function startHttp(port: number, rootPath?: string): Promise<void> {
  const server = createMcpServer(rootPath);
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; lastActive: number }>();

  // Evict idle sessions every 5 minutes
  const SESSION_TTL = 30 * 60_000; // 30 minutes
  const evictTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (now - entry.lastActive > SESSION_TTL) {
        sessions.delete(id);
      }
    }
  }, 5 * 60_000);
  evictTimer.unref(); // don't prevent process exit

  const httpServer = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body);

        // Check for existing session or create new one
        let sessionId = req.headers['mcp-session-id'] as string | undefined;
        let entry = sessionId ? sessions.get(sessionId) : undefined;
        let transport = entry?.transport;

        if (entry) {
          entry.lastActive = Date.now();
        }

        if (!transport) {
          sessionId = randomUUID();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId!,
            onsessioninitialized: (id) => {
              sessions.set(id, { transport: transport!, lastActive: Date.now() });
            },
          });
          await server.connect(transport);
        }

        await transport.handleRequest(req, res, parsed);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400);
          res.end('Bad request');
        }
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // Bind to localhost only — prevents network exposure without auth
  httpServer.listen(port, '127.0.0.1', () => {
    console.log(`milens MCP server listening on http://127.0.0.1:${port}/mcp`);
  });
}

function readBody(req: any): Promise<string> {
  const MAX_BODY = 1024 * 1024; // 1MB
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
