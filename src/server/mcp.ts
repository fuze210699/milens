import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve, relative, join, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import ignore from 'ignore';
import { Database } from '../store/db.js';
import { RepoRegistry } from '../store/registry.js';
import { getParser, loadLanguage } from '../parser/loader.js';
import { ALL_LANGS } from '../parser/languages.js';
import { fileURLToPath } from 'node:url';
import { AnnotationStore } from '../store/annotations.js';
import { registerAllPrompts } from './mcp-prompts.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { registerResources } from './tools/resources.js';
import { countDependentFiles } from '../analyzer/risk.js';
import { registerSessionTools } from './tools/session.js';
import { registerTestingTools } from './tools/testing.js';
import { registerSecurityTools } from './tools/security.js';
import { FileWatcher } from './watcher.js';
import { reviewPr } from '../analyzer/review.js';
import { globToRegex } from '../utils.js';
import { BUILD_SHA, BUILT_AT } from '../build-info.js';

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
  private dbMtime = 0; // Track DB file mtime to detect external changes (e.g. CLI `analyze`)

  constructor(private dbPath: string) {}

  /** Check if DB file has been modified externally — invalidate caches if so */
  private checkExternalChange(): void {
    try {
      const stat = require('node:fs').statSync(this.dbPath);
      const mtime = stat.mtimeMs;
      if (this.dbMtime > 0 && mtime > this.dbMtime) {
        this.statsCache = null;
        this.domainCache = null;
      }
      this.dbMtime = mtime;
    } catch { /* db file may not exist yet */ }
  }

  get(): Database {
    this.resetTimer();
    // Detect external changes (e.g. CLI analyze) and force-close + reopen
    let externalChange = false;
    try {
      const stat = require('node:fs').statSync(this.dbPath);
      if (this.dbMtime > 0 && stat.mtimeMs > this.dbMtime + 1000) {
        externalChange = true;
      }
      this.dbMtime = stat.mtimeMs;
    } catch { /* db file may not exist yet */ }
    if (externalChange && this.instance) {
      this.instance.close();
      this.instance = null;
      this.statsCache = null;
      this.domainCache = null;
    }
    if (!this.instance || !this.instance.isOpen()) {
      this.instance = new Database(this.dbPath);
      this.statsCache = null;
      this.domainCache = null;
    }
    return this.instance;
  }

  /** Cached getStats — avoids 3 COUNT(*) queries per tool call */
  getCachedStats(): ReturnType<Database['getStats']> {
    this.checkExternalChange();
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
    this.checkExternalChange();
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
  }

  shutdown(): void {
    if (this.timer) clearTimeout(this.timer);
    this.instance?.close();
    this.instance = null;
  }
}

// ── Session-level edit safety guard ──

class SessionGuard {
  /** sessionId → Set of symbol names that had safety checks performed */
  private checks = new Map<string, Set<string>>();
  /** sessionId → total edit operations attempted (reported by agent) */
  private editOps = new Map<string, number>();

  recordCheck(sessionId: string, symbolName: string): void {
    if (!this.checks.has(sessionId)) this.checks.set(sessionId, new Set());
    this.checks.get(sessionId)!.add(symbolName);
  }

  recordEditOp(sessionId: string): void {
    this.editOps.set(sessionId, (this.editOps.get(sessionId) ?? 0) + 1);
  }

  getAudit(sessionId: string): { checked: string[]; editOps: number } {
    const checked = [...(this.checks.get(sessionId) ?? [])];
    const ops = this.editOps.get(sessionId) ?? 0;
    return { checked, editOps: ops };
  }

  clear(sessionId: string): void {
    this.checks.delete(sessionId);
    this.editOps.delete(sessionId);
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

const MILENS_INSTRUCTIONS = `⚠️ CRITICAL: This project is indexed by milens (knowledge graph). Use milens MCP tools BEFORE reading files directly.

WHY: The knowledge graph already knows every symbol, dependency, and reference. Reading files manually = slower, more expensive, and misses hidden connections.

RULE: Before opening ANY file to understand code, call the appropriate milens tool:
- overview({name: "X"}) — understand a symbol (context + impact + grep). Replaces 3-5 file reads.
- impact({target: "X", mode: "strict"}) — check blast radius BEFORE editing. strict mode BLOCKS if >5 deps.
- guard_edit_check({name: "X", session_id}) — HARD safety gate. Call BEFORE every edit. Returns BLOCKED if high risk.
- grep({pattern: "X"}) — find ALL text references (code, templates, docs, configs, styles).
- codebase_summary() — 500-token project overview. Use INSTEAD of reading README or exploring directories.
- detect_changes() — verify changes before committing. Shows changed symbols + risk scores.
- query({query: "X"}) — find symbol definitions by name. FTS5 instant search.

AUDIT: session_end reports which symbols were safety-checked. Editing without checks = audit gap.

TOKEN SAVINGS: Using milens first = 70% fewer tokens, zero missed dependencies.

milens — code intelligence engine. Indexes codebases into symbol graphs.

## Tool selection
- \`query\` — find symbol definitions (code identifiers only)
- \`grep\` — text search ALL files. Use \`scope\` param: all (default), code (source only), imports, definitions
- \`context\` — 360° view: incoming + outgoing for a symbol
- \`impact\` — blast radius: what breaks if symbol changes
- \`overview\` — combined context + impact + grep in one call (preferred for editing workflows)
- \`guard_edit_check\` — HARD pre-edit gate: blocks if dependents > 5, tracks checks for session audit
- \`edit_check\` — pre-edit safety: callers + export status + re-export chains + test coverage + ⚠ warnings (fastest for edits)
- \`trace\` — execution flow: call chains from entrypoints to a symbol (or downstream from it)
- \`routes\` — detect framework routes/endpoints (Express, FastAPI, NestJS, Flask, Go, PHP, Rails)
- \`smart_context\` — intent-aware context: understand/edit/debug/test (returns only what matters for intent)
- \`domains\` — show domain clusters: groups of files forming logical modules based on dependency graph
- \`repos\` — list all indexed repositories with summary stats (multi-repo support)
- \`detect_changes\` — git diff → affected symbols
- \`explain_relationship\` — shortest path between two symbols
- \`find_dead_code\` — unused exports
- \`get_file_symbols\` — all symbols in a file
- \`get_type_hierarchy\` — inheritance tree

## Rules
- Before editing a symbol: run \`guard_edit_check\` or \`edit_check\` or \`smart_context\` with intent=edit
- \`guard_edit_check({name, session_id})\` — HARD gate: records check for audit, blocks if dependents > 5
- \`impact({mode: "strict"})\` — strict mode returns BLOCKED when depth-1 deps > 5
- For debugging: run \`smart_context\` with intent=debug or \`trace\` to=symbol
- For writing tests: run \`smart_context\` with intent=test — shows deps to mock + callers to cover
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
  const toolCallCounts = new Map<string, number>(); // In-memory counter per repo
  const trackDb = getTrackingDb();
  const guard = new SessionGuard();

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

  function getDb(repoPath?: string): { db: Database; root: string; dbPath: string; lazy: LazyDb } {
    const root = resolveRoot(repoPath);
    const dbPath = registry.findDbPath(root);
    if (!dbPath) throw new Error(`No index for ${root}. Run \`milens analyze\` first.`);

