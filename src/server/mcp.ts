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

  const server = new McpServer({
    name: 'milens',
    version: '0.2.0',
  });

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
        return { content: [{ type: 'text' as const, text: `No symbols matching "${query}"` }] };
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
        return { content: [{ type: 'text' as const, text: `Symbol "${name}" not found` }] };
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
        return { content: [{ type: 'text' as const, text: `Symbol "${target}" not found` }] };
      }

      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`TARGET: ${fmtSymbol(sym)}`);
        const refs = direction === 'upstream'
          ? db.findUpstream(sym.id, depth)
          : db.findDownstream(sym.id, depth);

        if (refs.length === 0) {
          lines.push(`No ${direction} dependencies found.`);
        } else {
          lines.push(`${direction} (${refs.length} symbols):`);
          lines.push(fmtImpact(refs));
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
        return { content: [{ type: 'text' as const, text: `No relationship found between "${from}" and "${to}"` }] };
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
        return { content: [{ type: 'text' as const, text: `Symbol "${name}" not found` }] };
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
