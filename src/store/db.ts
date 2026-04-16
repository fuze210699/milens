import BetterSqlite3 from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { CodeSymbol, SymbolLink } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Database {
  private db: BetterSqlite3.Database;
  private stmts!: ReturnType<Database['prepareStatements']>;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('cache_size = -8000'); // 8MB page cache
    this.db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O for faster reads
    this.db.pragma('temp_store = MEMORY'); // temp tables in RAM
    this.applySchema();
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      checkHash: this.db.prepare('SELECT hash FROM file_hashes WHERE path = ?'),
      upsertHash: this.db.prepare(
        `INSERT INTO file_hashes (path, hash) VALUES (?, ?)
         ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, analyzed_at = datetime('now')`
      ),
      insertSym: this.db.prepare(
        `INSERT OR REPLACE INTO symbols (id, name, kind, file_path, start_line, end_line, exported, parent_id, signature, role, heat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      updateMeta: this.db.prepare(
        `UPDATE symbols SET role = ?, heat = ? WHERE id = ?`
      ),
      upsertZone: this.db.prepare(
        `UPDATE file_hashes SET zone = ? WHERE path = ?`
      ),
      insertLink: this.db.prepare(
        `INSERT OR REPLACE INTO links (id, from_id, to_id, type, confidence, line_number)
         VALUES (?, ?, ?, ?, ?, ?)`
      ),
      searchFts: this.db.prepare(
        `SELECT s.* FROM symbol_fts f
         JOIN symbols s ON s.rowid = f.rowid
         WHERE symbol_fts MATCH ?
         ORDER BY rank LIMIT ?`
      ),
      byName: this.db.prepare('SELECT * FROM symbols WHERE name = ?'),
      byId: this.db.prepare('SELECT * FROM symbols WHERE id = ?'),
      byFile: this.db.prepare('SELECT * FROM symbols WHERE file_path = ?'),
      linksIn: this.db.prepare('SELECT * FROM links WHERE to_id = ?'),
      linksOut: this.db.prepare('SELECT * FROM links WHERE from_id = ?'),
      upstream: this.db.prepare(`
        WITH RECURSIVE upstream(id, depth, via) AS (
          SELECT from_id, 1, type FROM links WHERE to_id = ? AND type IN ('calls', 'imports', 'extends', 'implements')
          UNION
          SELECT l.from_id, u.depth + 1, l.type
          FROM links l JOIN upstream u ON l.to_id = u.id
          WHERE u.depth < ? AND l.type IN ('calls', 'imports', 'extends', 'implements')
        )
        SELECT DISTINCT s.*, u.depth, u.via FROM upstream u JOIN symbols s ON s.id = u.id ORDER BY u.depth
      `),
      downstream: this.db.prepare(`
        WITH RECURSIVE downstream(id, depth, via) AS (
          SELECT to_id, 1, type FROM links WHERE from_id = ? AND type IN ('calls', 'imports', 'extends', 'implements')
          UNION
          SELECT l.to_id, d.depth + 1, l.type
          FROM links l JOIN downstream d ON l.from_id = d.id
          WHERE d.depth < ? AND l.type IN ('calls', 'imports', 'extends', 'implements')
        )
        SELECT DISTINCT s.*, d.depth, d.via FROM downstream d JOIN symbols s ON s.id = d.id ORDER BY d.depth
      `),
      countSymbols: this.db.prepare('SELECT COUNT(*) as c FROM symbols'),
      countLinks: this.db.prepare('SELECT COUNT(*) as c FROM links'),
      countFiles: this.db.prepare('SELECT COUNT(*) as c FROM file_hashes'),
      deleteFileLinks: this.db.prepare(
        'DELETE FROM links WHERE from_id IN (SELECT id FROM symbols WHERE file_path = ?)'
      ),
      deleteFileSymbols: this.db.prepare('DELETE FROM symbols WHERE file_path = ?'),
    };
  }

  private applySchema(): void {
    let sql: string;
    try {
      sql = process.env.MILENS_SCHEMA_PATH
        ? readFileSync(process.env.MILENS_SCHEMA_PATH, 'utf-8')
        : readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    } catch {
      sql = readFileSync(join(__dirname, '..', '..', 'src', 'store', 'schema.sql'), 'utf-8');
    }
    this.db.exec(sql);
    this.migrateSchema();
  }

  private migrateSchema(): void {
    // Add columns introduced after initial schema (safe to re-run)
    const cols = this.db.prepare(`PRAGMA table_info(symbols)`).all() as any[];
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has('role')) this.db.exec(`ALTER TABLE symbols ADD COLUMN role TEXT`);
    if (!colNames.has('heat')) this.db.exec(`ALTER TABLE symbols ADD COLUMN heat INTEGER DEFAULT 0`);

    const fhCols = this.db.prepare(`PRAGMA table_info(file_hashes)`).all() as any[];
    const fhNames = new Set(fhCols.map((c: any) => c.name));
    if (!fhNames.has('zone')) this.db.exec(`ALTER TABLE file_hashes ADD COLUMN zone TEXT`);
  }

  // ── File hash tracking ──

  isFileUpToDate(filePath: string, content: string): boolean {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const row = this.stmts.checkHash.get(filePath) as any;
    return row?.hash === hash;
  }

  upsertFileHash(filePath: string, content: string): void {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    this.stmts.upsertHash.run(filePath, hash);
  }

  // ── Symbol CRUD ──

  insertSymbol(sym: CodeSymbol): void {
    this.stmts.insertSym.run(
      sym.id, sym.name, sym.kind, sym.filePath,
      sym.startLine, sym.endLine, sym.exported ? 1 : 0,
      sym.parentId ?? null, sym.signature ?? null,
      sym.role ?? null, sym.heat ?? 0,
    );
  }

  insertLink(link: SymbolLink): void {
    this.stmts.insertLink.run(
      link.id, link.fromId, link.toId, link.type,
      link.confidence, link.line ?? null,
    );
  }

  updateSymbolMetadata(id: string, role: string, heat: number): void {
    this.stmts.updateMeta.run(role, heat, id);
  }

  setFileZone(filePath: string, zone: string): void {
    this.stmts.upsertZone.run(zone, filePath);
  }

  // ── Queries ──

  searchSymbols(query: string, limit = 20): CodeSymbol[] {
    // Sanitize FTS5 query: wrap each token in double-quotes to prevent FTS5 operator injection
    const sanitized = query
      .replace(/["]/g, '')           // strip double quotes
      .split(/\s+/)                  // split into tokens
      .filter(Boolean)
      .map(t => `"${t}"`)            // quote each token (treated as literal by FTS5)
      .join(' ');
    if (!sanitized) return [];
    try {
      const rows = this.stmts.searchFts.all(sanitized, limit) as any[];
      return rows.map(rowToSymbol);
    } catch {
      return [];
    }
  }

  findSymbolByName(name: string): CodeSymbol[] {
    const rows = this.stmts.byName.all(name) as any[];
    return rows.map(rowToSymbol);
  }

  findSymbolById(id: string): CodeSymbol | null {
    const row = this.stmts.byId.get(id) as any;
    return row ? rowToSymbol(row) : null;
  }

  getSymbolsByFile(filePath: string): CodeSymbol[] {
    const rows = this.stmts.byFile.all(filePath) as any[];
    return rows.map(rowToSymbol);
  }

  getIncomingLinks(symbolId: string): SymbolLink[] {
    const rows = this.stmts.linksIn.all(symbolId) as any[];
    return rows.map(rowToLink);
  }

  getOutgoingLinks(symbolId: string): SymbolLink[] {
    const rows = this.stmts.linksOut.all(symbolId) as any[];
    return rows.map(rowToLink);
  }

  findUpstream(symbolId: string, maxDepth = 3): Array<{ symbol: CodeSymbol; depth: number; via: string }> {
    const rows = this.stmts.upstream.all(symbolId, maxDepth) as any[];
    return rows.map(r => ({ symbol: rowToSymbol(r), depth: r.depth, via: r.via }));
  }

  findDownstream(symbolId: string, maxDepth = 3): Array<{ symbol: CodeSymbol; depth: number; via: string }> {
    const rows = this.stmts.downstream.all(symbolId, maxDepth) as any[];
    return rows.map(r => ({ symbol: rowToSymbol(r), depth: r.depth, via: r.via }));
  }

  getStats(): { symbols: number; links: number; files: number } {
    const symbols = (this.stmts.countSymbols.get() as any).c;
    const links = (this.stmts.countLinks.get() as any).c;
    const files = (this.stmts.countFiles.get() as any).c;
    return { symbols, links, files };
  }

  getAllSymbols(): CodeSymbol[] {
    const rows = this.db.prepare('SELECT * FROM symbols').all() as any[];
    return rows.map(rowToSymbol);
  }

  getAllLinks(): SymbolLink[] {
    const rows = this.db.prepare('SELECT * FROM links').all() as any[];
    return rows.map(rowToLink);
  }

  findDeadCode(kind?: string, limit = 50): CodeSymbol[] {
    // Exclude: section symbols (markdown headings), test fixtures (not real production code),
    // framework entry-point files (consumed by runtime, not imported by project code),
    // and config files (consumed by CLI tooling)
    const excludeClause = `AND s.kind != 'section'
      AND s.file_path NOT LIKE 'test/fixtures/%'
      AND s.file_path NOT LIKE '%/page.ts' AND s.file_path NOT LIKE '%/page.tsx'
      AND s.file_path NOT LIKE '%/page.js' AND s.file_path NOT LIKE '%/page.jsx'
      AND s.file_path NOT LIKE '%/layout.ts' AND s.file_path NOT LIKE '%/layout.tsx'
      AND s.file_path NOT LIKE '%/layout.js' AND s.file_path NOT LIKE '%/layout.jsx'
      AND s.file_path NOT LIKE '%/loading.ts' AND s.file_path NOT LIKE '%/loading.tsx'
      AND s.file_path NOT LIKE '%/error.ts' AND s.file_path NOT LIKE '%/error.tsx'
      AND s.file_path NOT LIKE '%/not-found.ts' AND s.file_path NOT LIKE '%/not-found.tsx'
      AND s.file_path NOT LIKE '%/template.ts' AND s.file_path NOT LIKE '%/template.tsx'
      AND s.file_path NOT LIKE '%/route.ts' AND s.file_path NOT LIKE '%/route.tsx'
      AND s.file_path NOT LIKE '%/route.js' AND s.file_path NOT LIKE '%/route.jsx'
      AND s.file_path NOT LIKE '%/default.ts' AND s.file_path NOT LIKE '%/default.tsx'
      AND s.file_path NOT LIKE '%/global-error.ts' AND s.file_path NOT LIKE '%/global-error.tsx'
      AND s.file_path NOT LIKE '%/middleware.ts' AND s.file_path NOT LIKE '%/middleware.js'
      AND s.file_path NOT LIKE '%.config.ts' AND s.file_path NOT LIKE '%.config.js'
      AND s.file_path NOT LIKE '%.config.mjs' AND s.file_path NOT LIKE '%.config.cjs'
      AND s.file_path NOT LIKE '%/+page.svelte' AND s.file_path NOT LIKE '%/+page.ts'
      AND s.file_path NOT LIKE '%/+page.server.ts' AND s.file_path NOT LIKE '%/+layout.svelte'
      AND s.file_path NOT LIKE '%/+layout.ts' AND s.file_path NOT LIKE '%/+layout.server.ts'
      AND s.file_path NOT LIKE '%/+server.ts'`;
    const sql = kind
      ? `SELECT s.* FROM symbols s
         LEFT JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 AND s.kind = ? ${excludeClause} AND l.id IS NULL
         LIMIT ?`
      : `SELECT s.* FROM symbols s
         LEFT JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 ${excludeClause} AND l.id IS NULL
         LIMIT ?`;
    const rows = kind
      ? this.db.prepare(sql).all(kind, limit) as any[]
      : this.db.prepare(sql).all(limit) as any[];
    return rows.map(rowToSymbol);
  }

  getTypeHierarchy(symbolId: string): { ancestors: Array<{ symbol: CodeSymbol; depth: number }>; descendants: Array<{ symbol: CodeSymbol; depth: number }> } {
    const ancestors = this.db.prepare(`
      WITH RECURSIVE up(id, depth) AS (
        SELECT to_id, 1 FROM links WHERE from_id = ? AND type IN ('extends', 'implements')
        UNION
        SELECT l.to_id, u.depth + 1
        FROM links l JOIN up u ON l.from_id = u.id
        WHERE l.type IN ('extends', 'implements') AND u.depth < 10
      )
      SELECT DISTINCT s.*, u.depth FROM up u JOIN symbols s ON s.id = u.id ORDER BY u.depth
    `).all(symbolId) as any[];

    const descendants = this.db.prepare(`
      WITH RECURSIVE down(id, depth) AS (
        SELECT from_id, 1 FROM links WHERE to_id = ? AND type IN ('extends', 'implements')
        UNION
        SELECT l.from_id, d.depth + 1
        FROM links l JOIN down d ON l.to_id = d.id
        WHERE l.type IN ('extends', 'implements') AND d.depth < 10
      )
      SELECT DISTINCT s.*, d.depth FROM down d JOIN symbols s ON s.id = d.id ORDER BY d.depth
    `).all(symbolId) as any[];

    return {
      ancestors: ancestors.map(r => ({ symbol: rowToSymbol(r), depth: r.depth })),
      descendants: descendants.map(r => ({ symbol: rowToSymbol(r), depth: r.depth })),
    };
  }

  findPath(fromName: string, toName: string, maxDepth = 5): Array<{ symbol: CodeSymbol; depth: number; via: string }> | null {
    const fromSyms = this.findSymbolByName(fromName);
    const toSyms = this.findSymbolByName(toName);
    if (fromSyms.length === 0 || toSyms.length === 0) return null;

    const fromId = fromSyms[0].id;
    const toIds = new Set(toSyms.map(s => s.id));

    // BFS outgoing from source
    const rows = this.db.prepare(`
      WITH RECURSIVE path(id, depth, via) AS (
        SELECT to_id, 1, type FROM links WHERE from_id = ? AND type != 'contains'
        UNION
        SELECT l.to_id, p.depth + 1, l.type
        FROM links l JOIN path p ON l.from_id = p.id
        WHERE l.type != 'contains' AND p.depth < ?
      )
      SELECT DISTINCT s.*, p.depth, p.via FROM path p JOIN symbols s ON s.id = p.id ORDER BY p.depth
    `).all(fromId, maxDepth) as any[];

    const result: Array<{ symbol: CodeSymbol; depth: number; via: string }> = [];
    for (const r of rows) {
      result.push({ symbol: rowToSymbol(r), depth: r.depth, via: r.via });
      if (toIds.has(r.id)) break;
    }

    const found = result.find(r => toIds.has(r.symbol.id));
    if (!found) return null;
    return result.filter(r => r.depth <= found.depth);
  }

  getChangedFiles(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT file_path FROM symbols').all() as any[];
    return rows.map((r: any) => r.file_path);
  }

  // ── Maintenance ──

  deleteFileData(filePath: string): void {
    this.stmts.deleteFileLinks.run(filePath);
    this.stmts.deleteFileSymbols.run(filePath);
  }

  rebuildSearch(): void {
    this.db.exec(`INSERT INTO symbol_fts(symbol_fts) VALUES('rebuild')`);
  }

  clearSymbolsAndLinks(): void {
    this.db.exec('DELETE FROM symbols');
    this.db.exec('DELETE FROM links');
  }

  // ── Repo metadata (unresolved counts, etc.) ──

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO repo_meta (key, value) VALUES (?, ?)').run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM repo_meta WHERE key = ?').get(key) as any;
    return row?.value;
  }

  getUnresolvedStats(): { imports: number; calls: number; externalImports: number; externalCalls: number } {
    return {
      imports: parseInt(this.getMeta('unresolved_imports') ?? '0', 10),
      calls: parseInt(this.getMeta('unresolved_calls') ?? '0', 10),
      externalImports: parseInt(this.getMeta('external_imports') ?? '0', 10),
      externalCalls: parseInt(this.getMeta('external_calls') ?? '0', 10),
    };
  }

  getTestCoverage(): { testFiles: number; testedSymbols: number; exportedProductionSymbols: number } {
    return {
      testFiles: parseInt(this.getMeta('test_files') ?? '0', 10),
      testedSymbols: parseInt(this.getMeta('tested_symbols') ?? '0', 10),
      exportedProductionSymbols: parseInt(this.getMeta('exported_production_symbols') ?? '0', 10),
    };
  }

  getConfidenceDistribution(): { high: number; medium: number; low: number; total: number } {
    const rows = this.db.prepare(`
      SELECT
        SUM(CASE WHEN confidence >= 0.9 THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN confidence >= 0.7 AND confidence < 0.9 THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN confidence < 0.7 THEN 1 ELSE 0 END) as low,
        COUNT(*) as total
      FROM links
      WHERE type != 'contains'
    `).get() as any;
    return {
      high: rows?.high ?? 0,
      medium: rows?.medium ?? 0,
      low: rows?.low ?? 0,
      total: rows?.total ?? 0,
    };
  }

  // ── Flow tracing — call chains from entrypoints to target ──

  traceToEntrypoints(symbolId: string, maxDepth = 8): Array<{ path: Array<{ symbol: CodeSymbol; via: string }>}> {
    // Walk upstream following only 'calls' links to find paths from entrypoints
    const paths: Array<{ path: Array<{ symbol: CodeSymbol; via: string }> }> = [];
    const visited = new Set<string>();

    const dfs = (currentId: string, currentPath: Array<{ symbol: CodeSymbol; via: string }>, depth: number) => {
      if (depth > maxDepth) return;
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const incoming = this.getIncomingLinks(currentId).filter(l => l.type === 'calls' || l.type === 'imports');
      const sym = this.findSymbolById(currentId);

      if (incoming.length === 0 && sym?.exported) {
        // Reached an entrypoint — save this path
        paths.push({ path: [...currentPath] });
        visited.delete(currentId);
        return;
      }

      for (const link of incoming) {
        const fromSym = this.findSymbolById(link.fromId);
        if (!fromSym) continue;
        // Skip module-level _top imports — go to their real callers
        if (fromSym.name === '_top' && fromSym.kind === 'module') {
          // Recurse from the _top module's incoming callers
          dfs(link.fromId, [{ symbol: fromSym, via: link.type }, ...currentPath], depth + 1);
        } else {
          dfs(link.fromId, [{ symbol: fromSym, via: link.type }, ...currentPath], depth + 1);
        }
      }

      visited.delete(currentId);
    };

    const targetSym = this.findSymbolById(symbolId);
    if (targetSym) {
      dfs(symbolId, [{ symbol: targetSym, via: 'target' }], 0);
    }

    // Sort by path length (shortest first), limit to 5
    return paths.sort((a, b) => a.path.length - b.path.length).slice(0, 5);
  }

  // ── Route/endpoint detection via link patterns ──

  getEntrypoints(): CodeSymbol[] {
    // Symbols with role='entrypoint' OR exported + 0 incoming non-contains links
    const rows = this.db.prepare(`
      SELECT s.* FROM symbols s
      WHERE s.exported = 1
        AND s.role = 'entrypoint'
      ORDER BY s.heat DESC
      LIMIT 50
    `).all() as any[];
    return rows.map(rowToSymbol);
  }

  // ── Domain clustering stats ──

  getDomainStats(): Array<{ domain: string; files: number; symbols: number }> {
    const rows = this.db.prepare(`
      SELECT fh.zone AS domain, COUNT(DISTINCT fh.path) AS file_count,
             COUNT(s.id) AS symbol_count
      FROM file_hashes fh
      LEFT JOIN symbols s ON s.file_path = fh.path
      WHERE fh.zone IS NOT NULL
      GROUP BY fh.zone
      ORDER BY symbol_count DESC
    `).all() as any[];
    return rows.map((r: any) => ({ domain: r.domain, files: r.file_count, symbols: r.symbol_count }));
  }

  // ── Staleness detection ──

  getStaleFiles(hoursOld = 24): string[] {
    const rows = this.db.prepare(`
      SELECT path FROM file_hashes
      WHERE analyzed_at < datetime('now', '-' || ? || ' hours')
      ORDER BY analyzed_at ASC
    `).all(hoursOld) as any[];
    return rows.map((r: any) => r.path);
  }

  // ── Zone/domain queries ──

  db_getFilesByZone(zone: string): string[] {
    const rows = this.db.prepare(
      'SELECT path FROM file_hashes WHERE zone = ? ORDER BY path'
    ).all(zone) as any[];
    return rows.map((r: any) => r.path);
  }

  // ── Multi-repo summary ──

  getRepoSummary(): { symbols: number; links: number; files: number; domains: string[]; staleCount: number } {
    const stats = this.getStats();
    const domains = this.getDomainStats().map(d => d.domain);
    const staleCount = this.getStaleFiles(24).length;
    return { ...stats, domains, staleCount };
  }

  clear(): void {
    this.db.exec('DELETE FROM symbols');
    this.db.exec('DELETE FROM links');
    this.db.exec('DELETE FROM file_hashes');
  }

  // ── Tool usage tracking ──

  logToolUsage(tool: string, durationMs: number, tokensOut: number, tokensSaved: number, repo?: string): void {
    this.db.prepare(
      `INSERT INTO tool_usage (tool, duration_ms, tokens_out, tokens_saved, repo)
       VALUES (?, ?, ?, ?, ?)`
    ).run(tool, durationMs, tokensOut, tokensSaved, repo ?? null);
  }

  getToolUsageStats(): {
    totalCalls: number;
    totalTokensSaved: number;
    totalTokensOut: number;
    totalDurationMs: number;
    byTool: Array<{ tool: string; calls: number; tokensSaved: number; tokensOut: number; avgDurationMs: number }>;
    byDay: Array<{ date: string; calls: number; tokensSaved: number }>;
    recentCalls: Array<{ tool: string; calledAt: string; durationMs: number; tokensSaved: number }>;
  } {
    const totals = this.db.prepare(`
      SELECT COUNT(*) as total_calls,
             COALESCE(SUM(tokens_saved), 0) as total_saved,
             COALESCE(SUM(tokens_out), 0) as total_out,
             COALESCE(SUM(duration_ms), 0) as total_ms
      FROM tool_usage
    `).get() as any;

    const byTool = this.db.prepare(`
      SELECT tool, COUNT(*) as calls,
             COALESCE(SUM(tokens_saved), 0) as tokens_saved,
             COALESCE(SUM(tokens_out), 0) as tokens_out,
             CAST(COALESCE(AVG(duration_ms), 0) AS INTEGER) as avg_ms
      FROM tool_usage
      GROUP BY tool
      ORDER BY calls DESC
    `).all() as any[];

    const byDay = this.db.prepare(`
      SELECT date(called_at) as date, COUNT(*) as calls,
             COALESCE(SUM(tokens_saved), 0) as tokens_saved
      FROM tool_usage
      GROUP BY date(called_at)
      ORDER BY date DESC
      LIMIT 30
    `).all() as any[];

    const recentCalls = this.db.prepare(`
      SELECT tool, called_at, duration_ms, tokens_saved
      FROM tool_usage
      ORDER BY id DESC
      LIMIT 50
    `).all() as any[];

    return {
      totalCalls: totals.total_calls,
      totalTokensSaved: totals.total_saved,
      totalTokensOut: totals.total_out,
      totalDurationMs: totals.total_ms,
      byTool: byTool.map((r: any) => ({
        tool: r.tool, calls: r.calls, tokensSaved: r.tokens_saved,
        tokensOut: r.tokens_out, avgDurationMs: r.avg_ms,
      })),
      byDay: byDay.map((r: any) => ({ date: r.date, calls: r.calls, tokensSaved: r.tokens_saved })).reverse(),
      recentCalls: recentCalls.map((r: any) => ({
        tool: r.tool, calledAt: r.called_at, durationMs: r.duration_ms, tokensSaved: r.tokens_saved,
      })),
    };
  }

  // ── Annotations (agent code memory) ──

  addAnnotation(symbolId: string, key: string, value: string, agent?: string, sessionId?: string, ttlHours?: number): number {
    const expiresAt = ttlHours
      ? new Date(Date.now() + ttlHours * 3600_000).toISOString().replace('T', ' ').slice(0, 19)
      : null;
    const result = this.db.prepare(
      `INSERT INTO annotations (symbol_id, key, value, agent, session_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(symbolId, key, value, agent ?? null, sessionId ?? null, expiresAt);
    return result.lastInsertRowid as number;
  }

  getAnnotations(filters: { symbolId?: string; key?: string; agent?: string; sessionId?: string; limit?: number }): Array<{ id: number; symbolId: string; key: string; value: string; agent: string | null; sessionId: string | null; createdAt: string }> {
    const clauses: string[] = ["(expires_at IS NULL OR expires_at > datetime('now'))"];
    const params: any[] = [];

    if (filters.symbolId) { clauses.push('symbol_id = ?'); params.push(filters.symbolId); }
    if (filters.key) { clauses.push('key = ?'); params.push(filters.key); }
    if (filters.agent) { clauses.push('agent = ?'); params.push(filters.agent); }
    if (filters.sessionId) { clauses.push('session_id = ?'); params.push(filters.sessionId); }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;

    const rows = this.db.prepare(
      `SELECT id, symbol_id, key, value, agent, session_id, created_at
       FROM annotations ${where}
       ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      symbolId: r.symbol_id,
      key: r.key,
      value: r.value,
      agent: r.agent,
      sessionId: r.session_id,
      createdAt: r.created_at,
    }));
  }

  getAnnotationsForSymbol(symbolId: string): Array<{ key: string; value: string; agent: string | null; createdAt: string }> {
    const rows = this.db.prepare(
      `SELECT key, value, agent, created_at FROM annotations
       WHERE symbol_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY created_at DESC`
    ).all(symbolId) as any[];
    return rows.map(r => ({ key: r.key, value: r.value, agent: r.agent, createdAt: r.created_at }));
  }

  cleanupExpiredAnnotations(): number {
    const result = this.db.prepare(
      `DELETE FROM annotations WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
    ).run();
    return result.changes;
  }

  // ── Agent sessions ──

  startSession(id: string, agent: string, context?: string): void {
    this.db.prepare(
      `INSERT INTO agent_sessions (id, agent, context_json, status) VALUES (?, ?, ?, 'active')`
    ).run(id, agent, context ?? null);
  }

  getSession(id: string): { id: string; agent: string; startedAt: string; endedAt: string | null; context: string | null; status: string } | null {
    const row = this.db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { id: row.id, agent: row.agent, startedAt: row.started_at, endedAt: row.ended_at, context: row.context_json, status: row.status };
  }

  endSession(id: string, status: 'completed' | 'failed' = 'completed'): void {
    this.db.prepare(
      `UPDATE agent_sessions SET ended_at = datetime('now'), status = ? WHERE id = ?`
    ).run(status, id);
  }

  /** Expose raw handle for subsystems (e.g. EmbeddingStore) that need direct access. */
  getRawDb(): BetterSqlite3.Database {
    return this.db;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}

// ── Row mappers ──

function rowToSymbol(row: any): CodeSymbol {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    exported: row.exported === 1,
    parentId: row.parent_id ?? undefined,
    signature: row.signature ?? undefined,
    role: row.role ?? undefined,
    heat: row.heat ?? undefined,
  };
}

function rowToLink(row: any): SymbolLink {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    type: row.type,
    confidence: row.confidence,
    line: row.line_number ?? undefined,
  };
}
