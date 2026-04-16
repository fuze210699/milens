import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve, relative, join, dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import ignore from 'ignore';
import { Database } from '../store/db.js';
import { RepoRegistry } from '../store/registry.js';
import { isTestFile } from '../utils.js';
import { reviewPr, reviewSymbol } from '../analyzer/review.js';
import { generateTestPlan, findCoverageGaps, analyzeTestImpact } from '../analyzer/testplan.js';
import { TfIdfProvider, EmbeddingStore, buildEmbeddingText } from '../store/vectors.js';
import { getParser, loadLanguage } from '../parser/loader.js';
import { ALL_LANGS } from '../parser/languages.js';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION: string = process.env.MILENS_VERSION ?? JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')).version;

// ── Lazy DB connection with idle eviction ──

class LazyDb {
  private instance: Database | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private static IDLE_TIMEOUT = 5 * 60_000;
  // Stats cache: avoid re-querying getStats/getDomainStats on every tool call
  private statsCache: { data: ReturnType<Database['getStats']>; ts: number } | null = null;
  private domainCache: { data: ReturnType<Database['getDomainStats']>; ts: number } | null = null;
  private static CACHE_TTL = 30_000; // 30s TTL
  // Cached TF-IDF provider (trained once per DB session, reused across semantic_search/find_similar calls)
  private tfidfCache: { provider: TfIdfProvider; store: EmbeddingStore } | null = null;

  constructor(private dbPath: string) {}

  get(): Database {
    this.resetTimer();
    if (!this.instance) {
      this.instance = new Database(this.dbPath);
      this.statsCache = null;
      this.domainCache = null;
    }
    return this.instance;
  }

  /** Cached getStats — avoids 3 COUNT(*) queries per tool call */
  getCachedStats(): ReturnType<Database['getStats']> {
    const now = Date.now();
    if (this.statsCache && now - this.statsCache.ts < LazyDb.CACHE_TTL) {
      return this.statsCache.data;
    }
    const data = this.get().getStats();
    this.statsCache = { data, ts: now };
    return data;
  }

  /** Cached getDomainStats — avoids expensive GROUP BY query per tool call */
  getCachedDomainStats(): ReturnType<Database['getDomainStats']> {
    const now = Date.now();
    if (this.domainCache && now - this.domainCache.ts < LazyDb.CACHE_TTL) {
      return this.domainCache.data;
    }
    const data = this.get().getDomainStats();
    this.domainCache = { data, ts: now };
    return data;
  }

  /** Invalidate caches (e.g. after analyze) */
  invalidateCache(): void {
    this.statsCache = null;
    this.domainCache = null;
    this.tfidfCache = null;
  }

  /** Get or build a TF-IDF provider + embedding store, trained on the corpus. */
  getTfidf(): { provider: TfIdfProvider; store: EmbeddingStore } {
    if (this.tfidfCache) return this.tfidfCache;
    const db = this.get();
    const provider = new TfIdfProvider();
    const allSyms = db.getAllSymbols();
    provider.trainIdf(allSyms.map(s => buildEmbeddingText({ name: s.name, kind: s.kind, filePath: s.filePath, signature: s.signature })));
    const store = new EmbeddingStore(db.getRawDb(), provider.dimensions);
    this.tfidfCache = { provider, store };
    return this.tfidfCache;
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.evict(), LazyDb.IDLE_TIMEOUT);
  }

  private evict(): void {
    this.instance?.close();
    this.instance = null;
    this.timer = null;
    this.statsCache = null;
    this.domainCache = null;
    this.tfidfCache = null;
  }

  shutdown(): void {
    if (this.timer) clearTimeout(this.timer);
    this.instance?.close();
    this.instance = null;
  }
}

// ── Tool usage tracking ──

// Estimated tokens an agent would spend WITHOUT milens (manual exploration cost per tool)
const TOKEN_SAVINGS_MULTIPLIER: Record<string, number> = {
  query: 3,           // vs 3+ separate grep/file reads
  grep: 2,            // vs terminal grep + manual filtering
  context: 5,         // vs incoming + outgoing + file reads
  impact: 6,          // vs recursive manual upstream/downstream exploration
  edit_check: 8,      // vs context + impact + grep + coverage check
  smart_context: 6,   // vs multiple tool calls based on intent
  overview: 8,        // vs context + impact + grep combined
  trace: 5,           // vs manually tracing call chains
  routes: 3,          // vs searching for route patterns
  domains: 3,         // vs exploring file structure
  status: 2,          // vs checking multiple stats
  detect_changes: 4,  // vs git diff + manual symbol mapping
  review_pr: 10,        // vs detect_changes + impact per symbol + coverage check
  review_symbol: 5,     // vs edit_check + impact + coverage
  test_plan: 7,          // vs context + outgoing links + mock analysis
  test_coverage_gaps: 5, // vs scanning all symbols + checking test refs
  test_impact: 6,        // vs detect_changes + upstream traversal + test file mapping
  annotate: 2,           // simple write
  recall: 3,             // vs manual grep for notes
  session_start: 1,      // simple write
  session_context: 2,    // session lookup
  handoff: 3,            // session transfer
  codebase_summary: 8,   // vs domains + status + query for top symbols
  semantic_search: 5,    // vs multiple query + grep calls to find related code
  find_similar: 4,       // vs manual comparison of symbol signatures
  ast_explore: 2,        // vs reading raw AST manually
  test_query: 2,         // vs writing SQL + checking schema
  explain_relationship: 4, // vs manual path finding
  find_dead_code: 3,  // vs manual export usage search
  get_file_symbols: 2,// vs reading entire file
  get_type_hierarchy: 4, // vs manual inheritance traversal
  repos: 1,           // simple listing
};

function estimateTokens(text: string): number {
  // Rough token estimate: ~4 chars per token for English/code
  return Math.ceil(text.length / 4);
}

function getTrackingDb(): Database | null {
  try {
    const dir = join(homedir(), '.milens');
    mkdirSync(dir, { recursive: true });
    return new Database(join(dir, 'tracking.db'));
  } catch {
    return null; // tracking is best-effort, never block
  }
}