    if (!pools.has(root)) pools.set(root, new LazyDb(dbPath));
    const lazy = pools.get(root)!;

    // Track tool call count per root (in-memory, resets on server restart)
    if (!toolCallCounts.has(root)) toolCallCounts.set(root, 0);
    toolCallCounts.set(root, toolCallCounts.get(root)! + 1);

    return { db: lazy.get(), root, dbPath, lazy };
  }

  /** Get the in-memory tool call count for a repo (resets on server restart) */
  function getToolCallCount(root: string): number {
    return toolCallCounts.get(root) ?? 0;
  }

  const server = new McpServer(
    { name: 'milens', version: PKG_VERSION },
    { instructions: MILENS_INSTRUCTIONS },
  );

  // Auto-wrap every tool handler with usage tracking + background decay tick
  const origTool = server.tool.bind(server);
  let lastDecayTick = 0;
  const DECAY_INTERVAL = 5 * 60_000; // 5 minutes between decay ticks
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

        // Background confidence decay tick (real-time, every 5 min)
        if (Date.now() - lastDecayTick > DECAY_INTERVAL) {
          lastDecayTick = Date.now();
          try {
            for (const [, pool] of pools) {
              const db = pool.get();
              const store = new AnnotationStore(db.connection);
              if (store.getAnnotationCount() >= 100) {
                const { runDecayPass } = await import('../store/confidence.js');
                runDecayPass(store);
              }
            }
          } catch { /* decay is best-effort */ }
        }

        return result;
      };
    }
    return (origTool as any)(...args);
  }) as typeof server.tool;

  // ── Selective tool profiles (W4) ──
  const profile = process.env.MILENS_PROFILE || undefined;
  
  if (profile && profile !== 'full') {
    const minimal = new Set(['query', 'grep', 'context', 'impact', 'status', 'codebase_summary', 'edit_check', 'detect_changes', 'get_file_symbols', 'overview']);
    const standard = new Set([...minimal, 'domains', 'repos', 'explain_relationship', 'find_dead_code', 'get_type_hierarchy', 'trace', 'routes', 'smart_context', 'review_pr', 'review_symbol', 'test_coverage_gaps', 'test_plan', 'test_impact', 'session_start', 'recall']);
    
    const allowed = profile === 'minimal' ? minimal : standard;
    
    // Wrap server.tool again to gate by profile
    const profileWrappedTool = server.tool.bind(server);
    server.tool = ((...args: any[]) => {
      const toolName = args[0] as string;
      if (!allowed.has(toolName)) {
        // Return a no-op tool that explains it's disabled
        const origLength = args.length;
        const handler = args[origLength - 1];
        if (typeof handler === 'function') {
          args[origLength - 1] = async () => ({
            content: [{ type: 'text', text: `Tool "${toolName}" disabled by profile "${profile}". Use --profile full to enable.` }],
          });
        }
      }
      return (profileWrappedTool as any)(...args);
    }) as typeof server.tool;
  }

  // ── Tool: query ──
  server.tool(
    'query',
    'Find symbol definitions by name (FTS5 instant search). Use instead of reading files to find where a function/class is defined. For text in templates/configs/docs, use `grep`.',
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
    'Find EVERY text occurrence across ALL project files. Searches code, templates, styles, configs, docs — not just symbol definitions. Use INSTEAD of built-in search tools which may miss non-code files. ⚠️ IMPORTANT: Default is LITERAL mode (isRegex: false). Characters like | . * + ? are treated as literal text, NOT regex. To use regex alternation or wildcards, set isRegex: true.',
    {
      pattern: z.string().describe('Text OR regex pattern to search for. ⚠️ Default is LITERAL: characters | . * + ? ( ) are escaped as plain text. To use regex, set isRegex: true.'),
      repo: z.string().optional().describe('Repository root path (optional)'),
      isRegex: z.boolean().optional().default(false).describe('Set to true for regex patterns. Default false: special chars like | . * are treated as literal text.'),
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

      // Detect regex-like patterns used in literal mode (hint BEFORE result output)
      const regexChars = /[|.*+?(){}\[\]]/;
      const regexHint = (!isRegex && regexChars.test(pattern))
        ? `⚠️ HINT: Pattern "${pattern}" contains special regex characters (${pattern.match(regexChars)!.join(' ')}). Default is LITERAL mode — these are escaped as plain text. To use as regex, add isRegex: true.\n\n`
        : '';

      if (filtered.length === 0) {
        const hintBlock = regexHint + `No matches for "${pattern}"${scope !== 'all' ? ` (scope: ${scope})` : ''}`;
        return { content: [{ type: 'text' as const, text: hintBlock }] };
      }

      // Group by file for compact output
      const grouped = new Map<string, { line: number; text: string }[]>();
      for (const m of filtered) {
        const arr = grouped.get(m.file) ?? [];
        arr.push({ line: m.line, text: m.text });
        grouped.set(m.file, arr);
      }

      const lines: string[] = [];
      if (regexHint) lines.push(regexHint);

      lines.push(`${filtered.length} matches in ${grouped.size} files${scope !== 'all' ? ` (scope: ${scope})` : ''}:\n`);
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
    '360° view of a symbol: who calls it + what it depends on. Instant dependency graph. Use INSTEAD of reading multiple files to trace call chains manually — catches cross-file imports you would miss.',
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
    'Exact blast radius BEFORE you edit. Shows which symbols WILL BREAK if you change a target. Use instead of guessing or manually tracing dependencies. Code deps only — pair with `grep` for templates/configs.',
    {
      target: z.string().describe('Symbol name to analyze'),
      direction: z.enum(['upstream', 'downstream']).default('upstream'),
      depth: z.number().optional().default(3),
      repo: z.string().optional(),
      detail: z.enum(['L0', 'L1', 'L2']).optional().default('L1').describe('Output detail: L0=names only, L1=default, L2=full metadata'),
      mode: z.enum(['normal', 'strict']).optional().default('normal').describe('strict=BLOCKED if depth-1 dependents > 5, normal=report only'),
    },
    async ({ target, direction, depth, repo, detail, mode }) => {
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
          // Dedupe depth-1 by calling file — same real dependent, same blast radius
          const depth1Count = countDependentFiles(db, sym.id).count;
          lines.push(`${direction} (${refs.length} symbols, depth-1: ${depth1Count}):`);
          lines.push(fmtImpact(refs, detail));

          // Strict mode: hard stop if depth-1 dependents > 5
          if (mode === 'strict' && direction === 'upstream' && depth1Count > 5) {
            lines.push('');
            lines.push('---');
            lines.push(`⚠️ BLOCKED: ${depth1Count} direct dependents (>5 threshold).`);
            lines.push('Editing this symbol may cause cascading breakage.');
            lines.push('To proceed: re-run with mode="normal" or explicitly acknowledge the risk.');
            lines.push('---');
          }
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
      let text = `repo: ${root}\nbuild: ${BUILD_SHA} (built: ${BUILT_AT})\nversion: ${PKG_VERSION}\nsymbols: ${stats.symbols}\nlinks: ${stats.links}\nfiles: ${stats.files}`;
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
      // Resolution confidence distribution (heuristic self-ratings, not validated accuracy)
      const conf = db.getConfidenceDistribution();
      if (conf.total > 0) {
        const highPct = Math.round(conf.high / conf.total * 100);
        const medPct = Math.round(conf.medium / conf.total * 100);
        const lowPct = Math.round(conf.low / conf.total * 100);
        text += `\nresolution confidence: ${conf.total} links — ≥0.9: ${conf.high} (${highPct}%) | 0.7-0.9: ${conf.medium} (${medPct}%) | <0.7: ${conf.low} (${lowPct}%)`;
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
    'ONE call replaces 3-5 file reads. Combined context + impact + grep. Use BEFORE reading any source file. Saves 70% tokens vs reading files individually. Preferred before editing/deleting/renaming a symbol.',
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
            const tempDb = pools.has(entry.rootPath)
              ? pools.get(entry.rootPath)!.get()
              : new Database(dbPath);
            const summary = tempDb.getRepoSummary();
            lines.push(`  ${summary.symbols} symbols, ${summary.links} links, ${summary.files} files`);
            if (summary.domains.length > 0) {
              lines.push(`  domains: ${summary.domains.join(', ')}`);
            }
            if (summary.staleCount > 0) {
              const stalePct = summary.files > 0 ? Math.round(summary.staleCount / summary.files * 100) : 0;
              lines.push(`  ⏳ ${summary.staleCount} stale files (>24h)${stalePct > 20 ? ' — ⚠ run `milens analyze` to refresh' : ''}`);
            }
            if (!pools.has(entry.rootPath)) tempDb.close();
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
    'Pre-commit safety check. Uses git diff to show which symbols changed + their direct dependents + risk. Use INSTEAD of manually running `git diff` before every commit.',
    {
      ref: z.string().optional().default('HEAD').describe('Git ref to diff against (default: HEAD)'),
      repo: z.string().optional(),
    },
    async ({ ref, repo }) => {
      const { db, root } = getDb(repo);
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

      // Get changed line ranges per file (git diff -U0 gives hunk headers with @@ -old,new +old,new @@)
      const changedLinesByFile = new Map<string, Set<number>>();
      for (const file of changedFiles) {
        try {
          const diffOut = execFileSync('git', ['diff', '-U0', ref, '--', file], { cwd: root, encoding: 'utf-8' });
          const changedLines = new Set<number>();
          for (const line of diffOut.split('\n')) {
            const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (m) {
              const start = parseInt(m[1], 10);
              const count = m[2] ? parseInt(m[2], 10) : 1;
              for (let i = start; i < start + count; i++) {
                changedLines.add(i);
              }
            }
          }
          if (changedLines.size > 0) changedLinesByFile.set(file, changedLines);
        } catch { /* file may not exist at ref */ }
      }

      const lines: string[] = [`${changedFiles.length} changed files:\n`];
      let totalAffected = 0;
      let totalChanged = 0;

      for (const file of changedFiles) {
        const syms = db.getSymbolsByFile(file);
        if (syms.length === 0) {
          lines.push(`${file}: (not indexed)`);
          continue;
        }

        const changedLines = changedLinesByFile.get(file);
        // Filter to only symbols whose line range overlaps with changed lines
        const changedSyms = changedLines
          ? syms.filter(s => {
              for (let line = s.startLine; line <= s.endLine; line++) {
                if (changedLines.has(line)) return true;
              }
              return false;
            })
          : syms; // fallback: no line-level diff available, report all

        if (changedSyms.length === 0 && changedLines) {
          // File changed but no symbols affected (e.g. whitespace, imports only)
          lines.push(`${file}: (symbols unchanged)`);
          continue;
        }

        const displaySyms = changedSyms.length > 0 ? changedSyms : syms;
        const unchangedCount = changedSyms.length > 0 ? syms.length - changedSyms.length : 0;
        const unchangedNote = unchangedCount > 0 ? ` (${unchangedCount} unchanged not shown)` : '';
        lines.push(`${file}: ${displaySyms.length} changed symbols${unchangedNote}`);
        for (const sym of displaySyms) {
          const depsCount = countDependentFiles(db, sym.id).count;
          totalChanged++;
          if (depsCount > 0) {
            lines.push(`  ${sym.name} [${sym.kind}] :${sym.startLine} → ${depsCount} direct dependents`);
            totalAffected += depsCount;
          } else {
            lines.push(`  ${sym.name} [${sym.kind}] :${sym.startLine}`);
          }
        }
      }
      lines.push(`\nTotal changed symbols: ${totalChanged}`);
      lines.push(`Total direct dependents affected: ${totalAffected}`);
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
      const fromSyms = db.findSymbolByName(from);
      const toSyms = db.findSymbolByName(to);
      if (fromSyms.length === 0) {
        return { content: [{ type: 'text' as const, text: `Symbol "${from}" not found in index. Try \`grep\`.` }] };
      }
      if (toSyms.length === 0) {
        return { content: [{ type: 'text' as const, text: `Symbol "${to}" not found in index. Try \`grep\`.` }] };
      }
      const path = db.findPath(from, to);
      if (!path) {
        return { content: [{ type: 'text' as const, text: `No path between "${from}" and "${to}".` }] };
      }

      const fromSym = fromSyms[0];
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
    'Exported symbols with zero incoming code references (potentially unused). Note: only checks code-level imports/calls — symbols may still be referenced in templates, configs, or docs. Always cross-check with `grep` before removing.',
    {
      kind: z.string().optional().describe('Filter by symbol kind (function, class, method, etc.)'),
      limit: z.number().optional().default(30),
      repo: z.string().optional(),
    },
    async ({ kind, limit, repo }) => {
      const { db } = getDb(repo);
      const dead = db.findDeadCode(kind, limit);
      const testOnly = db.findTestOnlyReferenced(limit);
      const lines: string[] = [];

      if (dead.length === 0 && testOnly.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No unreferenced exported symbols found.' }] };
      }

      if (dead.length > 0) {
        lines.push(`${dead.length} unreferenced exported symbols (code-level only — verify with grep before removing):\n`);
        for (const sym of dead) {
          lines.push(fmtSymbol(sym));
        }
      }

      if (testOnly.length > 0) {
        if (dead.length > 0) lines.push('');
        lines.push(`─── Symbols referenced only by test files (likely orphaned) — ${testOnly.length} found:\n`);
        for (const sym of testOnly) {
          lines.push(fmtSymbol(sym));
        }
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

      // File-path auto-suggest: domain hint
      const parts = file.replace(/\\/g, '/').split('/');
      let areaName = 'root';
      if (parts.length > 1) {
        if (parts[0] === 'src') {
          areaName = parts.length > 2 ? parts[1] : 'root';
        } else {
          areaName = parts[0];
        }
      }
      if (areaName !== 'root') {
        lines.push(`\n💡 This file is in the '${areaName}' domain. Load skill 'milens-${areaName}' for key symbols and dependencies.`);
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
    'Fast pre-edit safety. Shows callers, export status, re-export chains, test coverage, and ⚠ warnings. Use BEFORE modifying any function/class/method — catches hidden risks you would miss.',
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

  // ── Tool: guard_edit_check ──
  server.tool(
    'guard_edit_check',
    'HARD pre-edit safety gate. Call BEFORE every edit operation — tracks checks for session audit. If dependents > 5, returns BLOCKED status requiring explicit confirmation. Combines edit_check with enforcement tracking.',
    {
      name: z.string().describe('Symbol name to check before editing'),
      repo: z.string().optional(),
      session_id: z.string().optional().describe('Session ID for audit tracking'),
      confirm: z.string().optional().describe('Type "I understand the risk" to bypass a BLOCKED result'),
    },
    async ({ name, repo, session_id, confirm }) => {
      const { db, root } = getDb(repo);
      const symbols = db.findSymbolByName(name);
      const sections: string[] = [];

      if (symbols.length === 0) {
        return { content: [{ type: 'text' as const, text: `"${name}" not found in index. Try \`grep\` to find it in templates/docs first.` }] };
      }

      for (const sym of symbols) {
        sections.push(`${fmtSymbol(sym)}${sym.exported ? ' (exported)' : ''}`);

        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        const depsCount = countDependentFiles(db, sym.id, { excludeTestFiles: true }).count;

        if (session_id) guard.recordCheck(session_id, name);

        // Hard stop: if > 5 non-test dependents and no confirmation
        if (depsCount > 5 && confirm !== 'I understand the risk') {
          sections.push(`⚠️ BLOCKED: ${name} has ${depsCount} non-test dependents (>5 threshold).`);
          sections.push(`Direct callers (${incoming.length} total):`);
          for (const l of incoming) {
            const from = db.findSymbolById(l.fromId);
            sections.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
          }
          sections.push('');
          sections.push(`To proceed, re-call with confirm: "I understand the risk"`);
          sections.push(`Or: run \`impact({target: "${name}", depth: 2})\` to see full blast radius.`);
        } else {
          // Safe to edit or explicitly confirmed
          const status = depsCount > 5 ? '⚠️ CONFIRMED (high risk)' : '✅ Safe to edit';
          sections.push(`${status} — ${depsCount} non-test dependents`);

          if (incoming.length > 0) {
            sections.push(`callers (${incoming.length}):`);
            for (const l of incoming) {
              const from = db.findSymbolById(l.fromId);
              sections.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
            }
          } else {
            sections.push(`callers: none`);
          }

          // Export chain
          const grepMatches = grepFiles(root, name, { maxResults: 5, includePattern: '**/index.{ts,js,mjs}' });
          const reExportMatches = grepMatches.filter(m =>
            /export\s*\{[^}]*/.test(m.text) && m.text.includes('from')
          );
          if (reExportMatches.length > 0) {
            sections.push(`re-exported via:`);
            for (const m of reExportMatches) {
              sections.push(`  ${m.file}:${m.line}`);
            }
          }

          // Heritage
          const descendants = db.getTypeHierarchy(sym.id).descendants;
          if (descendants.length > 0) {
            sections.push(`⚠ inherited by ${descendants.length} types:`);
            for (const { symbol: d } of descendants) {
              sections.push(`  ${fmtSymbol(d)}`);
            }
          }

          // Test coverage
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
      }

      // Unresolved warning
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
            sections.push('No call chain found — verify with `context()` before treating this symbol as dead code.');
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

  // ═══ codebase_summary ═══
  server.tool(
    'codebase_summary',
    '500-token project overview. Use at session start INSTEAD of reading README, exploring directory structure, or reading multiple files to understand the codebase. Returns domains, key symbols, coverage %.',
    { repo: z.string().optional() },
    async ({ repo }) => {
      const { db } = getDb(repo);
      const summary = db.getCodebaseSummary();
      const lines = [
        'Milens Codebase Summary:',
        `  Symbols: ${summary.symbols} | Links: ${summary.links} | Files: ${summary.files}`,
      ];
      if (summary.exportedSymbols > 0) {
        lines.push(`  Test coverage: ${summary.coveragePct}% (${summary.testedSymbols}/${summary.exportedSymbols} exported symbols tested)`);
      }
      if (summary.domains.length > 0) {
        const domainStr = summary.domains.map(d => `${d.domain}(${d.symbols}s)`).join(', ');
        lines.push(`  Domains: ${domainStr}`);
      }
      if (summary.topHubs.length > 0) {
        const hubStr = summary.topHubs.map(h => `${h.name}(${h.kind},heat:${h.heat})`).join(', ');
        lines.push(`  Top hubs: ${hubStr}`);
      }
      try {
        const annCount = db.getAnnotationCount();
        lines.push(`  Total annotations: ${annCount}`);
      } catch {
        lines.push('  Total annotations: 0');
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ═══ review_pr ═══
  server.tool(
    'review_pr',
    'PR risk assessment: git diff -> affected symbols with risk scores (LOW/MEDIUM/HIGH/CRITICAL).',
    { ref: z.string().optional().default('HEAD'), repo: z.string().optional() },
    async ({ ref, repo }) => {
      const { db, root } = getDb(repo);
      const result = reviewPr(db, root, ref);
      if (result.changedFiles.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No changed files detected.' }] };
      }
      const allAffected: any[] = [];
      for (const s of result.symbols) {
        allAffected.push({
          symbol: s.symbol.name, kind: s.symbol.kind, file: s.symbol.filePath,
          heat: s.symbol.heat ?? 0, dependents: s.dependents,
          hasTest: s.tested, riskScore: s.riskScore, riskLevel: s.riskLevel,
        });
      }
      const summary = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const a of allAffected) (summary as any)[a.riskLevel]++;
      const lines = [`PR Risk Assessment (vs ${ref}):\n`];
      lines.push(`${result.changedFiles.length} changed files, ${allAffected.length} affected symbols\n`);
      for (const a of allAffected.slice(0, 30)) {
        lines.push(`  ${a.symbol} [${a.kind}] ${a.file} — heat:${a.heat} deps:${a.dependents} test:${a.hasTest ? 'yes' : 'no'} → ${a.riskLevel}(${a.riskScore})`);
      }
      lines.push(`\nSummary: CRITICAL=${summary.CRITICAL} HIGH=${summary.HIGH} MEDIUM=${summary.MEDIUM} LOW=${summary.LOW}`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ═══ review_symbol ═══
  server.tool(
    'review_symbol',
    'Deep-dive single symbol risk: role, heat, dependents, test status, risk level.',
    { name: z.string(), repo: z.string().optional() },
    async ({ name, repo }) => {
      const { db, root } = getDb(repo);
      const syms = db.findSymbolByName(name);
      if (syms.length === 0) return { content: [{ type: 'text' as const, text: `"${name}" not found.` }] };
      const lines: string[] = [];
      for (const sym of syms) {
        const incomingRaw = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        // Dedupe by calling file — imports + calls from the same file is 1 real dependent
        const seenCallerFiles = new Set<string>();
        const incoming = incomingRaw.filter(l => {
          const from = db.findSymbolById(l.fromId);
          const key = from?.filePath ?? l.fromId;
          if (seenCallerFiles.has(key)) return false;
          seenCallerFiles.add(key);
          return true;
        });
        const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
        const depsCount = countDependentFiles(db, sym.id).count;
        const depsTop = incoming.slice(0, 5).map(l => { const s = db.findSymbolById(l.fromId); return s?.name ?? l.fromId; });
        const outCount = outgoing.length;
        const outTop = outgoing.slice(0, 5).map(l => { const s = db.findSymbolById(l.toId); return s?.name ?? l.toId; });
        const hasTest = sym.exported ? db.getSymbolTestCoverage(sym.id) : false;
        const heat = sym.heat ?? 0;
        const score = Math.round((heat / 100) * 40 + Math.min(depsCount / 10, 1) * 35 + (hasTest ? 0 : 25));
        let risk = 'LOW';
        if (score > 75) risk = 'CRITICAL';
        else if (score > 50) risk = 'HIGH';
        else if (score > 25) risk = 'MEDIUM';
        lines.push(`${sym.name} [${sym.kind}] ${sym.filePath}:${sym.startLine}`);
        lines.push(`  role: ${sym.role ?? 'unknown'} | heat: ${heat} | exported: ${sym.exported}`);
        lines.push(`  dependents: ${depsCount} ${depsTop.length ? '(' + depsTop.join(', ') + ')' : ''}`);
        lines.push(`  dependencies: ${outCount} ${outTop.length ? '(' + outTop.join(', ') + ')' : ''}`);
        lines.push(`  test coverage: ${hasTest ? 'yes' : 'no'}`);
        lines.push(`  risk: ${risk} (score: ${score})`);
        if (risk === 'CRITICAL') lines.push(`  recommendation: High risk — has ${depsCount} dependents with no test coverage. Write tests before modifying.`);
        else if (risk === 'HIGH') lines.push(`  recommendation: Review dependents carefully before modifying.`);
        lines.push('');
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  registerTestingTools(server, { getDb, fmtSymbol, fmtImpact, rootPath, toolCallCounts, resolveRoot, guard, getToolCallCount });


  registerSessionTools(server, { getDb, fmtSymbol, fmtImpact, rootPath, toolCallCounts, resolveRoot, guard, getToolCallCount });

  // ═══ semantic_search ═══
  server.tool(
    'semantic_search',
    'Search symbols by semantic meaning (falls back to FTS5 keyword search when embeddings unavailable).',
    { query: z.string(), limit: z.number().optional().default(10), repo: z.string().optional() },
    async ({ query, limit, repo }) => {
      const { db } = getDb(repo);
      const results = db.searchSymbols(query, limit);
      if (results.length > 0) {
        const lines = [`Semantic search results for "${query}" (FTS5 keyword mode — run \`milens analyze --embeddings\` for semantic mode):\n`];
        for (const s of results) {
          lines.push(`${s.name} [${s.kind}] ${s.filePath}:${s.startLine}${s.exported ? ' (exported)' : ''}`);
        }
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      }
      return { content: [{ type: 'text' as const, text: `No results for "${query}".\n\nTip: Run \`milens analyze --embeddings\` to enable semantic (vector) search. Currently using FTS5 keyword fallback which only matches exact symbol names.` }] };
    },
  );

  // ═══ find_similar ═══
  server.tool(
    'find_similar',
    'Find symbols topologically similar to a given symbol (shared callers/callees). Useful for finding patterns to copy or refactor together.',
    { name: z.string(), limit: z.number().optional().default(10), repo: z.string().optional() },
    async ({ name, limit, repo }) => {
      const { db } = getDb(repo);
      const syms = db.findSymbolByName(name);
      if (syms.length === 0) return { content: [{ type: 'text' as const, text: `"${name}" not found.` }] };
      const results = db.findTopologicallySimilar(syms[0].id, limit);
      if (results.length === 0) return { content: [{ type: 'text' as const, text: `No similar symbols found for "${name}".` }] };
      const lines = [`Symbols similar to "${name}":\n`];
      for (const r of results) {
        lines.push(`  ${r.symbol.name} [${r.symbol.kind}] ${r.symbol.filePath}:${r.symbol.startLine} — similarity: ${r.similarity.toFixed(2)}`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ══════════════════════════════════════════════
  // ── MCP Resources ──
  // ══════════════════════════════════════════════
  registerResources(server, {
    getDb,
    fmtSymbol,
    fmtImpact,
    rootPath,
    toolCallCounts,
    resolveRoot,
    guard,
    getToolCallCount,
  });


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

  // ── Prompt: vibe-code-planner ──
  server.prompt(
    'vibe-code-planner',
    'ECC-style Planner Agent workflow: analyze codebase, create implementation plan with blast radius awareness',
    { feature: z.string().describe('Feature or task name to plan') },
    ({ feature }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I am the Planner Agent. I need to create an implementation plan for "${feature}".\n\n` +
            `Follow this ECC Planner workflow:\n\n` +
            `PHASE 1 — CODEBASE INTELLIGENCE:\n` +
            `1. Run \`codebase_summary()\` to understand the project structure\n` +
            `2. Run \`domains()\` to see module clusters\n` +
            `3. Run \`routes()\` to find relevant API endpoints\n\n` +
            `PHASE 2 — TARGET ANALYSIS:\n` +
            `4. Run \`smart_context({name: "keySymbol", intent: "edit"})\` for each affected symbol\n` +
            `5. Run \`edit_check({name: "keySymbol"})\` for safety\n` +
            `6. Run \`trace({to: "keySymbol"})\` to understand execution flow\n\n` +
            `PHASE 3 — IMPACT PREDICTION:\n` +
            `7. Run \`impact({target: "keySymbol", depth: 3})\` to see blast radius\n` +
            `8. Run \`explain_relationship({from: "A", to: "B"})\` for distant dependencies\n\n` +
            `PHASE 4 — TEST STRATEGY:\n` +
            `9. Run \`test_plan({name: "keySymbol"})\` for mock strategy\n` +
            `10. Run \`test_coverage_gaps()\` to check existing coverage\n\n` +
            `PHASE 5 — FINAL PLAN:\n` +
            `Output a plan.md with: Overview, Architecture Changes, Implementation Steps (file+action+why+deps+risk), Testing Strategy, Risks & Mitigations, Success Criteria.\n\n` +
            `Use the ECC plan format with specific file paths, dependencies, and risk levels (LOW/MEDIUM/HIGH).`,
        },
      }],
    }),
  );

  // ── Prompt: vibe-code-reviewer ──
  server.prompt(
    'vibe-code-reviewer',
    'ECC-style Reviewer Agent workflow: PR risk assessment, dead code detection, security scan',
    { session_id: z.string().optional().describe('Optional session ID for annotation context') },
    ({ session_id }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I am the Reviewer Agent. Review the current changes thoroughly.${session_id ? ` Session: ${session_id}` : ''}\n\n` +
            `Follow this ECC Reviewer workflow:\n\n` +
            `1. Run \`review_pr()\` to get risk scores for all changed symbols\n` +
            `2. For each CRITICAL/HIGH symbol:\n` +
            `   a. Run \`review_symbol({name})\` for deep dive\n` +
            `   b. Run \`context({name})\` to see relationships\n` +
            `   c. Run \`grep({pattern: "symbolName"})\` for text references\n` +
            `3. Run \`find_dead_code()\` to detect orphaned symbols\n` +
            `4. Run \`grep({pattern: "password|secret|api_key|token", scope: "code"})\` for secrets\n` +
            `5. Run \`grep({pattern: "TODO|FIXME|HACK|console\\\\.log", scope: "code"})\` for tech debt\n` +
            `6. Run \`detect_changes()\` to verify expected files only\n` +
            `7. Create a review report: symbols OK to merge vs symbols needing fixes\n` +
            `8. Run \`annotate({symbol, key: "bug"|"security", value})\` for any critical findings`,
        },
      }],
    }),
  );

  // ── Prompt: closed-loop-session ──
  server.prompt(
    'closed-loop-session',
    'Complete 6-phase closed-loop session: Analyze → Plan → Code → Verify → Learn → Improve',
    { task: z.string().describe('Task description'), agent: z.string().optional().default('vibe-coder') },
    ({ task, agent }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Run a complete closed-loop development session for: "${task}"\n\n` +
            `PHASE 1 — ANALYZE (bootstrap):\n` +
            `  session_start({agent: "${agent}"}) → codebase_summary() → domains() → recall()\n\n` +
            `PHASE 2 — PLAN:\n` +
            `  smart_context({intent: "edit"}) → edit_check() → impact({depth: 3}) → test_plan()\n\n` +
            `PHASE 3 — CODE:\n` +
            `  Implement changes with guard: edit_check() before each edit, impact() mid-edit, context() for reference\n\n` +
            `PHASE 4 — VERIFY:\n` +
            `  detect_changes() → test_impact() → review_pr() → test_coverage_gaps() → grep(secrets)\n\n` +
            `PHASE 5 — LEARN:\n` +
            `  annotate() key observations → session_context() → handoff() if needed\n\n` +
            `PHASE 6 — IMPROVE:\n` +
            `  milens evolve (if patterns ready) → milens metrics (check health)\n\n` +
            `At the end: session_end({session_id}) to record stats.`,
        },
      }],
    }),
  );

  // ── Register MCP Prompts (W1) ──
  registerAllPrompts(server);

  registerSecurityTools(server, { getDb, fmtSymbol, fmtImpact, rootPath, toolCallCounts, resolveRoot, guard, getToolCallCount });


  // ═══ compare_impact ═══
  server.tool(
    'compare_impact',
    'Compare impact graph before/after an edit. Takes a snapshot first, then call again to see the diff. Returns new/removed dependents and heat changes.',
    {
      name: z.string().describe('Symbol name to compare'),
      action: z.enum(['snapshot', 'compare']).describe("'snapshot' to save current state, 'compare' to diff against last snapshot"),
      repo: z.string().optional(),
    },
    async ({ name, action, repo }) => {
      const { db, root, dbPath } = getDb(repo);
      const orchestrator = new Orchestrator({ rootPath: root, dbPath });

      try {
        // Load any persisted snapshots from disk before operating
        orchestrator.loadSnapshots();

        if (action === 'snapshot') {
          const snap = orchestrator.snapshot(name, db);
          // Persist to disk so it survives across MCP requests
          orchestrator.persistSnapshots();
          return { content: [{ type: 'text' as const, text: `Snapshot saved for "${name}":\n  Heat: ${snap.heatScore}\n  Dependents: ${snap.dependents.length}\n  Timestamp: ${snap.timestamp}` }] };
        }

        const diff = orchestrator.compare(name, db);
        if (!diff.before) {
          return { content: [{ type: 'text' as const, text: `No snapshot found for "${name}". Call compare_impact with action: 'snapshot' first.` }] };
        }

        const lines: string[] = [];
        lines.push(`Impact diff for "${name}"\n`);
        lines.push(`Before: ${diff.before.dependents.length} dependents, heat ${diff.heatBefore}`);
        lines.push(`After:  ${diff.after.dependents.length} dependents, heat ${diff.heatAfter}`);

        if (diff.newDependents.length > 0) {
          lines.push(`\n+ ${diff.newDependents.length} new dependents:`);
          for (const d of diff.newDependents) lines.push(`  + ${d.name} in ${d.filePath}`);
        }
        if (diff.removedDependents.length > 0) {
          lines.push(`\n- ${diff.removedDependents.length} removed dependents:`);
          for (const d of diff.removedDependents) lines.push(`  - ${d.name} in ${d.filePath}`);
        }
        if (diff.heatChanged) {
          lines.push(`\nHeat changed: ${diff.heatBefore} → ${diff.heatAfter} (${diff.heatAfter > diff.heatBefore! ? 'increased' : 'decreased'})`);
        }
        if (diff.newDependents.length === 0 && diff.removedDependents.length === 0 && !diff.heatChanged) {
          lines.push(`\nNo changes detected in impact graph.`);
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } finally {
        db.close();
      }
    },
  );

  // ═══ orchestrate ═══
  server.tool(
    'orchestrate',
    'Run full orchestration cycle: detect_changes → review_pr → impact → coverage gaps → dead code. Returns structured action plan.',
    { repo: z.string().optional() },
    async ({ repo }) => {
      const { root, dbPath } = getDb(repo);
      const orchestrator = new Orchestrator({ rootPath: root, dbPath, useEmoji: false });
      const report = await orchestrator.runAndFormat();
      return { content: [{ type: 'text' as const, text: report }] };
    },
  );


  // ── Prompt: dead_code_remove ──
  server.prompt(
    'dead_code_remove',
    'Safe dead code removal workflow: detect → verify → remove → test.',
    { repo: z.string().optional().describe('Repository root path') },
    ({ repo }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I need to safely remove dead code. Follow this workflow:\n\n` +
            `1. Run \`find_dead_code()\` to list symbols with zero incoming references\n` +
            `2. For each candidate symbol, verify it's truly unused:\n` +
            `   a. Run \`context({name: "symbolName"})\` to check for hidden callers\n` +
            `   b. Run \`grep({pattern: "symbolName"})\` to find all text references (templates, configs, docs, routes)\n` +
            `   c. Run \`impact({target: "symbolName", direction: "downstream"})\` to confirm no downstream impact\n` +
            `3. If neither context nor grep finds references → safe to remove\n` +
            `4. Before removal: \`edit_check({name: "symbolName"})\` for final safety check\n` +
            `5. Remove the symbol and its definition\n` +
            `6. Run test suite to verify no regressions\n` +
            `7. Report: which symbols removed, which skipped (and why)\n\n` +
            `IMPORTANT: Never auto-remove. Always ask for confirmation before deleting each symbol.` +
            (repo ? `\nRepo: ${repo}` : ''),
        },
      }],
    }),
  );

  return server;
}

// ── Helpers ──

// ── Transport: stdio ──

export async function startStdio(rootPath?: string): Promise<void> {
  const server = createMcpServer(rootPath);
  const transport = new StdioServerTransport();

  // Start file watcher for auto re-index (respects hook config)
  let watcher: FileWatcher | null = null;
  if (rootPath) {
    const { RepoRegistry } = await import('../store/registry.js');
    const { HookManager } = await import('./hooks.js');
    const reg = new RepoRegistry();
    const entry = reg.findByRoot(rootPath);
    if (entry) {
      const hookMgr = new HookManager();
      const hookConfig = hookMgr.loadConfig(rootPath);
      if (hookConfig.enabled && hookConfig.onFileChange) {
        watcher = new FileWatcher({
          rootPath,
          dbPath: entry.dbPath,
          logger: (_level, msg) => {
            server.server.sendLoggingMessage({ level: 'info', data: msg });
          },
        });
        watcher.start();
      }
    }
  }

  // Cleanup on exit — registering a custom SIGINT/SIGTERM handler replaces
  // Node's default terminate-on-signal behavior, so we must exit explicitly
  // or the process hangs forever waiting for the (already-closed) stdio transport.
  const cleanup = () => {
    if (watcher) watcher.stop();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Many MCP hosts tear down the child by closing the stdio pipe (EOF) instead
  // of sending a signal — StdioServerTransport doesn't detect this on its own,
  // so without this the process leaks forever with no parent left to talk to.
  process.stdin.on('end', cleanup);
  process.stdin.on('close', cleanup);

  try {
    await server.connect(transport);
  } catch (err: any) {
    server.server.sendLoggingMessage({
      level: 'error',
      data: `[milens:stdio] Failed to start: ${err.message}`,
    });
    if (watcher) watcher.stop();
    process.exit(1);
  }
}

// ── Transport: HTTP (Streamable) ──

export async function startHttp(port: number, rootPath?: string): Promise<void> {
  const server = createMcpServer(rootPath);
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; lastActive: number }>();

  // Start file watcher for auto re-index (respects hook config)
  let watcher: FileWatcher | null = null;
  if (rootPath) {
    const { RepoRegistry } = await import('../store/registry.js');
    const { HookManager } = await import('./hooks.js');
    const reg = new RepoRegistry();
    const entry = reg.findByRoot(rootPath);
    if (entry) {
      const hookMgr = new HookManager();
      const hookConfig = hookMgr.loadConfig(rootPath);
      if (hookConfig.enabled && hookConfig.onFileChange) {
        watcher = new FileWatcher({
          rootPath,
          dbPath: entry.dbPath,
          logger: (_level, msg) => {
            server.server.sendLoggingMessage({ level: 'info', data: msg });
          },
        });
        watcher.start();
      }
    }
  }

  // Cleanup on exit — registering a custom SIGINT/SIGTERM handler replaces
  // Node's default terminate-on-signal behavior, so we must exit explicitly
  // or the process hangs forever with the HTTP server still listening.
  let shuttingDown = false;
  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (watcher) watcher.stop();
    clearInterval(evictTimer);
    httpServer.close(() => process.exit(0));
    // Force-exit if some connection keeps the server from closing in time
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

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
          try {
            await server.connect(transport);
          } catch (err: any) {
            server.server.sendLoggingMessage({
              level: 'error',
              data: `[milens:http] Failed to connect transport: ${err.message}`,
            });
            if (!res.headersSent) {
              res.writeHead(500);
              res.end('Internal server error');
            }
            return;
          }
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
    process.stderr.write(`milens MCP server listening on http://127.0.0.1:${port}/mcp\n`);
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
