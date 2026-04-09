import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import ignore from 'ignore';
import { Database } from '../store/db.js';
import { RepoRegistry } from '../store/registry.js';

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

function fmtSymbol(s: { id?: string; name: string; kind: string; filePath: string; startLine: number }) {
  return `${s.name} [${s.kind}] ${s.filePath}:${s.startLine}`;
}

function fmtImpact(items: Array<{ symbol: any; depth: number; via: string }>) {
  const grouped = new Map<number, string[]>();
  for (const { symbol, depth, via } of items) {
    const arr = grouped.get(depth) ?? [];
    arr.push(`${fmtSymbol(symbol)} (${via})`);
    grouped.set(depth, arr);
  }
  const lines: string[] = [];
  for (const [depth, refs] of [...grouped].sort((a, b) => a[0] - b[0])) {
    lines.push(`depth ${depth}:`);
    for (const r of refs) lines.push(`  ${r}`);
  }
  return lines.join('\n');
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

/** Validate user-supplied regex is safe from catastrophic backtracking (ReDoS). */
function safeRegex(pattern: string, flags: string): RegExp {
  if (pattern.length > 200) throw new Error('Pattern too long');
  // Reject nested quantifiers like (a+)+, (a*)*,  (a{1,})+
  if (/([+*}])\)?[+*{]/.test(pattern)) throw new Error('Unsafe regex pattern');
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

const MILENS_INSTRUCTIONS = `milens is a code intelligence engine. It indexes codebases into knowledge graphs and provides tools for navigating and understanding code.

## Critical Workflow Rules

### Always combine \`impact\` with \`grep\`
\`impact\` only tracks code-level symbol dependencies (calls, imports, extends).
\`grep\` finds ALL text references including templates, styles, configs, routes, and docs.
**After running \`impact\`, always run \`grep\` for the same symbol to catch non-code references.**

### Before editing a symbol
1. Run \`context\` to see all incoming/outgoing relationships
2. Run \`impact\` with direction "upstream" to find what depends on it
3. Run \`grep\` to find ALL text references (templates, SCSS, configs, routes, docs)

### When deleting a feature or renaming
1. Run \`grep\` first — finds every text occurrence across all file types
2. Run \`impact\` — finds code-level dependency graph
3. Combine both results — grep catches what impact misses and vice versa

### Tool selection guide
- **Find symbol definitions** → \`query\`
- **Find ALL text references** (templates, styles, configs, docs) → \`grep\`
- **Understand a symbol's relationships** → \`context\`
- **What breaks if I change this?** → \`impact\` (upstream) + \`grep\`
- **What does this call/depend on?** → \`impact\` (downstream)
- **How are two symbols connected?** → \`explain_relationship\`
- **What changed recently?** → \`detect_changes\`
- **Find unused exports** → \`find_dead_code\`
- **See all symbols in a file** → \`get_file_symbols\`
- **Class inheritance tree** → \`get_type_hierarchy\`

### Impact depth guide
- depth 1: WILL BREAK — direct callers/importers → must update
- depth 2: LIKELY AFFECTED — indirect dependents → should test
- depth 3: MAY NEED TESTING — transitive → test if critical path
`;

// ── Server setup ──

export function createMcpServer(rootPath?: string): McpServer {
  const registry = new RepoRegistry();
  const pools = new Map<string, LazyDb>();

  function resolveRoot(repoPath?: string): string {
    const root = resolve(repoPath ?? rootPath ?? '.');
    // Prevent path traversal — repo must be registered in the index
    const entry = registry.findByRoot(root);
    if (!entry) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);
    return root;
  }

  function getDb(repoPath?: string): { db: Database; root: string } {
    const root = resolveRoot(repoPath);
    const dbPath = registry.findDbPath(root);
    if (!dbPath) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);

    if (!pools.has(root)) pools.set(root, new LazyDb(dbPath));
    return { db: pools.get(root)!.get(), root };
  }

  const server = new McpServer(
    { name: 'milens', version: '0.3.1' },
    { instructions: MILENS_INSTRUCTIONS },
  );

  // ── Tool: query ──
  server.tool(
    'query',
    'Search indexed symbol definitions (functions, classes, exports) by name, kind, or file path. ' +
    'Only finds symbols in indexed code files. For text references in templates, SCSS, configs, or docs, use `grep` instead.',
    {
      query: z.string().describe('Symbol name, kind, or keyword to search'),
      repo: z.string().optional().describe('Repository root path (optional if only one indexed)'),
      limit: z.number().optional().default(15).describe('Max results'),
    },
    async ({ query, repo, limit }) => {
      const { db } = getDb(repo);
      const results = db.searchSymbols(query, limit);
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No symbols matching "${query}". NOTE: query only searches indexed symbol definitions. Use \`grep\` to search ALL project files (templates, styles, configs, docs).` }] };
      }
      const text = results.map(s => fmtSymbol(s)).join('\n');
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ── Tool: grep ──
  server.tool(
    'grep',
    'Text search across ALL project files (templates, styles, configs, docs, routes, etc.). ' +
    'Unlike `query` which only searches indexed symbol definitions, grep finds every text occurrence. ' +
    'Essential for: deleting features, renaming across templates/SCSS/configs, finding route/config references.',
    {
      pattern: z.string().describe('Text or regex pattern to search for'),
      repo: z.string().optional().describe('Repository root path (optional)'),
      isRegex: z.boolean().optional().default(false).describe('Treat pattern as regex'),
      caseSensitive: z.boolean().optional().default(false),
      include: z.string().optional().describe('Glob filter for file paths (e.g. "**/*.vue", "*.scss")'),
      limit: z.number().optional().default(50).describe('Max results'),
    },
    async ({ pattern, repo, isRegex, caseSensitive, include, limit }) => {
      const root = resolveRoot(repo);
      const matches = grepFiles(root, pattern, {
        isRegex, caseSensitive, maxResults: limit, includePattern: include,
      });

      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No matches for "${pattern}"` }] };
      }

      // Group by file for compact output
      const grouped = new Map<string, { line: number; text: string }[]>();
      for (const m of matches) {
        const arr = grouped.get(m.file) ?? [];
        arr.push({ line: m.line, text: m.text });
        grouped.set(m.file, arr);
      }

      const lines: string[] = [`${matches.length} matches in ${grouped.size} files:\n`];
      for (const [file, hits] of grouped) {
        lines.push(file);
        for (const h of hits) {
          lines.push(`  L${h.line}: ${h.text}`);
        }
      }

      if (matches.length >= limit) {
        lines.push(`\n(truncated at ${limit} results — increase limit or narrow pattern)`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: context ──
  server.tool(
    'context',
    'Get 360° context of a symbol: incoming refs, outgoing deps, parent, children.',
    {
      name: z.string().describe('Symbol name to inspect'),
      repo: z.string().optional(),
    },
    async ({ name, repo }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `Symbol "${name}" not found in index. Use \`grep\` to search ALL project files for text references.` }] };
      }

      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`## ${fmtSymbol(sym)}${sym.exported ? ' (exported)' : ''}`);

        const incoming = db.getIncomingLinks(sym.id);
        if (incoming.length > 0) {
          lines.push('incoming:');
          for (const l of incoming) {
            const from = db.findSymbolById(l.fromId);
            lines.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
          }
        }

        const outgoing = db.getOutgoingLinks(sym.id);
        if (outgoing.length > 0) {
          lines.push('outgoing:');
          for (const l of outgoing) {
            const to = db.findSymbolById(l.toId);
            lines.push(`  ${l.type}: ${to ? fmtSymbol(to) : l.toId}`);
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
    'Blast radius analysis via symbol dependency graph. Shows what code-level symbols break if a symbol changes. ' +
    'Note: only tracks code dependencies (calls, imports, extends). For template/SCSS/config references, also use `grep`.',
    {
      target: z.string().describe('Symbol name to analyze'),
      direction: z.enum(['upstream', 'downstream']).default('upstream'),
      depth: z.number().optional().default(3),
      repo: z.string().optional(),
    },
    async ({ target, direction, depth, repo }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(target);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `Symbol "${target}" not found in index. Use \`grep\` to search ALL project files for text references.` }] };
      }

      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`TARGET: ${fmtSymbol(sym)}`);
        const refs = direction === 'upstream'
          ? db.findUpstream(sym.id, depth)
          : db.findDownstream(sym.id, depth);

        if (refs.length === 0) {
          lines.push(`No ${direction} dependencies found in symbol graph. IMPORTANT: Also run \`grep\` for "${target}" to find references in templates, styles, configs, routes, and docs that are not tracked by impact analysis.`);
        } else {
          lines.push(`${direction} (${refs.length} symbols):`);
          lines.push(fmtImpact(refs));
          lines.push(`\nNOTE: impact only tracks code-level dependencies. Also run \`grep\` for "${target}" to find template/style/config/doc references.`);
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: status ──
  server.tool(
    'status',
    'Show index stats for a repository.',
    {
      repo: z.string().optional(),
    },
    async ({ repo }) => {
      const { db, root } = getDb(repo);
      const stats = db.getStats();
      const text = `repo: ${root}\nsymbols: ${stats.symbols}\nlinks: ${stats.links}\nfiles: ${stats.files}`;
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ── Tool: detect_changes ──
  server.tool(
    'detect_changes',
    'Detect changed files via git diff and find affected symbols with upstream impact.',
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
    'Explain how two symbols are connected. Finds the shortest path in the dependency graph.',
    {
      from: z.string().describe('Source symbol name'),
      to: z.string().describe('Target symbol name'),
      repo: z.string().optional(),
    },
    async ({ from, to, repo }) => {
      const { db } = getDb(repo);
      const path = db.findPath(from, to);
      if (!path) {
        return { content: [{ type: 'text' as const, text: `No relationship found between "${from}" and "${to}" in the symbol graph. Use \`grep\` to search for text references that may connect them.` }] };
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
    'Find exported symbols with zero incoming references (potentially unused code).',
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
    'List all symbols defined in a specific file with their relationships.',
    {
      file: z.string().describe('File path (relative to repo root)'),
      repo: z.string().optional(),
    },
    async ({ file, repo }) => {
      const { db } = getDb(repo);
      const symbols = db.getSymbolsByFile(file);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `No symbols found in "${file}". Is the path relative to repo root?` }] };
      }
      const lines: string[] = [`${file}: ${symbols.length} symbols\n`];
      for (const sym of symbols) {
        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
        const exp = sym.exported ? ' (exported)' : '';
        lines.push(`${sym.name} [${sym.kind}] L${sym.startLine}-${sym.endLine}${exp} ← ${incoming.length} refs, → ${outgoing.length} deps`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: get_type_hierarchy ──
  server.tool(
    'get_type_hierarchy',
    'Show the inheritance/implementation hierarchy of a class, interface, or trait.',
    {
      name: z.string().describe('Symbol name to show hierarchy for'),
      repo: z.string().optional(),
    },
    async ({ name, repo }) => {
      const { db } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `Symbol "${name}" not found in index. Use \`grep\` to search ALL project files for text references.` }] };
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
          lines.push('implemented/extended by:');
          for (const { symbol: d, depth } of descendants) {
            lines.push(`  ${'↓'.repeat(depth)} ${fmtSymbol(d)}`);
          }
        }

        if (ancestors.length === 0 && descendants.length === 0) {
          lines.push('No inheritance relationships found.');
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
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
