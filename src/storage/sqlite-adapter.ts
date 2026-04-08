import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GraphNode, GraphRelationship, QueryResult } from '../types/graph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SqliteAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    let sql: string;
    try {
      sql = readFileSync(schemaPath, 'utf-8');
    } catch {
      // Fallback: try relative to source
      sql = readFileSync(join(__dirname, '..', '..', 'src', 'storage', 'schema.sql'), 'utf-8');
    }
    this.db.exec(sql);
  }

  // ─── Node Operations ────────────────────────────────────

  private insertNodeStmt = (() => {
    let stmt: Database.Statement | null = null;
    return () => {
      if (!stmt) {
        stmt = this.db.prepare(`
          INSERT OR REPLACE INTO nodes (id, label, name, file_path, start_line, end_line, is_exported, properties)
          VALUES (@id, @label, @name, @filePath, @startLine, @endLine, @isExported, @properties)
        `);
      }
      return stmt;
    };
  })();

  insertNode(node: GraphNode): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, label, name, file_path, start_line, end_line, is_exported, properties)
      VALUES (@id, @label, @name, @filePath, @startLine, @endLine, @isExported, @properties)
    `).run({
      id: node.id,
      label: node.label,
      name: node.name,
      filePath: node.filePath ?? null,
      startLine: node.startLine ?? null,
      endLine: node.endLine ?? null,
      isExported: node.isExported ? 1 : 0,
      properties: node.properties ? JSON.stringify(node.properties) : null,
    });
  }

  insertNodes(nodes: GraphNode[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, label, name, file_path, start_line, end_line, is_exported, properties)
      VALUES (@id, @label, @name, @filePath, @startLine, @endLine, @isExported, @properties)
    `);
    const run = this.db.transaction((items: GraphNode[]) => {
      for (const node of items) {
        stmt.run({
          id: node.id,
          label: node.label,
          name: node.name,
          filePath: node.filePath ?? null,
          startLine: node.startLine ?? null,
          endLine: node.endLine ?? null,
          isExported: node.isExported ? 1 : 0,
          properties: node.properties ? JSON.stringify(node.properties) : null,
        });
      }
    });
    run(nodes);
  }

  getNode(id: string): GraphNode | undefined {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
    return row ? this.rowToNode(row) : undefined;
  }

  getNodesByLabel(label: string): GraphNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes WHERE label = ?').all(label) as any[];
    return rows.map(r => this.rowToNode(r));
  }

  getNodesByFile(filePath: string): GraphNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes WHERE file_path = ?').all(filePath) as any[];
    return rows.map(r => this.rowToNode(r));
  }

  // ─── Relationship Operations ─────────────────────────────

  insertRelationship(rel: GraphRelationship): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO relationships (id, source_id, target_id, type, confidence, reason, properties)
      VALUES (@id, @sourceId, @targetId, @type, @confidence, @reason, @properties)
    `).run({
      id: rel.id,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type,
      confidence: rel.confidence,
      reason: rel.reason ?? null,
      properties: rel.properties ? JSON.stringify(rel.properties) : null,
    });
  }

  insertRelationships(rels: GraphRelationship[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO relationships (id, source_id, target_id, type, confidence, reason, properties)
      VALUES (@id, @sourceId, @targetId, @type, @confidence, @reason, @properties)
    `);
    const run = this.db.transaction((items: GraphRelationship[]) => {
      for (const rel of items) {
        stmt.run({
          id: rel.id,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          type: rel.type,
          confidence: rel.confidence,
          reason: rel.reason ?? null,
          properties: rel.properties ? JSON.stringify(rel.properties) : null,
        });
      }
    });
    run(rels);
  }

  getOutgoing(nodeId: string, types?: string[]): GraphRelationship[] {
    let sql = 'SELECT * FROM relationships WHERE source_id = ?';
    const params: any[] = [nodeId];
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToRelationship(r));
  }

  getIncoming(nodeId: string, types?: string[]): GraphRelationship[] {
    let sql = 'SELECT * FROM relationships WHERE target_id = ?';
    const params: any[] = [nodeId];
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToRelationship(r));
  }

  // ─── Search ──────────────────────────────────────────────

  search(query: string, limit: number = 20): QueryResult[] {
    // Sanitize FTS5 query
    const sanitized = query.replace(/[^\w\s*]/g, '').trim();
    if (!sanitized) return [];

    const ftsQuery = sanitized.split(/\s+/).map(w => `"${w}"*`).join(' ');

    const rows = this.db.prepare(`
      SELECT n.*, rank
      FROM nodes_fts
      JOIN nodes n ON nodes_fts.rowid = n.rowid
      WHERE nodes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as any[];

    return rows.map(r => ({
      node: this.rowToNode(r),
      score: -r.rank,  // FTS5 rank is negative, lower = better
    }));
  }

  // ─── Metadata ────────────────────────────────────────────

  setMetadata(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
  }

  getMetadata(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as any;
    return row?.value;
  }

  // ─── Stats ───────────────────────────────────────────────

  getNodeCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM nodes').get() as any;
    return row.cnt;
  }

  getRelationshipCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM relationships').get() as any;
    return row.cnt;
  }

  stats(): { nodes: number; relationships: number } {
    return {
      nodes: this.getNodeCount(),
      relationships: this.getRelationshipCount(),
    };
  }

  // ─── Lifecycle ───────────────────────────────────────────

  clear(): void {
    this.db.exec('DELETE FROM relationships');
    this.db.exec('DELETE FROM nodes');
    this.db.exec('DELETE FROM metadata');
  }

  close(): void {
    this.db.close();
  }

  // ─── Private ─────────────────────────────────────────────

  private rowToNode(row: any): GraphNode {
    return {
      id: row.id,
      label: row.label,
      name: row.name,
      filePath: row.file_path ?? undefined,
      startLine: row.start_line ?? undefined,
      endLine: row.end_line ?? undefined,
      isExported: row.is_exported === 1,
      properties: row.properties ? JSON.parse(row.properties) : undefined,
    };
  }

  private rowToRelationship(row: any): GraphRelationship {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      type: row.type,
      confidence: row.confidence,
      reason: row.reason ?? undefined,
      properties: row.properties ? JSON.parse(row.properties) : undefined,
    };
  }
}
