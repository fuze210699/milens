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
      sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
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
    const sql = kind
      ? `SELECT s.* FROM symbols s
         LEFT JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 AND s.kind = ? AND l.id IS NULL
         LIMIT ?`
      : `SELECT s.* FROM symbols s
         LEFT JOIN links l ON l.to_id = s.id AND l.type != 'contains'
         WHERE s.exported = 1 AND l.id IS NULL
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

  getUnresolvedStats(): { imports: number; calls: number } {
    return {
      imports: parseInt(this.getMeta('unresolved_imports') ?? '0', 10),
      calls: parseInt(this.getMeta('unresolved_calls') ?? '0', 10),
    };
  }

  clear(): void {
    this.db.exec('DELETE FROM symbols');
    this.db.exec('DELETE FROM links');
    this.db.exec('DELETE FROM file_hashes');
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
