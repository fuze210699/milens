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

  /** Access the raw better-sqlite3 connection (for AnnotationStore etc.) */
  get connection(): BetterSqlite3.Database {
    return this.db;
  }

  /** Check whether the underlying sqlite connection is still open */
  isOpen(): boolean {
    try {
      return this.db.open;
    } catch {
      return false;
    }
  }

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
        WITH RECURSIVE downstream(id, depth, via, path) AS (
          SELECT to_id, 1, type, ',' || to_id || ',' FROM links WHERE from_id = ? AND type IN ('calls', 'imports', 'extends', 'implements')
          UNION
          SELECT l.to_id, d.depth + 1, l.type, d.path || l.to_id || ','
          FROM links l JOIN downstream d ON l.from_id = d.id
          WHERE d.depth < ? AND l.type IN ('calls', 'imports', 'extends', 'implements')
            AND d.path NOT LIKE '%,' || l.to_id || ',%'
        )
        SELECT DISTINCT s.*, d.depth, d.via FROM downstream d JOIN symbols s ON s.id = d.id ORDER BY d.depth
      `),
      countSymbols: this.db.prepare('SELECT COUNT(*) as c FROM symbols'),
      countLinks: this.db.prepare('SELECT COUNT(*) as c FROM links'),
      countFiles: this.db.prepare('SELECT COUNT(DISTINCT file_path) as c FROM symbols'),
      deleteFileLinks: this.db.prepare(
        'DELETE FROM links WHERE from_id IN (SELECT id FROM symbols WHERE file_path = ?)'
      ),
      deleteFileSymbols: this.db.prepare('DELETE FROM symbols WHERE file_path = ?'),
      topHubs: this.db.prepare('SELECT * FROM symbols WHERE exported = 1 ORDER BY heat DESC LIMIT ?'),
      testCoverageGaps: this.db.prepare(`
        SELECT s.* FROM symbols s
        WHERE s.exported = 1 AND s.heat > 0
        AND s.id NOT IN (
          SELECT DISTINCT l.to_id FROM links l
          JOIN symbols src ON src.id = l.from_id
          WHERE (src.file_path LIKE '%/test/%' OR src.file_path LIKE '%\\test\\%'
                 OR src.file_path LIKE '%.test.%' OR src.file_path LIKE '%.spec.%')
        )
        ORDER BY s.heat DESC
        LIMIT ?
      `),
      annotationCount: this.db.prepare('SELECT COUNT(*) as c FROM annotations'),
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

    // ── Migrate annotations table (symbol_id → symbol, missing columns) ──
    try {
      const annCols = this.db.prepare(`PRAGMA table_info(annotations)`).all() as any[];
      const annNames = new Set(annCols.map((c: any) => c.name));
      if (annNames.has('symbol_id') && !annNames.has('symbol')) {
        this.db.exec(`ALTER TABLE annotations RENAME COLUMN symbol_id TO symbol`);
      }
      if (!annNames.has('confidence') && !annNames.has('symbol_id')) {
        this.db.exec(`ALTER TABLE annotations ADD COLUMN confidence REAL DEFAULT 0.5`);
      }
      if (!annNames.has('updated_at')) {
        this.db.exec(`ALTER TABLE annotations ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`);
      }
      if (!annNames.has('symbol_hash')) {
        this.db.exec(`ALTER TABLE annotations ADD COLUMN symbol_hash TEXT`);
      }
      // Rebuild index if column was renamed
      if (annNames.has('symbol_id')) {
        this.db.exec(`DROP INDEX IF EXISTS idx_annotations_symbol`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_annotations_symbol ON annotations(symbol, key)`);
      }
    } catch { /* table may not exist yet */ }

    // ── Migrate agent_sessions → sessions ──
    try {
      const hasOld = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_sessions'").get() as any;
      const hasNew = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get() as any;
      if (hasOld && !hasNew) {
        this.db.exec(`ALTER TABLE agent_sessions RENAME TO sessions`);
        const sessCols = this.db.prepare(`PRAGMA table_info(sessions)`).all() as any[];
        const sessNames = new Set(sessCols.map((c: any) => c.name));
        if (sessNames.has('context_json') && !sessNames.has('context')) {
          this.db.exec(`ALTER TABLE sessions RENAME COLUMN context_json TO context`);
        }
        if (!sessNames.has('tool_calls_count')) {
          this.db.exec(`ALTER TABLE sessions ADD COLUMN tool_calls_count INTEGER DEFAULT 0`);
        }
        if (!sessNames.has('annotations_count')) {
          this.db.exec(`ALTER TABLE sessions ADD COLUMN annotations_count INTEGER DEFAULT 0`);
        }
      }
      // If sessions exists but has old columns from agent_sessions
      if (hasNew || hasOld) {
        const sessCols = this.db.prepare(`PRAGMA table_info(sessions)`).all() as any[];
        const sessNames = new Set(sessCols.map((c: any) => c.name));
        if (sessNames.has('context_json') && !sessNames.has('context')) {
          this.db.exec(`ALTER TABLE sessions RENAME COLUMN context_json TO context`);
        }
        if (!sessNames.has('tool_calls_count') && !sessNames.has('context_json')) {
          this.db.exec(`ALTER TABLE sessions ADD COLUMN tool_calls_count INTEGER DEFAULT 0`);
        }
        if (!sessNames.has('annotations_count')) {
          this.db.exec(`ALTER TABLE sessions ADD COLUMN annotations_count INTEGER DEFAULT 0`);
        }
      }
    } catch { /* fine if neither table exists */ }
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
    const frameworkExclude = `AND s.file_path NOT LIKE 'app/%/page.%' AND s.file_path NOT LIKE 'app/%/layout.%'
      AND s.file_path NOT LIKE 'app/page.%' AND s.file_path NOT LIKE 'app/layout.%'
      AND s.file_path NOT LIKE 'app/api/%/route.%' AND s.file_path NOT LIKE 'jest.config.%'
      AND s.file_path NOT LIKE 'src/routes/+page.%' AND s.file_path NOT LIKE 'src/routes/+layout.%'
      AND s.file_path NOT LIKE '%/alembic/versions/%'
      AND s.file_path NOT LIKE '%/migrations/%'
      AND s.file_path NOT LIKE 'api/%'`;
    // Vue SFC root components imported via <Component/> template tags get their
    // import link on _top [module], not on the [class] root symbol. Treat the class
    // as referenced if its file's _top module has incoming links from other files.
    const vueRootGuard = `AND NOT (s.file_path LIKE '%.vue' AND s.kind = 'class' AND EXISTS (
      SELECT 1 FROM symbols s2
      JOIN links l2 ON l2.to_id = s2.id AND l2.type != 'contains'
      WHERE s2.file_path = s.file_path AND s2.kind = 'module' AND s2.name = '_top'
      AND EXISTS (SELECT 1 FROM links l3 WHERE l3.to_id = s2.id AND l3.type = 'imports')
    ))`;
    const sql = kind
      ? `SELECT s.* FROM symbols s
         LEFT JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 AND s.kind = ? AND s.kind != 'section' AND l.id IS NULL
         ${frameworkExclude}
         ${vueRootGuard}
         LIMIT ?`
      : `SELECT s.* FROM symbols s
         LEFT JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 AND s.kind != 'section' AND l.id IS NULL
         ${frameworkExclude}
         ${vueRootGuard}
         LIMIT ?`;
    const rows = kind
      ? this.db.prepare(sql).all(kind, limit) as any[]
      : this.db.prepare(sql).all(limit) as any[];
    return rows.map(rowToSymbol);
  }

  /**
   * Find exported symbols that have incoming references, but ALL of those references
   * originate from test files — meaning the symbol is "test-only referenced" and
   * likely orphaned from production code. Returns symbols missed by the standard
   * findDeadCode (which requires zero incoming links of any kind).
   */
  findTestOnlyReferenced(limit = 50): CodeSymbol[] {
    const frameworkExclude = `AND s.file_path NOT LIKE 'app/%/page.%' AND s.file_path NOT LIKE 'app/%/layout.%'
      AND s.file_path NOT LIKE 'app/page.%' AND s.file_path NOT LIKE 'app/layout.%'
      AND s.file_path NOT LIKE 'app/api/%/route.%' AND s.file_path NOT LIKE 'jest.config.%'
      AND s.file_path NOT LIKE 'src/routes/+page.%' AND s.file_path NOT LIKE 'src/routes/+layout.%'
      AND s.file_path NOT LIKE '%/alembic/versions/%'
      AND s.file_path NOT LIKE '%/migrations/%'
      AND s.file_path NOT LIKE 'api/%'`;
    // Get ALL exported symbols that HAVE at least one incoming link (not caught by findDeadCode).
    // No SQL LIMIT here: the JS post-filter below narrows this down to test-only-referenced
    // symbols, which can be a small minority of low-heat candidates — applying `limit` before
    // that filter would silently drop real orphans that don't happen to rank in the top N by heat.
    const sql = `SELECT s.*, COUNT(l.id) as incoming_count FROM symbols s
         JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 AND s.kind != 'section'
         ${frameworkExclude}
         GROUP BY s.id
         HAVING incoming_count > 0
         ORDER BY s.heat DESC`;
    const rows = this.db.prepare(sql).all() as any[];
    const candidates = rows.map(rowToSymbol);

    // Post-filter: check if ALL incoming links come from test files
    const results: CodeSymbol[] = [];
    for (const sym of candidates) {
      const incoming = this.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
      if (incoming.length === 0) continue;
      const allFromTests = incoming.every(l => {
        const from = this.findSymbolById(l.fromId);
        return from && this.isTestFile(from.filePath);
      });
      if (allFromTests) {
        results.push(sym);
      }
    }
    return results.slice(0, limit);
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
    const toId = toSyms[0].id;
    const toIds = new Set(toSyms.map(s => s.id));

    // Use path-accumulating CTE to track the actual predecessor chain
    interface PathRow { node_id: string; depth: number; via: string; path_ids: string; }

    const rows = this.db.prepare(`
      WITH RECURSIVE chain(node_id, depth, via, path_ids) AS (
        SELECT l.to_id, 1, l.type, ',' || l.from_id || ',' || l.to_id || ','
        FROM links l WHERE l.from_id = ? AND l.type != 'contains'
        UNION ALL
        SELECT l.to_id, c.depth + 1, l.type, c.path_ids || l.to_id || ','
        FROM links l JOIN chain c ON l.from_id = c.node_id
        WHERE l.type != 'contains' AND c.depth < ?
          AND c.path_ids NOT LIKE '%,' || l.to_id || ',%'
      )
      SELECT node_id, depth, via, path_ids FROM chain ORDER BY depth
    `).all(fromId, maxDepth) as PathRow[];

    // Find the first (shortest-depth) row matching the target
    const targetRow = rows.find(r => toIds.has(r.node_id));
    if (!targetRow) return null;

    // Reconstruct path from path_ids chain
    const idChain = targetRow.path_ids.split(',').filter((s: string) => s.length > 0);
    // idChain[0] = fromId, idChain[last] = target node_id
    const result: Array<{ symbol: CodeSymbol; depth: number; via: string }> = [];
    for (let i = 0; i < idChain.length; i++) {
      const sym = this.findSymbolById(idChain[i]);
      if (!sym) continue;
      // Determine via for this hop: lookup link from idChain[i] → idChain[i+1]
      let via = 'calls';
      if (i < idChain.length - 1) {
        const linkRow = this.db.prepare(
          'SELECT type FROM links WHERE from_id = ? AND to_id = ? AND type != ? LIMIT 1'
        ).get(idChain[i], idChain[i + 1], 'contains') as any;
        if (linkRow) via = linkRow.type;
      }
      result.push({ symbol: sym, depth: i, via });
    }
    return result;
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

      if (incoming.length === 0) {
        // Reached an entrypoint — save this path
        // _top modules represent file-level entrypoints (e.g., top-level code execution)
        if (sym?.exported || (sym?.kind === 'module' && sym?.name === '_top')) {
          paths.push({ path: [...currentPath] });
        }
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
  }

  /** Clear only symbols, links, and file hashes for specific files (incremental re-index) */
  clearFiles(filePaths: string[]): void {
    if (filePaths.length === 0) return;
    const placeholders = filePaths.map(() => '?').join(',');
    // Delete links where either end references a symbol in the changed files
    this.db.prepare(`
      DELETE FROM links WHERE from_id IN (SELECT id FROM symbols WHERE file_path IN (${placeholders}))
    `).run(...filePaths);
    this.db.prepare(`
      DELETE FROM links WHERE to_id IN (SELECT id FROM symbols WHERE file_path IN (${placeholders}))
    `).run(...filePaths);
    this.db.prepare(`
      DELETE FROM symbols WHERE file_path IN (${placeholders})
    `).run(...filePaths);
  }

  /** Delete file_hashes rows for paths not in the given set (orphan cleanup after incremental analyze) */
  pruneOrphanFileHashes(knownPaths: string[]): number {
    if (knownPaths.length === 0) return 0;
    const placeholders = knownPaths.map(() => '?').join(',');
    const result = this.db.prepare(`
      DELETE FROM file_hashes WHERE path NOT IN (${placeholders})
    `).run(...knownPaths);
    return result.changes;
  }

  // ── Tool usage tracking ──

  logToolUsage(tool: string, durationMs: number, tokensOut: number, tokensSaved: number, repo?: string): void {
    this.db.prepare(
      `INSERT INTO tool_usage (tool, duration_ms, tokens_out, tokens_saved, repo)
       VALUES (?, ?, ?, ?, ?)`
    ).run(tool, durationMs, tokensOut, tokensSaved, repo ?? null);
  }

  getToolUsageStats(repo?: string): {
    totalCalls: number;
    totalTokensSaved: number;
    totalTokensOut: number;
    totalDurationMs: number;
    byTool: Array<{ tool: string; calls: number; tokensSaved: number; tokensOut: number; avgDurationMs: number }>;
    byDay: Array<{ date: string; calls: number; tokensSaved: number }>;
    recentCalls: Array<{ tool: string; calledAt: string; durationMs: number; tokensSaved: number }>;
  } {
    const repoFilter = repo ? `WHERE repo = ?` : '';
    const repoParam = repo ? [repo] : [];

    const totals = this.db.prepare(`
      SELECT COUNT(*) as total_calls,
             COALESCE(SUM(tokens_saved), 0) as total_saved,
             COALESCE(SUM(tokens_out), 0) as total_out,
             COALESCE(SUM(duration_ms), 0) as total_ms
      FROM tool_usage
      ${repoFilter}
    `).get(...repoParam) as any;

    const byTool = this.db.prepare(`
      SELECT tool, COUNT(*) as calls,
             COALESCE(SUM(tokens_saved), 0) as tokens_saved,
             COALESCE(SUM(tokens_out), 0) as tokens_out,
             CAST(COALESCE(AVG(duration_ms), 0) AS INTEGER) as avg_ms
      FROM tool_usage
      ${repoFilter}
      GROUP BY tool
      ORDER BY calls DESC
    `).all(...repoParam) as any[];

    const byDay = this.db.prepare(`
      SELECT date(called_at) as date, COUNT(*) as calls,
             COALESCE(SUM(tokens_saved), 0) as tokens_saved
      FROM tool_usage
      ${repoFilter}
      GROUP BY date(called_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(...repoParam) as any[];

    const recentCalls = this.db.prepare(`
      SELECT tool, called_at, duration_ms, tokens_saved
      FROM tool_usage
      ${repoFilter}
      ORDER BY id DESC
      LIMIT 50
    `).all(...repoParam) as any[];

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

  // ── Test file detection ──

  private isTestFile(filePath: string): boolean {
    return /[/\\]test[/\\]/.test(filePath) || /\.(test|spec)\./.test(filePath);
  }

  // ── Heat / hubs ──

  getTopHubs(limit: number): CodeSymbol[] {
    const rows = this.stmts.topHubs.all(limit) as any[];
    return rows.map(rowToSymbol);
  }

  // ── Test coverage ──

  getSymbolTestCoverage(symbolId: string): boolean {
    const incomingLinks = this.getIncomingLinks(symbolId);
    for (const link of incomingLinks) {
      const sourceSymbol = this.findSymbolById(link.fromId);
      if (sourceSymbol && this.isTestFile(sourceSymbol.filePath)) {
        return true;
      }
    }
    return false;
  }

  getTestedSymbolIds(candidateIds: string[], isTestFileFn: (path: string) => boolean): Set<string> {
    if (candidateIds.length === 0) return new Set<string>();
    const placeholders = candidateIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT DISTINCT l.to_id
      FROM links l JOIN symbols src ON src.id = l.from_id
      WHERE l.to_id IN (${placeholders}) AND l.type != 'contains'
    `).all(...candidateIds) as any[];
    const testedIds = new Set<string>();
    for (const row of rows) {
      const src = this.findSymbolById(row.to_id);
      if (src && isTestFileFn(src.filePath)) continue;
      // Check each from_id for test files
      const links = this.getIncomingLinks(row.to_id);
      for (const l of links) {
        if (l.type === 'contains') continue;
        const from = this.findSymbolById(l.fromId);
        if (from && isTestFileFn(from.filePath)) {
          testedIds.add(row.to_id);
          break;
        }
      }
    }
    // Also include ids not in the result set (no incoming links)
    const inResult = new Set(rows.map(r => r.to_id));
    for (const id of candidateIds) {
      if (!inResult.has(id)) continue; // doesn't exist
    }
    return testedIds;
  }

  getTestCoverageGaps(limit: number): CodeSymbol[] {
    const rows = this.stmts.testCoverageGaps.all(limit) as any[];
    return rows.map(rowToSymbol);
  }

  getTestImpact(changedSymbolIds: string[]): { testFiles: string[]; changedSymbols: string[] } {
    if (changedSymbolIds.length === 0) return { testFiles: [], changedSymbols: [] };

    const placeholders = changedSymbolIds.map(() => '?').join(',');

    const testFilesDirect = this.db.prepare(`
      SELECT DISTINCT src.file_path
      FROM links l
      JOIN symbols src ON src.id = l.from_id
      WHERE l.to_id IN (${placeholders})
        AND (src.file_path LIKE '%/test/%' OR src.file_path LIKE '%\\test\\%'
             OR src.file_path LIKE '%.test.%' OR src.file_path LIKE '%.spec.%')
    `).all(...changedSymbolIds) as any[];

    const testFilesUpstream = this.db.prepare(`
      WITH RECURSIVE upstream(id, depth) AS (
        SELECT from_id, 1 FROM links WHERE to_id IN (${placeholders})
          AND type IN ('calls', 'imports', 'extends', 'implements')
        UNION
        SELECT l.from_id, u.depth + 1
        FROM links l JOIN upstream u ON l.to_id = u.id
        WHERE l.type IN ('calls', 'imports', 'extends', 'implements') AND u.depth < 5
      )
      SELECT DISTINCT s.file_path FROM upstream u
      JOIN symbols s ON s.id = u.id
      WHERE (s.file_path LIKE '%/test/%' OR s.file_path LIKE '%\\test\\%'
             OR s.file_path LIKE '%.test.%' OR s.file_path LIKE '%.spec.%')
    `).all(...changedSymbolIds) as any[];

    const allTestFiles = [...new Set([
      ...testFilesDirect.map((r: any) => r.file_path),
      ...testFilesUpstream.map((r: any) => r.file_path),
    ])];

    const changedSymbols = changedSymbolIds.filter(id => this.getSymbolTestCoverage(id));

    return { testFiles: allTestFiles, changedSymbols };
  }

  // ── Codebase summary ──

  getCodebaseSummary(): {
    symbols: number;
    links: number;
    files: number;
    coveragePct: number;
    testedSymbols: number;
    exportedSymbols: number;
    domains: Array<{ domain: string; files: number; symbols: number }>;
    topHubs: CodeSymbol[];
  } {
    const stats = this.getStats();
    const coverage = this.getTestCoverage();
    const domains = this.getDomainStats();
    const topHubs = this.getTopHubs(10);
    const coveragePct = coverage.exportedProductionSymbols > 0
      ? Math.round((coverage.testedSymbols / coverage.exportedProductionSymbols) * 100)
      : 0;

    return {
      symbols: stats.symbols,
      links: stats.links,
      files: stats.files,
      coveragePct,
      testedSymbols: coverage.testedSymbols,
      exportedSymbols: coverage.exportedProductionSymbols,
      domains,
      topHubs,
    };
  }

  // ── Topological similarity ──

  findTopologicallySimilar(symbolId: string, limit = 10): Array<{ symbol: CodeSymbol; similarity: number }> {
    const target = this.findSymbolById(symbolId);
    if (!target) return [];

    const incoming = this.getIncomingLinks(symbolId).filter(l => l.type !== 'contains');
    const outgoing = this.getOutgoingLinks(symbolId).filter(l => l.type !== 'contains');

    const targetLinks = new Set<string>();
    for (const link of incoming) targetLinks.add(link.fromId);
    for (const link of outgoing) targetLinks.add(link.toId);

    // Search across all exported symbols, not just same-file siblings
    const allSymbols = this.getAllSymbols().filter(s => s.id !== symbolId && s.exported);

    const results: Array<{ symbol: CodeSymbol; similarity: number }> = [];
    for (const candidate of allSymbols) {
      const candIncoming = this.getIncomingLinks(candidate.id).filter(l => l.type !== 'contains');
      const candOutgoing = this.getOutgoingLinks(candidate.id).filter(l => l.type !== 'contains');

      const candidateLinks = new Set<string>();
      for (const link of candIncoming) candidateLinks.add(link.fromId);
      for (const link of candOutgoing) candidateLinks.add(link.toId);

      let intersection = 0;
      for (const id of targetLinks) {
        if (candidateLinks.has(id)) intersection++;
      }
      const union = new Set([...targetLinks, ...candidateLinks]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity >= 0.15) {
        results.push({ symbol: candidate, similarity: Math.round(similarity * 100) / 100 });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  // ── Annotations ──

  getAnnotationCount(): number {
    const row = this.stmts.annotationCount.get() as any;
    return row.c;
  }

  // ── Annotation/session API ──

  getRawDb(): BetterSqlite3.Database { return this.db; }

  addAnnotation(symbolId: string, key: string, value: string, agent?: string, sessionId?: string, ttlHours?: number): number {
    const expiresAt = ttlHours
      ? new Date(Date.now() + ttlHours * 3600_000).toISOString().replace('T', ' ').slice(0, 19)
      : null;
    const result = this.db.prepare(
      `INSERT INTO annotations (symbol, key, value, agent, session_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(symbolId, key, value, agent ?? null, sessionId ?? null, expiresAt);
    return result.lastInsertRowid as number;
  }

  getAnnotations(filters: { symbolId?: string; key?: string; agent?: string; sessionId?: string; limit?: number } = {}): Array<{ id: number; symbolId: string; key: string; value: string; agent: string | null; sessionId: string | null; createdAt: string }> {
    const clauses: string[] = ["(expires_at IS NULL OR expires_at > datetime('now'))"];
    const params: any[] = [];
    if (filters.symbolId) { clauses.push('symbol = ?'); params.push(filters.symbolId); }
    if (filters.key) { clauses.push('key = ?'); params.push(filters.key); }
    if (filters.agent) { clauses.push('agent = ?'); params.push(filters.agent); }
    if (filters.sessionId) { clauses.push('session_id = ?'); params.push(filters.sessionId); }
    const sql = `SELECT *, symbol as symbolId, created_at as createdAt FROM annotations WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC` + (filters.limit ? ` LIMIT ${filters.limit}` : '');
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r: any) => ({ id: r.id, symbolId: r.symbol, key: r.key, value: r.value, agent: r.agent, sessionId: r.session_id, createdAt: r.created_at }));
  }

  getAnnotationsForSymbol(symbolId: string): Array<{ id: number; symbolId: string; key: string; value: string; agent: string | null; createdAt: string }> {
    return this.getAnnotations({ symbolId });
  }

  cleanupExpiredAnnotations(): number {
    const result = this.db.prepare("DELETE FROM annotations WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").run();
    return result.changes;
  }

  startSession(id: string, agent: string, context?: string): void {
    this.db.prepare('INSERT OR REPLACE INTO sessions (id, agent, status, started_at, context) VALUES (?, ?, ?, datetime(\'now\'), ?)')
      .run(id, agent, 'active', context ?? null);
  }

  getSession(id: string): { id: string; agent: string; status: string; startedAt: string; endedAt: string | null; context: string | null } | null {
    const row = this.db.prepare('SELECT *, started_at as startedAt, ended_at as endedAt FROM sessions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { id: row.id, agent: row.agent, status: row.status, startedAt: row.started_at, endedAt: row.ended_at, context: row.context };
  }

  endSession(id: string, status: string): void {
    this.db.prepare("UPDATE sessions SET status = ?, ended_at = datetime('now') WHERE id = ?").run(status, id);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ── Metric history ──

  recordMetric(name: string, value: number): void {
    this.db.prepare(
      'INSERT INTO metric_history (metric_name, value) VALUES (?, ?)'
    ).run(name, value);
  }

  getMetricHistory(name: string, daysBack: number = 30): Array<{ value: number; recordedAt: string }> {
    return this.db.prepare(
      `SELECT value, recorded_at as recordedAt FROM metric_history
       WHERE metric_name = ? AND recorded_at >= datetime('now', ?)
       ORDER BY recorded_at DESC`
    ).all(name, `-${daysBack} days`) as any[];
  }

  getMetricTrend(name: string): { current: number; previous: number | null; change: number | null } {
    const rows = this.db.prepare(
      `SELECT value FROM metric_history
       WHERE metric_name = ? ORDER BY recorded_at DESC LIMIT 2`
    ).all(name) as any[];
    if (rows.length === 0) return { current: 0, previous: null, change: null };
    if (rows.length === 1) return { current: rows[0].value, previous: null, change: null };
    return { current: rows[0].value, previous: rows[1].value, change: rows[0].value - rows[1].value };
  }

  /** Snapshot all metrics at once */
  snapshotMetrics(): void {
    const stats = this.getStats();
    const coverage = this.getTestCoverage();
    const deadCode = this.findDeadCode(undefined, 10000);

    const coveragePct = coverage.exportedProductionSymbols > 0
      ? Math.round((coverage.testedSymbols / coverage.exportedProductionSymbols) * 100)
      : 0;

    this.recordMetric('symbols', stats.symbols);
    this.recordMetric('links', stats.links);
    this.recordMetric('files', stats.files);
    this.recordMetric('test_coverage_pct', coveragePct);
    this.recordMetric('dead_code_count', deadCode.length);
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