function trackToolCall(trackDb: Database | null, tool: string, startMs: number, responseText: string, repo?: string): void {
  if (!trackDb) return;
  try {
    const durationMs = Date.now() - startMs;
    const tokensOut = estimateTokens(responseText);
    const multiplier = TOKEN_SAVINGS_MULTIPLIER[tool] ?? 2;
    const tokensSaved = tokensOut * (multiplier - 1); // net savings = what agent would spend minus what milens returned
    trackDb.logToolUsage(tool, durationMs, tokensOut, tokensSaved, repo);
  } catch { /* best-effort */ }
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

async function grepFiles(
  rootPath: string,
  pattern: string,
  options: { isRegex?: boolean; caseSensitive?: boolean; maxResults?: number; includePattern?: string },
): Promise<GrepMatch[]> {
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

  async function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: string[];
    try { entries = await readdir(dir); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const abs = join(dir, entry);
      const rel = relative(rootPath, abs).replace(/\\/g, '/');

      if (entry.startsWith('.') && entry !== '.') continue;
      if (GREP_SKIP_DIRS.has(entry)) continue;
      if (ig.ignores(rel)) continue;

      let st;
      try { st = await stat(abs); } catch { continue; }

      if (st.isDirectory()) {
        await walk(abs);
      } else if (st.isFile()) {
        const ext = '.' + entry.split('.').pop()?.toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;
        if (st.size > 512 * 1024) continue; // skip files > 512KB
        if (includeRe && !includeRe.test(rel)) continue;

        try {
          const content = await readFile(abs, 'utf-8');
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

  await walk(rootPath);
  return results;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Line-level scope matching for scoped grep */
function matchesScope(lineText: string, scope: 'imports' | 'definitions'): boolean {
  const trimmed = lineText.trimStart();
  if (scope === 'imports') {
    return /^(import\s|from\s|require\(|use\s|include\s|require_relative|require\s)/.test(trimmed)
      || /^"[^"]*"\s*$/.test(trimmed)  // Go import block line: "fmt"
      || /^\w+\s+"[^"]*"\s*$/.test(trimmed);  // Go aliased import: alias "pkg"
  }
  // definitions: function, class, interface, struct, trait, enum, type, def, fn, pub fn, etc.
  return /^(export\s+)?(async\s+)?(function|class|interface|type|enum|struct|trait|const|let|var|def|fn|pub\s+fn|pub\s+struct|pub\s+enum|module)\s/.test(trimmed);
}

/** Validate user-supplied regex is safe from catastrophic backtracking (ReDoS). */
function safeRegex(pattern: string, flags: string): RegExp {
  if (pattern.length > 200) throw new Error('Pattern too long');
  // Reject nested quantifiers: quantifier applied to a group that contains a quantifier
  // e.g. (a+)+, (a*)+, (a{2,})+, (?:a+)*, (.+)+
  if (/([+*}])\s*\)\s*[+*?{]/.test(pattern)) throw new Error('Unsafe regex pattern');
  // Reject quantifier directly after quantifier: a++, a*+, a+{2}, but allow lazy quantifiers: a+?, a*?, a??
  if (/[+*}]\s*[+*{]/.test(pattern)) throw new Error('Unsafe regex pattern');
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
  // Extract brace patterns {a,b,c} as placeholders BEFORE escaping
  const braceGroups: string[] = [];
  let expanded = glob.replace(/\{([^}]+)\}/g, (_, inner: string) => {
    const alts = inner.split(',').map(s => s.trim());
    const idx = braceGroups.length;
    braceGroups.push(alts.map(a => a.replace(/[.+^$|[\]\\]/g, '\\$&')).join('|'));
    return `§BRACE${idx}§`;
  });
  const escaped = expanded
    .replace(/[.+^$|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§STARSTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§STARSTAR§/g, '.*')
    .replace(/\?/g, '.');
  // Restore brace groups after escaping
  let result = escaped;
  for (let i = 0; i < braceGroups.length; i++) {
    result = result.replace(`§BRACE${i}§`, `(${braceGroups[i]})`);
  }
  return new RegExp(`^${result}$`, 'i');
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
- \`domains\` — show domain clusters: groups of files forming logical modules based on dependency graph
- \`repos\` — list all indexed repositories with summary stats (multi-repo support)
- \`detect_changes\` — git diff → affected symbols
- \`review_pr\` — PR risk assessment: blast radius + test coverage per changed symbol → LOW/MEDIUM/HIGH/CRITICAL
- \`review_symbol\` — quick single-symbol risk: role, heat, dependents, test coverage, risk level
- \`test_plan\` — dependency-aware test plan: deps to mock, mock strategies (stub/spy/fake), suggested tests
- \`test_coverage_gaps\` — untested exported symbols sorted by risk (hub functions first)
- \`test_impact\` — which tests to run for current changes (maps changed symbols → test files)
- \`annotate\` — store observations/notes about a symbol (persists across sessions)
- \`recall\` — retrieve annotations (filter by symbol, key, agent, session)
- \`session_start\` — register agent session for multi-agent coordination
- \`session_context\` — get session metadata + annotations
- \`handoff\` — transfer context between agent sessions
- \`codebase_summary\` — high-level bootstrapping context: domains, key symbols, coverage, annotations
- \`semantic_search\` — hybrid search: FTS5 + vector cosine similarity (requires --embeddings during analyze)
- \`find_similar\` — find symbols similar to a given symbol by vector embedding proximity
- \`explain_relationship\` — shortest path between two symbols
- \`find_dead_code\` — unused exports
- \`get_file_symbols\` — all symbols in a file
- \`get_type_hierarchy\` — inheritance tree

## Rules
- Before editing a symbol: run \`edit_check\` or \`smart_context\` with intent=edit
- For debugging: run \`smart_context\` with intent=debug or \`trace\` to=symbol
- For writing tests: run \`test_plan\` for structured test plan, or \`smart_context\` with intent=test
- For PR review: run \`review_pr\` for overall risk, \`review_symbol\` for single symbol assessment
- For agent bootstrapping: run \`codebase_summary\` as the first tool call in a new session
- \`impact\` only tracks code deps — always pair with \`grep\` for templates/configs
- Use \`query\` for camelCase/PascalCase identifiers, \`grep\` for display text or multi-word strings
- impact depth: 1=WILL BREAK, 2=LIKELY AFFECTED, 3=MAY NEED TESTING
- ⚠ markers indicate unresolved INTERNAL references — external package imports/calls are tracked separately
- ✓ test coverage shown on edit_check — symbols with no test coverage get a warning
- ⏳ staleness: files not re-analyzed in 24h are flagged — consider re-running \`milens analyze\`

## Resources (MCP Resources protocol)
- \`milens://overview\` — index overview (stats, domains, coverage, staleness)
- \`milens://symbol/{name}\` — symbol context by name
- \`milens://file/{path}\` — all symbols in a file
- \`milens://domain/{name}\` — domain cluster details
`;

// ── Server setup ──

export function createMcpServer(rootPath?: string): McpServer {
  const registry = new RepoRegistry();
  const pools = new Map<string, LazyDb>();
  const trackDb = getTrackingDb();

  function normalizePath(p: string): string {
    const abs = resolve(p);
    if (process.platform === 'win32') {
      return abs.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ':');
    }
    return abs;
  }

  function resolveRoot(repoPath?: string): string {
    if (repoPath) {
      const root = normalizePath(repoPath);
      const entry = registry.findByRoot(root);
      if (!entry) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);
      return root;
    }
    if (rootPath) {
      const root = normalizePath(rootPath);
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

  function getDb(repoPath?: string): { db: Database; root: string; lazy: LazyDb } {
    const root = resolveRoot(repoPath);
    const dbPath = registry.findDbPath(root);
    if (!dbPath) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);

    if (!pools.has(root)) pools.set(root, new LazyDb(dbPath));
    const lazy = pools.get(root)!;
    return { db: lazy.get(), root, lazy };
  }

  const server = new McpServer(
    { name: 'milens', version: PKG_VERSION },
    { instructions: MILENS_INSTRUCTIONS },
  );

  // Auto-wrap every tool handler with usage tracking
  const origTool = server.tool.bind(server);
  server.tool = ((...args: any[]) => {
    const toolName = args[0] as string;
    const handler = args[args.length - 1];
    if (typeof handler === 'function') {
      args[args.length - 1] = async (...handlerArgs: any[]) => {
        const start = Date.now();
        const result = await handler(...handlerArgs);
        const responseText = result?.content?.map((c: any) => c.text).join('\n') ?? '';
        const repo = handlerArgs[0]?.repo;
        trackToolCall(trackDb, toolName, start, responseText, repo);
        return result;
      };
    }
    return (origTool as any)(...args);
  }) as typeof server.tool;

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
      const matches = await grepFiles(root, pattern, {
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
      const { db, root, lazy } = getDb(repo);
      const stats = lazy.getCachedStats();
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
      const domains = lazy.getCachedDomainStats();
      if (domains.length > 0) {
        text += `\ndomains: ${domains.map(d => `${d.domain}(${d.files}f/${d.symbols}s)`).join(', ')}`;
      }
      const staleFiles = db.getStaleFiles(24);
      if (staleFiles.length > 0) {
        text += `\n⏳ ${staleFiles.length} files not analyzed in 24h`;
      }
      // Accuracy report — confidence distribution of resolved links
      const conf = db.getConfidenceDistribution();
      if (conf.total > 0) {
        const highPct = Math.round(conf.high / conf.total * 100);
        const medPct = Math.round(conf.medium / conf.total * 100);
        const lowPct = Math.round(conf.low / conf.total * 100);
        text += `\naccuracy: ${conf.total} links — ≥0.9: ${conf.high} (${highPct}%) | 0.7-0.9: ${conf.medium} (${medPct}%) | <0.7: ${conf.low} (${lowPct}%)`;
        if (lowPct > 15) {
          text += `\n⚠ ${lowPct}% low-confidence links — consider re-analyzing with \`--force\` or reviewing unresolved calls`;
        }
      }
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ── Tool: domains ──
  server.tool(
    'domains',
    'Show domain clusters — groups of files forming logical modules based on dependency graph. Helps understand codebase structure at a glance.',
    {
      repo: z.string().optional(),
    },
    async ({ repo }) => {
      const { db, lazy } = getDb(repo);
      const domains = lazy.getCachedDomainStats();
      if (domains.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No domains detected. Run `milens analyze` first.' }] };
      }
      const totalFiles = domains.reduce((s, d) => s + d.files, 0);
      const totalSymbols = domains.reduce((s, d) => s + d.symbols, 0);
      const lines: string[] = [`${domains.length} domains (${totalFiles} files, ${totalSymbols} symbols):\n`];
      for (const d of domains) {
        const pct = totalSymbols > 0 ? Math.round(d.symbols / totalSymbols * 100) : 0;
        lines.push(`  ${d.domain}: ${d.files} files, ${d.symbols} symbols (${pct}%)`);
      }
      const staleFiles = db.getStaleFiles(24);
      if (staleFiles.length > 0) {
        lines.push(`\n⏳ ${staleFiles.length} files stale (>24h) — re-run \`milens analyze\` for fresh clusters`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
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
      const grepMatches = await grepFiles(root, name, { maxResults: 20 });
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

  // ── Tool: repos ──
  server.tool(
    'repos',
    'List all indexed repositories with summary stats. Useful for multi-repo workspaces.',
    {},
    async () => {
      const entries = registry.listAll();
      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No indexed repositories. Run `milens analyze` first.' }] };
      }
      const lines: string[] = [`${entries.length} indexed repositories:\n`];
      for (const entry of entries) {
        lines.push(`${entry.rootPath}`);
        lines.push(`  indexed: ${entry.analyzedAt}`);
        try {
          const dbPath = registry.findDbPath(entry.rootPath);
          if (dbPath) {
            const fromPool = pools.has(entry.rootPath);
            const tempDb = fromPool
              ? pools.get(entry.rootPath)!.get()
              : new Database(dbPath);
            try {
              const summary = tempDb.getRepoSummary();
              lines.push(`  ${summary.symbols} symbols, ${summary.links} links, ${summary.files} files`);
              if (summary.domains.length > 0) {
                lines.push(`  domains: ${summary.domains.join(', ')}`);
              }
              if (summary.staleCount > 0) {
                lines.push(`  ⏳ ${summary.staleCount} stale files`);
              }
            } finally {
              if (!fromPool) tempDb.close();
            }
          }
        } catch {
          lines.push(`  (unable to read index)`);
        }
        lines.push('');
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
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
        // Show both staged and unstaged changes against the ref
        const output = execFileSync('git', ['diff', '--name-only', ref], { cwd: root, encoding: 'utf-8' });
        const staged = execFileSync('git', ['diff', '--cached', '--name-only', ref], { cwd: root, encoding: 'utf-8' });
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

  // ── Tool: review_pr ──
  server.tool(
    'review_pr',
    'PR risk assessment: analyzes changed files, scores each symbol by blast radius, test coverage, and role. Returns overall risk level (LOW/MEDIUM/HIGH/CRITICAL) with hotspots and recommendations.',
    {
      ref: z.string().optional().default('HEAD').describe('Git ref to diff (default: HEAD)'),
      base: z.string().optional().describe('Base ref to compare against (e.g. main, develop)'),
      repo: z.string().optional(),
    },
    async ({ ref, repo, base }) => {
      const { db, root } = getDb(repo);
      const result = reviewPr(db, root, ref, base);

      if (result.symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: result.summary }] };
      }

      const lines: string[] = [
        `## PR Risk: ${result.risk} (score: ${result.score})`,
        '',
        result.summary,
        '',
      ];

      if (result.hotspots.length > 0) {
        lines.push(`### Hotspots (${result.hotspots.length})\n`);
        for (const h of result.hotspots) {
          const tested = h.tested ? '✓ tested' : '⚠ untested';
          lines.push(`${fmtSymbol(h.symbol)} → ${h.dependents} dependents, ${tested} [${h.riskLevel}]`);
          if (h.reasons.length > 0) lines.push(`  reasons: ${h.reasons.join(', ')}`);
        }
        lines.push('');
      }

      // Show remaining non-hotspot symbols (compact)
      const nonHotspots = result.symbols.filter(s => s.riskLevel !== 'HIGH' && s.riskLevel !== 'CRITICAL');
      if (nonHotspots.length > 0) {
        lines.push(`### Other changed symbols (${nonHotspots.length})\n`);
        for (const s of nonHotspots.slice(0, 20)) {
          const tested = s.tested ? '✓' : '⚠';
          lines.push(`${tested} ${s.symbol.name} [${s.symbol.kind}] ${s.symbol.filePath}:${s.symbol.startLine} → ${s.dependents} deps [${s.riskLevel}]`);
        }
        if (nonHotspots.length > 20) lines.push(`  ... and ${nonHotspots.length - 20} more`);
        lines.push('');
      }

      if (result.untestedChanges > 0) {
        lines.push(`⚠ ${result.untestedChanges} exported symbols changed without test coverage`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: review_symbol ──
  server.tool(
    'review_symbol',
    'Quick risk assessment for a single symbol: role, heat, dependents count, test coverage, risk level.',
    {
      name: z.string().describe('Symbol name to assess'),
      repo: z.string().optional(),
    },
    async ({ name, repo }) => {
      const { db } = getDb(repo);
      const result = reviewSymbol(db, name);

      if (!result) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found in index. Try \`grep\`.` }] };
      }

      const tested = result.tested ? '✓ tested' : '⚠ untested';
      const lines = [
        `${fmtSymbol(result.symbol)}${result.symbol.exported ? ' (exported)' : ''}`,
        `risk: ${result.riskLevel} (score: ${result.riskScore})`,
        `role: ${result.symbol.role ?? 'unknown'}, heat: ${result.symbol.heat ?? 0}`,
        `dependents: ${result.dependents}, ${tested}`,
      ];
      if (result.reasons.length > 0) {
        lines.push(`reasons: ${result.reasons.join(', ')}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: test_plan ──
  server.tool(
    'test_plan',
    'Generate a structured test plan for a symbol: dependencies to mock, mock strategies (stub/spy/fake), suggested unit/integration/edge-case tests.',
    {
      name: z.string().describe('Symbol name to generate test plan for'),
      repo: z.string().optional(),
    },
    async ({ name, repo }) => {
      const { db } = getDb(repo);
      const plan = generateTestPlan(db, name);

      if (!plan) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found in index. Try \`grep\`.` }] };
      }

      const lines: string[] = [
        `## Test Plan: ${plan.target.name} [${plan.target.kind}]`,
        `file: ${plan.target.filePath}${plan.target.role ? `, role: ${plan.target.role}` : ''}`,
        '',
      ];

      if (plan.existingTests.length > 0) {
        lines.push(`### Existing tests`);
        for (const t of plan.existingTests) lines.push(`  ✓ ${t}`);
        lines.push('');
      } else {
        lines.push(`### Existing tests: none\n`);
      }

      if (plan.dependencies.length > 0) {
        lines.push(`### Dependencies (${plan.dependencies.length})`);
        for (const dep of plan.dependencies) {
          lines.push(`  ${dep.name} [${dep.kind}] ${dep.filePath} (${dep.linkType})`);
        }
        lines.push('');
      }

      if (plan.mockSuggestions.length > 0) {
        lines.push(`### Mock Suggestions`);
        for (const m of plan.mockSuggestions) {
          lines.push(`  ${m.dependency}: ${m.strategy} — ${m.reason}`);
        }
        lines.push('');
      }

      if (plan.suggestedTests.length > 0) {
        lines.push(`### Suggested Tests`);
        for (const t of plan.suggestedTests) {
          lines.push(`  [${t.type}] ${t.description}`);
          if (t.mocksNeeded.length > 0) lines.push(`    mocks: ${t.mocksNeeded.join(', ')}`);
        }
        lines.push('');
      }

      if (plan.callers.length > 0) {
        lines.push(`### Callers (for integration context)`);
        for (const c of plan.callers.slice(0, 10)) {
          lines.push(`  ${c.name} [${c.kind}] ${c.filePath}`);
        }
        if (plan.callers.length > 10) lines.push(`  ... and ${plan.callers.length - 10} more`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: test_coverage_gaps ──
  server.tool(
    'test_coverage_gaps',
    'Find exported symbols without test coverage, sorted by risk (hub functions first). Shows what most needs tests.',
    {
      file: z.string().optional().describe('Scope to a specific file (relative to repo root)'),
      limit: z.number().optional().default(30),
      repo: z.string().optional(),
    },
    async ({ file, limit, repo }) => {
      const { db } = getDb(repo);
      const gaps = findCoverageGaps(db, file, limit);

      if (gaps.length === 0) {
        return { content: [{ type: 'text' as const, text: file ? `No coverage gaps in "${file}".` : 'No untested exported symbols found.' }] };
      }

      const lines: string[] = [`${gaps.length} untested exported symbols:\n`];
      for (const g of gaps) {
        lines.push(`[${g.riskIfUntested}] ${fmtSymbol(g.symbol)} → ${g.dependents} dependents`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: test_impact ──
  server.tool(
    'test_impact',
    'Which tests to run for current changes? Maps changed symbols → test files that reference them (directly or via callers).',
    {
      ref: z.string().optional().default('HEAD').describe('Git ref to diff against (default: HEAD)'),
      repo: z.string().optional(),
    },
    async ({ ref, repo }) => {
      const { db, root } = getDb(repo);
      const result = analyzeTestImpact(db, root, ref);

      if (result.changedSymbols.length === 0 && result.mustRun.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No changed symbols detected.' }] };
      }

      const lines: string[] = [];

      if (result.mustRun.length > 0) {
        lines.push(`### Must Run (${result.mustRun.length})`);
        for (const f of result.mustRun) lines.push(`  ✓ ${f}`);
        lines.push('');
      }

      if (result.shouldRun.length > 0) {
        lines.push(`### Should Run (${result.shouldRun.length}) — indirect coverage`);
        for (const f of result.shouldRun) lines.push(`  ~ ${f}`);
        lines.push('');
      }

      if (result.coverageGaps.length > 0) {
        lines.push(`### Coverage Gaps (${result.coverageGaps.length})`);
        for (const g of result.coverageGaps) {
          lines.push(`  ⚠ ${g.name} (${g.filePath}) — ${g.dependents} dependents, no test`);
        }
        lines.push('');
      }

      lines.push(`${result.changedSymbols.length} symbols changed, ${result.mustRun.length} tests must run, ${result.shouldRun.length} tests should run`);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: annotate ──
  server.tool(
    'annotate',
    'Store an observation/note about a symbol. Annotations persist across sessions and are visible via context() and recall().',
    {
      symbol: z.string().describe('Symbol name to annotate'),
      key: z.string().describe('Annotation key (e.g. "perf", "todo", "note", "risk")'),
      value: z.string().describe('Annotation value/note'),
      agent: z.string().optional().describe('Agent name that created this annotation'),
      session_id: z.string().optional().describe('Session ID for grouping'),
      ttl_hours: z.number().optional().describe('Time-to-live in hours (default: permanent)'),
      repo: z.string().optional(),
    },
    async ({ symbol, key, value, agent, session_id, ttl_hours, repo }) => {
      const { db } = getDb(repo);
      const syms = db.findSymbolByName(symbol);
      if (syms.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${symbol}" not found in index.` }] };
      }
      const sym = syms[0];
      const id = db.addAnnotation(sym.id, key, value, agent, session_id, ttl_hours);
      return { content: [{ type: 'text' as const, text: `Annotation #${id} stored: ${sym.name}.${key} = "${value}"` }] };
    },
  );

  // ── Tool: recall ──
  server.tool(
    'recall',
    'Retrieve annotations/notes about symbols. Filter by symbol, key, agent, or session.',
    {
      symbol: z.string().optional().describe('Symbol name to filter by'),
      key: z.string().optional().describe('Annotation key to filter by'),
      agent: z.string().optional().describe('Agent name to filter by'),
      session_id: z.string().optional().describe('Session ID to filter by'),
      limit: z.number().optional().default(30),
      repo: z.string().optional(),
    },
    async ({ symbol, key, agent, session_id, limit, repo }) => {
      const { db } = getDb(repo);
      let symbolId: string | undefined;
      if (symbol) {
        const syms = db.findSymbolByName(symbol);
        if (syms.length > 0) symbolId = syms[0].id;
      }
      const annotations = db.getAnnotations({ symbolId, key, agent, sessionId: session_id, limit });

      if (annotations.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No annotations found.' }] };
      }

      const lines: string[] = [`${annotations.length} annotations:\n`];
      for (const a of annotations) {
        const agentTag = a.agent ? ` [${a.agent}]` : '';
        lines.push(`#${a.id} ${a.symbolId.split('#')[0]}::${a.key} = "${a.value}"${agentTag} (${a.createdAt})`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: session_start ──
  server.tool(
    'session_start',
    'Register a new agent session for multi-agent coordination. Returns session ID.',
    {
      agent: z.string().describe('Agent name/identifier'),
      context: z.string().optional().describe('Initial context JSON for the session'),
      repo: z.string().optional(),
    },
    async ({ agent, context, repo }) => {
      const { db } = getDb(repo);
      const id = randomUUID();
      db.startSession(id, agent, context);
      return { content: [{ type: 'text' as const, text: `Session started: ${id} (agent: ${agent})` }] };
    },
  );

  // ── Tool: session_context ──
  server.tool(
    'session_context',
    'Get full context for an agent session: metadata + all annotations created during it.',
    {
      session_id: z.string().describe('Session ID'),
      repo: z.string().optional(),
    },
    async ({ session_id, repo }) => {
      const { db } = getDb(repo);
      const session = db.getSession(session_id);
      if (!session) {
        return { content: [{ type: 'text' as const, text: `Session "${session_id}" not found.` }] };
      }

      const annotations = db.getAnnotations({ sessionId: session_id, limit: 100 });

      const lines: string[] = [
        `## Session: ${session.id}`,
        `agent: ${session.agent}, status: ${session.status}`,
        `started: ${session.startedAt}${session.endedAt ? `, ended: ${session.endedAt}` : ''}`,
      ];
      if (session.context) lines.push(`context: ${session.context}`);
      if (annotations.length > 0) {
        lines.push('', `### Annotations (${annotations.length})`);
        for (const a of annotations) {
          lines.push(`  ${a.symbolId.split('#')[0]}::${a.key} = "${a.value}"`);
        }
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── Tool: handoff ──
  server.tool(
    'handoff',
    'Transfer context from one agent session to another. Ends the source session and creates a new one with carried-over context.',
    {
      from_session: z.string().describe('Source session ID to transfer from'),
      to_agent: z.string().describe('Target agent name'),
      context: z.string().optional().describe('Additional context to pass'),
      repo: z.string().optional(),
    },
    async ({ from_session, to_agent, context, repo }) => {
      const { db } = getDb(repo);
      const fromSession = db.getSession(from_session);
      if (!fromSession) {
        return { content: [{ type: 'text' as const, text: `Source session "${from_session}" not found.` }] };
      }

      // End source session
      db.endSession(from_session, 'completed');

      // Gather annotations from source
      const annotations = db.getAnnotations({ sessionId: from_session, limit: 100 });

      // Build handoff context
      const handoffContext = JSON.stringify({
        from: { session: from_session, agent: fromSession.agent },
        original_context: fromSession.context ? (() => { try { return JSON.parse(fromSession.context!); } catch { return fromSession.context; } })() : null,
        additional_context: context ?? null,
        annotations_count: annotations.length,
      });

      // Create new session
      const newId = randomUUID();
      db.startSession(newId, to_agent, handoffContext);

      return { content: [{ type: 'text' as const, text: `Handoff complete: ${fromSession.agent} → ${to_agent}\nNew session: ${newId}\nCarried: ${annotations.length} annotations` }] };
    },
  );

  // ── Tool: codebase_summary ──
  server.tool(
    'codebase_summary',
    'High-level codebase context for agent bootstrapping: domains, key symbols, recent activity, active annotations. Designed as the first tool call for new agent sessions.',
    {
      repo: z.string().optional(),
    },
    async ({ repo }) => {
      const { db, root, lazy } = getDb(repo);
      const stats = lazy.getCachedStats();
      const domains = lazy.getCachedDomainStats();
      const coverage = db.getTestCoverage();

      const lines: string[] = [
        `## Codebase Summary`,
        `${stats.symbols} symbols, ${stats.links} links, ${stats.files} files`,
        '',
      ];

      // Domains
      if (domains.length > 0) {
        lines.push(`### Domains`);
        for (const d of domains) {
          lines.push(`  ${d.domain}: ${d.files} files, ${d.symbols} symbols`);
        }
        lines.push('');
      }

      // Top symbols by heat
      const allSyms = db.getTopSymbolsByHeat(10);
      if (allSyms.length > 0) {
        lines.push(`### Key Symbols (top 10 by heat)`);
        for (const s of allSyms) {
          lines.push(`  ${fmtSymbol(s, 'L2')}`);
        }
        lines.push('');
      }

      // Test coverage
      if (coverage.exportedProductionSymbols > 0) {
        const pct = Math.round((coverage.testedSymbols / coverage.exportedProductionSymbols) * 100);
        lines.push(`### Test Coverage: ${pct}% (${coverage.testedSymbols}/${coverage.exportedProductionSymbols} exported symbols tested)`);
        lines.push('');
      }

      // Active annotations
      const annotations = db.getAnnotations({ limit: 10 });
      if (annotations.length > 0) {
        lines.push(`### Recent Annotations (${annotations.length})`);
        for (const a of annotations) {
          const agentTag = a.agent ? ` [${a.agent}]` : '';
          lines.push(`  ${a.symbolId.split('#')[0]}::${a.key} = "${a.value}"${agentTag}`);
        }
        lines.push('');
      }

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

      // Batch-fetch link counts to avoid N+1 queries
      const linkCounts = detail === 'L0'
        ? new Map<string, { incoming: number; outgoing: number }>()
        : db.getLinkCountsForSymbols(sorted.map(s => s.id));

      const lines: string[] = [`${file}: ${symbols.length} symbols\n`];
      for (const sym of sorted) {
        const counts = linkCounts.get(sym.id) ?? { incoming: 0, outgoing: 0 };
        const exp = sym.exported ? ' (exported)' : '';
        if (detail === 'L0') {
          lines.push(`${sym.name} [${sym.kind}]${exp}`);
        } else if (detail === 'L2') {
          const meta: string[] = [];
          if (sym.role) meta.push(sym.role);
          if (sym.heat != null && sym.heat > 0) meta.push(`heat:${sym.heat}`);
          const metaStr = meta.length > 0 ? ` {${meta.join(',')}}` : '';
          lines.push(`${sym.name} [${sym.kind}] L${sym.startLine}-${sym.endLine}${exp}${metaStr} ← ${counts.incoming} refs, → ${counts.outgoing} deps`);
        } else {
          lines.push(`${sym.name} [${sym.kind}] L${sym.startLine}-${sym.endLine}${exp} ← ${counts.incoming} refs, → ${counts.outgoing} deps`);
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
        const grepMatches = await grepFiles(root, name, { maxResults: 10, includePattern: '{**/index.{ts,js,mjs},**/__init__.py}' });
        const reExportMatches = grepMatches.filter(m =>
          (/export\s*\{[^}]*/.test(m.text) && m.text.includes('from')) ||
          /from\s+\./.test(m.text)  // Python re-export: from .module import X
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

        // 5. Test coverage (reuse incoming from step 2)
        const allIncoming = db.getIncomingLinks(sym.id);
        const testFiles = new Set<string>();
        for (const l of allIncoming) {
          const from = db.findSymbolById(l.fromId);
          if (from && isTestFile(from.filePath)) {
            testFiles.add(from.filePath);
          }
        }
        if (testFiles.size > 0) {
          sections.push(`✓ tested from: ${[...testFiles].join(', ')}`);
        } else if (sym.exported) {
          sections.push(`⚠ no test coverage for this exported symbol`);
        }
      }

      // 6. Unresolved warning (only for internal)
      const unresolved = db.getUnresolvedStats();
      if (unresolved.imports > 0 || unresolved.calls > 0) {
        sections.push(`⚠ index has ${unresolved.imports} unresolved internal imports, ${unresolved.calls} unresolved internal calls — callers list may be incomplete`);
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
    'Detect framework routes/endpoints and map them to handler symbols. Scans for Express, FastAPI, NestJS, Flask, Django, Go HTTP, Gin, PHP, Rails, Sinatra, Spring patterns.',
    {
      repo: z.string().optional(),
      framework: z.string().optional().describe('Filter by framework (express, fastapi, nestjs, flask, django, go, gin, php, rails, sinatra, spring). Default: auto-detect all.'),
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
        { name: 'django', pattern: /\b(path|re_path|url)\s*\(\s*r?['"]([^'"]+)['"]/, fileGlob: '**/*.py' },
        { name: 'nestjs', pattern: /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"]?([^'")]*?)['"]?\s*\)/, fileGlob: '**/*.ts' },
        { name: 'go', pattern: /\b(?:mux|router|http)\.(HandleFunc|Handle|Get|Post|Put|Delete)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.go' },
        { name: 'gin', pattern: /\b\w+\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any|Handle)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.go' },
        { name: 'php', pattern: /Route::(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]+)['"]/, fileGlob: '**/*.php' },
        { name: 'rails', pattern: /\b(get|post|put|patch|delete|resources?|root)\s+['"]([^'"]+)['"]/, fileGlob: '**/*.rb' },
        { name: 'sinatra', pattern: /\b(get|post|put|patch|delete)\s+['"]([^'"]+)['"]\s+do/, fileGlob: '**/*.rb' },
        { name: 'spring', pattern: /@(RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?['"]([^'"]+)['"]/, fileGlob: '**/*.java' },
      ];

      const activePatterns = framework
        ? routePatterns.filter(p => p.name === framework.toLowerCase())
        : routePatterns;

      if (activePatterns.length === 0) {
        return { content: [{ type: 'text' as const, text: `Unknown framework "${framework}". Available: express, fastapi, nestjs, flask, django, go, gin, php, rails, sinatra, spring` }] };
      }

      interface RouteMatch { framework: string; method: string; path: string; file: string; line: number; handler?: string }
      const routes: RouteMatch[] = [];

      for (const rp of activePatterns) {
        const matches = await grepFiles(root, rp.pattern.source, {
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
          const reExportMatches = (await grepFiles(root, name, { maxResults: 5, includePattern: '{**/index.{ts,js,mjs},**/__init__.py}' }))
            .filter(m => (/export\s*\{/.test(m.text) && m.text.includes('from')) || /from\s+\./.test(m.text));
          if (reExportMatches.length > 0) {
            sections.push(`re-exported via: ${reExportMatches.map(m => `${m.file}:${m.line}`).join(', ')}`);
          }

          // Test coverage
          const testRefs = incoming.filter(l => {
            const from = db.findSymbolById(l.fromId);
            return from && isTestFile(from.filePath);
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

          // Fetch outgoing once, split by type
          const allOutgoing = db.getOutgoingLinks(sym.id);
          const callLinks = allOutgoing.filter(l => l.type === 'calls');
          if (callLinks.length > 0) {
            sections.push(`calls (${callLinks.length}):`);
            for (const l of callLinks) {
              const to = db.findSymbolById(l.toId);
              sections.push(`  ${to ? fmtSymbol(to) : l.toId}`);
            }
          }

          // Data types used (reuse allOutgoing)
          const dataTypes = allOutgoing
            .filter(l => l.type === 'imports')
            .map(l => db.findSymbolById(l.toId))
            .filter(s => s && (s.kind === 'interface' || s.kind === 'type' || s.kind === 'class'))
            .slice(0, 10);
          if (dataTypes.length > 0) {
            sections.push(`data types: ${dataTypes.map(s => s!.name).join(', ')}`);
          }

        } else if (intent === 'test') {
          // Test coverage + what to mock — pre-resolve all link symbols
          const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
          const incomingResolved = incoming.map(l => ({ link: l, sym: db.findSymbolById(l.fromId) }));
          const testRefs = incomingResolved.filter(r => r.sym && isTestFile(r.sym.filePath));

          if (testRefs.length > 0) {
            const testFiles = [...new Set(testRefs.map(r => r.sym!.filePath))];
            sections.push(`✓ tested from: ${testFiles.join(', ')}`);
          } else {
            sections.push(`⚠ no existing tests`);
          }

          // Dependencies to mock — pre-resolve outgoing symbols
          const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
          const outgoingResolved = outgoing.map(l => ({ link: l, sym: db.findSymbolById(l.toId) }));
          const externalDeps = outgoingResolved.filter(r => r.sym && r.sym.filePath !== sym.filePath);
          if (externalDeps.length > 0) {
            sections.push(`dependencies to mock (${externalDeps.length}):`);
            for (const r of externalDeps) {
              sections.push(`  ${r.link.type}: ${fmtSymbol(r.sym!)}`);
            }
          }

          // Inputs — what calls this? (test should cover these call patterns)
          const nonTestCallers = incomingResolved.filter(r => r.sym && !isTestFile(r.sym.filePath));
          if (nonTestCallers.length > 0) {
            sections.push(`callers to cover (${nonTestCallers.length}):`);
            for (const r of nonTestCallers.slice(0, 5)) {
              sections.push(`  ${fmtSymbol(r.sym!)}`);
            }
          }
        }

        sections.push('');
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    },
  );

  // Language ID → WASM name mapping for ast_explore/test_query
  const langWasmMap = new Map<string, string>();
  for (const lang of ALL_LANGS) {
    if (lang.wasmName) langWasmMap.set(lang.id, lang.wasmName);
  }

  // ── Tool: ast_explore ──
  server.tool(
    'ast_explore',
    'Parse a code snippet and return its S-expression AST tree. Useful for writing tree-sitter queries, debugging parse results, and understanding AST structure. Supports all milens-indexed languages.',
    {
      code: z.string().describe('Code snippet to parse'),
      language: z.string().describe('Language ID (typescript, javascript, python, java, go, rust, php, ruby, html, css, vue)'),
      maxDepth: z.number().optional().default(0).describe('Max depth to display (0 = unlimited)'),
    },
    async ({ code, language, maxDepth }) => {
      const wasmName = langWasmMap.get(language);
      if (!wasmName) {
        const supported = [...langWasmMap.keys()].join(', ');
        return { content: [{ type: 'text' as const, text: `Unknown language "${language}". Supported: ${supported}` }] };
      }

      try {
        const parser = await getParser(wasmName);
        const tree = parser.parse(code);

        function formatNode(node: { type: string; text: string; namedChildCount: number; namedChildren: any[]; startPosition: { row: number; column: number }; endPosition: { row: number; column: number } }, depth: number): string {
          const indent = '  '.repeat(depth);
          const pos = `[${node.startPosition.row}:${node.startPosition.column}-${node.endPosition.row}:${node.endPosition.column}]`;

          if (maxDepth > 0 && depth >= maxDepth) {
            return `${indent}(${node.type} ${pos} ...)`;
          }

          if (node.namedChildCount === 0) {
            // Leaf node — show text
            const text = node.text.length > 60 ? node.text.slice(0, 57) + '...' : node.text;
            return `${indent}(${node.type} ${pos} "${text}")`;
          }

          const children = node.namedChildren.map((c: any) => formatNode(c, depth + 1));
          return `${indent}(${node.type} ${pos}\n${children.join('\n')})`;
        }

        const ast = formatNode(tree.rootNode as any, 0);

        // Truncate if too large
        const maxLen = 15_000;
        const output = ast.length > maxLen
          ? ast.slice(0, maxLen) + `\n... (truncated, ${ast.length} total chars)`
          : ast;

        return { content: [{ type: 'text' as const, text: output }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Parse error: ${err.message}` }] };
      }
    },
  );

  // ── Tool: test_query ──
  server.tool(
    'test_query',
    'Run a tree-sitter query against a code snippet and return all matches with captured node text. Useful for testing/debugging tree-sitter queries before adding them to a LangSpec.',
    {
      query: z.string().describe('Tree-sitter query pattern (S-expression)'),
      code: z.string().describe('Code snippet to query against'),
      language: z.string().describe('Language ID (typescript, javascript, python, java, go, rust, php, ruby, html, css, vue)'),
    },
    async ({ query: queryStr, code, language }) => {
      const wasmName = langWasmMap.get(language);
      if (!wasmName) {
        const supported = [...langWasmMap.keys()].join(', ');
        return { content: [{ type: 'text' as const, text: `Unknown language "${language}". Supported: ${supported}` }] };
      }

      try {
        const parser = await getParser(wasmName);
        const lang = await loadLanguage(wasmName);
        const tree = parser.parse(code);
        const compiledQuery = lang.query(queryStr);
        const matches = compiledQuery.matches(tree.rootNode);

        if (matches.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No matches found.' }] };
        }

        const lines: string[] = [`${matches.length} match(es):\n`];
        for (let i = 0; i < matches.length; i++) {
          const m = matches[i];
          lines.push(`Match ${i + 1} (pattern ${m.pattern}):`);
          for (const c of m.captures) {
            const text = c.node.text.length > 100 ? c.node.text.slice(0, 97) + '...' : c.node.text;
            lines.push(`  @${c.name}: "${text}" [${c.node.startPosition.row}:${c.node.startPosition.column}]`);
          }
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Query error: ${err.message}` }] };
      }
    },
  );

  // ── Tool: semantic_search ──
  server.tool(
    'semantic_search',
    'Hybrid search combining FTS5 text matching and vector cosine similarity (Reciprocal Rank Fusion). Requires --embeddings flag during analyze. Falls back to FTS5-only if no embeddings exist.',
    {
      query: z.string().describe('Natural language or keyword query'),
      limit: z.number().optional().describe('Max results (default 15)'),
      repo: z.string().optional(),
    },
    async ({ query, limit, repo }) => {
      const startMs = Date.now();
      const maxResults = limit ?? 15;
      const { db, lazy } = getDb(repo);

      // FTS5 results
      const ftsResults = db.searchSymbols(query, maxResults * 2);

      // Check for embeddings
      let hasEmbeddings = false;
      try {
        const row = db.getRawDb().prepare('SELECT COUNT(*) as c FROM symbol_embeddings').get() as any;
        hasEmbeddings = row && row.c > 0;
      } catch { /* table may not exist in old DBs */ }

      if (!hasEmbeddings) {
        // FTS-only fallback
        const lines = ftsResults.slice(0, maxResults).map(s => fmtSymbol(s, 'L2'));
        const text = lines.length > 0
          ? `${lines.length} results (FTS only, run \`milens analyze --embeddings\` for hybrid):\n${lines.join('\n')}`
          : 'No results.';
        trackToolCall(trackDb, 'semantic_search', startMs, text, repo);
        return { content: [{ type: 'text' as const, text }] };
      }

      // Vector results — use cached TF-IDF provider (trained once per DB session)
      const { provider, store } = lazy.getTfidf();
      const queryVec = await provider.embed(query);
      const vectorResults = store.searchSimilar(queryVec, maxResults * 2);

      // Reciprocal Rank Fusion (k=60)
      const k = 60;
      const scores = new Map<string, { score: number; symbol: any }>();

      ftsResults.forEach((sym, rank) => {
        const rrf = 1 / (k + rank + 1);
        const entry = scores.get(sym.id) ?? { score: 0, symbol: sym };
        entry.score += rrf;
        scores.set(sym.id, entry);
      });

      vectorResults.forEach((vr, rank) => {
        const rrf = 1 / (k + rank + 1);
        const entry = scores.get(vr.symbolId);
        if (entry) {
          entry.score += rrf;
        } else {
          const sym = db.findSymbolById(vr.symbolId);
          if (sym) scores.set(vr.symbolId, { score: rrf, symbol: sym });
        }
      });

      const ranked = [...scores.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, maxResults);

      const lines = ranked.map(([, { score, symbol }]) =>
        `${fmtSymbol(symbol, 'L2')} (score: ${score.toFixed(4)})`
      );
      const text = lines.length > 0
        ? `${lines.length} results (hybrid FTS+vector):\n${lines.join('\n')}`
        : 'No results.';
      trackToolCall(trackDb, 'semantic_search', startMs, text, repo);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ── Tool: find_similar ──
  server.tool(
    'find_similar',
    'Find symbols similar to a given symbol by vector embedding proximity. Requires --embeddings flag during analyze.',
    {
      name: z.string().describe('Symbol name to find similar symbols for'),
      limit: z.number().optional().describe('Max results (default 10)'),
      repo: z.string().optional(),
    },
    async ({ name, limit, repo }) => {
      const startMs = Date.now();
      const maxResults = limit ?? 10;
      const { db, lazy } = getDb(repo);

      const syms = db.findSymbolByName(name);
      if (syms.length === 0) {
        const text = `Symbol "${name}" not found.`;
        trackToolCall(trackDb, 'find_similar', startMs, text, repo);
        return { content: [{ type: 'text' as const, text }] };
      }

      const targetSym = syms[0];

      // Check for embeddings
      let hasEmbeddings = false;
      try {
        const row = db.getRawDb().prepare('SELECT COUNT(*) as c FROM symbol_embeddings').get() as any;
        hasEmbeddings = row && row.c > 0;
      } catch { /* table may not exist */ }

      if (!hasEmbeddings) {
        const text = 'No embeddings found. Run `milens analyze --embeddings` first.';
        trackToolCall(trackDb, 'find_similar', startMs, text, repo);
        return { content: [{ type: 'text' as const, text }] };
      }

      // Use cached TF-IDF provider (trained once per DB session)
      const { provider, store } = lazy.getTfidf();

      // Get or compute target embedding
      let targetVec = store.get(targetSym.id);
      if (!targetVec) {
        targetVec = await provider.embed(buildEmbeddingText({
          name: targetSym.name, kind: targetSym.kind, filePath: targetSym.filePath, signature: targetSym.signature,
        }));
      }

      const similar = store.searchSimilar(targetVec, maxResults, targetSym.id);

      const lines = [`Similar to ${fmtSymbol(targetSym, 'L1')}:\n`];
      for (const { symbolId, score } of similar) {
        const sym = db.findSymbolById(symbolId);
        if (sym) lines.push(`  ${(score * 100).toFixed(1)}% ${fmtSymbol(sym, 'L2')}`);
      }

      const text = lines.join('\n');
      trackToolCall(trackDb, 'find_similar', startMs, text, repo);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // ══════════════════════════════════════════════
  // ── MCP Resources ──
  // ══════════════════════════════════════════════

  // ── Resource: milens://symbol/{name} ──
  server.resource(
    'symbol',
    new ResourceTemplate('milens://symbol/{name}', { list: undefined }),
    { description: 'Symbol context: definition, incoming refs, outgoing deps, role/heat metadata' },
    async (uri, { name }) => {
      const { db } = getDb();
      const symbols = db.findSymbolByName(name as string);
      if (symbols.length === 0) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `"${name}" not found.` }] };
      }
      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`${fmtSymbol(sym, 'L2')}${sym.exported ? ' (exported)' : ''}`);
        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        if (incoming.length > 0) {
          lines.push(`incoming (${incoming.length}):`);
          for (const l of incoming) {
            const from = db.findSymbolById(l.fromId);
            lines.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
          }
        }
        const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
        if (outgoing.length > 0) {
          lines.push(`outgoing (${outgoing.length}):`);
          for (const l of outgoing) {
            const to = db.findSymbolById(l.toId);
            lines.push(`  ${l.type}: ${to ? fmtSymbol(to) : l.toId}`);
          }
        }
        lines.push('');
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );

  // ── Resource: milens://file/{path} ──
  server.resource(
    'file-symbols',
    new ResourceTemplate('milens://file/{+path}', { list: undefined }),
    { description: 'All symbols in a file with ref/dep counts' },
    async (uri, { path }) => {
      const { db } = getDb();
      const filePath = decodeURIComponent(path as string);
      const symbols = db.getSymbolsByFile(filePath);
      if (symbols.length === 0) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `No symbols in "${filePath}".` }] };
      }
      const lines: string[] = [`${filePath}: ${symbols.length} symbols\n`];
      const linkCounts = db.getLinkCountsForSymbols(symbols.map(s => s.id));
      for (const sym of symbols) {
        const counts = linkCounts.get(sym.id) ?? { incoming: 0, outgoing: 0 };
        const exp = sym.exported ? ' (exported)' : '';
        lines.push(`${fmtSymbol(sym, 'L2')}${exp} ← ${counts.incoming} refs, → ${counts.outgoing} deps`);
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );

  // ── Resource: milens://domain/{name} ──
  server.resource(
    'domain',
    new ResourceTemplate('milens://domain/{name}', { list: undefined }),
    { description: 'Domain cluster details: files and top symbols in a domain' },
    async (uri, { name }) => {
      const { db } = getDb();
      const domainName = name as string;
      // Find files in this domain
      const allFiles = db.db_getFilesByZone(domainName);
      if (allFiles.length === 0) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Domain "${domainName}" not found.` }] };
      }
      const lines: string[] = [`domain: ${domainName} (${allFiles.length} files)\n`];
      let totalSymbols = 0;
      for (const file of allFiles) {
        const syms = db.getSymbolsByFile(file);
        totalSymbols += syms.length;
        const exported = syms.filter(s => s.exported);
        lines.push(`${file}: ${syms.length} symbols (${exported.length} exported)`);
      }
      lines.push(`\ntotal: ${totalSymbols} symbols in ${allFiles.length} files`);
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );

  // ── Resource: milens://overview ──
  server.resource(
    'overview',
    'milens://overview',
    { description: 'Index overview: stats, domains, unresolved, test coverage, staleness' },
    async (uri) => {
      const { db, root, lazy } = getDb();
      const stats = lazy.getCachedStats();
      const unresolved = db.getUnresolvedStats();
      const coverage = db.getTestCoverage();
      const domains = lazy.getCachedDomainStats();
      const staleFiles = db.getStaleFiles(24);

      const lines: string[] = [
        `repo: ${root}`,
        `symbols: ${stats.symbols}`,
        `links: ${stats.links}`,
        `files: ${stats.files}`,
      ];
      if (unresolved.imports > 0 || unresolved.calls > 0) {
        lines.push(`⚠ unresolved (internal): ${unresolved.imports} imports, ${unresolved.calls} calls`);
      }
      if (unresolved.externalImports > 0 || unresolved.externalCalls > 0) {
        lines.push(`external (expected): ${unresolved.externalImports} imports, ${unresolved.externalCalls} calls`);
      }
      if (coverage.testFiles > 0) {
        const pct = coverage.exportedProductionSymbols > 0
          ? Math.round(coverage.testedSymbols / coverage.exportedProductionSymbols * 100) : 0;
        lines.push(`test coverage: ${coverage.testedSymbols}/${coverage.exportedProductionSymbols} (${pct}%) from ${coverage.testFiles} test files`);
      }
      if (domains.length > 0) {
        lines.push(`\ndomains (${domains.length}):`);
        for (const d of domains) {
          lines.push(`  ${d.domain}: ${d.files} files, ${d.symbols} symbols`);
        }
      }
      if (staleFiles.length > 0) {
        lines.push(`\n⏳ ${staleFiles.length} stale files (>24h)`);
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
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

  // Simple per-IP rate limiter: max 60 requests per minute
  const RATE_WINDOW = 60_000;
  const RATE_MAX = 60;
  const hits = new Map<string, { count: number; resetAt: number }>();

  const httpServer = createServer(async (req, res) => {
    // Rate limiting
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let bucket = hits.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + RATE_WINDOW };
      hits.set(ip, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_MAX) {
      res.writeHead(429, { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) });
      res.end('Too many requests');
      return;
    }

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
