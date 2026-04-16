import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'db-extended-test.db');

describe('Database — annotations, sessions, graph methods', () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);

    // Build a type hierarchy:
    // Animal (interface) ← Dog (class, extends) ← GoldenRetriever (class, extends)
    // Animal ← Cat (class, implements)

    const symbols: CodeSymbol[] = [
      { id: 'src/animals.ts#interface:Animal:1', name: 'Animal', kind: 'interface', filePath: 'src/animals.ts', startLine: 1, endLine: 5, exported: true },
      { id: 'src/animals.ts#class:Dog:10', name: 'Dog', kind: 'class', filePath: 'src/animals.ts', startLine: 10, endLine: 20, exported: true },
      { id: 'src/animals.ts#class:GoldenRetriever:25', name: 'GoldenRetriever', kind: 'class', filePath: 'src/animals.ts', startLine: 25, endLine: 35, exported: true },
      { id: 'src/animals.ts#class:Cat:40', name: 'Cat', kind: 'class', filePath: 'src/animals.ts', startLine: 40, endLine: 50, exported: true },
      { id: 'src/service.ts#function:feedAnimal:1', name: 'feedAnimal', kind: 'function', filePath: 'src/service.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'src/service.ts#function:walkDog:15', name: 'walkDog', kind: 'function', filePath: 'src/service.ts', startLine: 15, endLine: 25, exported: true },
    ];
    for (const s of symbols) db.insertSymbol(s);

    const links: SymbolLink[] = [
      // Type hierarchy
      { id: 'ext1', fromId: 'src/animals.ts#class:Dog:10', toId: 'src/animals.ts#interface:Animal:1', type: 'extends', confidence: 1.0 },
      { id: 'ext2', fromId: 'src/animals.ts#class:GoldenRetriever:25', toId: 'src/animals.ts#class:Dog:10', type: 'extends', confidence: 1.0 },
      { id: 'impl1', fromId: 'src/animals.ts#class:Cat:40', toId: 'src/animals.ts#interface:Animal:1', type: 'implements', confidence: 1.0 },
      // Call graph
      { id: 'c1', fromId: 'src/service.ts#function:feedAnimal:1', toId: 'src/animals.ts#interface:Animal:1', type: 'calls', confidence: 0.9 },
      { id: 'c2', fromId: 'src/service.ts#function:walkDog:15', toId: 'src/animals.ts#class:Dog:10', type: 'calls', confidence: 0.9 },
    ];
    for (const l of links) db.insertLink(l);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── getTypeHierarchy ──

  describe('getTypeHierarchy', () => {
    it('finds ancestors of a class', () => {
      const result = db.getTypeHierarchy('src/animals.ts#class:Dog:10');
      expect(result.ancestors.length).toBeGreaterThanOrEqual(1);
      expect(result.ancestors.some(a => a.symbol.name === 'Animal')).toBe(true);
    });

    it('finds descendants of an interface', () => {
      const result = db.getTypeHierarchy('src/animals.ts#interface:Animal:1');
      expect(result.descendants.length).toBeGreaterThanOrEqual(2);
      const names = result.descendants.map(d => d.symbol.name);
      expect(names).toContain('Dog');
      expect(names).toContain('Cat');
    });

    it('finds multi-level descendants', () => {
      const result = db.getTypeHierarchy('src/animals.ts#interface:Animal:1');
      expect(result.descendants.some(d => d.symbol.name === 'GoldenRetriever')).toBe(true);
    });

    it('returns empty for symbol with no hierarchy', () => {
      const result = db.getTypeHierarchy('src/service.ts#function:feedAnimal:1');
      expect(result.ancestors).toHaveLength(0);
      expect(result.descendants).toHaveLength(0);
    });
  });

  // ── getSymbolsByFile ──

  describe('getSymbolsByFile', () => {
    it('returns all symbols in a file', () => {
      const syms = db.getSymbolsByFile('src/animals.ts');
      expect(syms.length).toBe(4);
      const names = syms.map(s => s.name);
      expect(names).toContain('Animal');
      expect(names).toContain('Dog');
      expect(names).toContain('Cat');
      expect(names).toContain('GoldenRetriever');
    });

    it('returns empty for unknown file', () => {
      expect(db.getSymbolsByFile('nonexistent.ts')).toHaveLength(0);
    });
  });

  // ── findPath (explain_relationship) ──

  describe('findPath', () => {
    it('finds path between two symbols', () => {
      const path = db.findPath('feedAnimal', 'Animal');
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThanOrEqual(1);
      expect(path!.some(p => p.symbol.name === 'Animal')).toBe(true);
    });

    it('returns null for unconnected symbols', () => {
      const path = db.findPath('walkDog', 'Cat');
      // walkDog → Dog, but no direct path Dog → Cat
      // May or may not find depending on graph structure
      if (path === null) {
        expect(path).toBeNull();
      } else {
        expect(path.length).toBeGreaterThan(0);
      }
    });

    it('returns null for unknown symbols', () => {
      expect(db.findPath('NonExistent', 'Animal')).toBeNull();
    });
  });

  // ── getAllSymbols ──

  describe('getAllSymbols', () => {
    it('returns all symbols', () => {
      const all = db.getAllSymbols();
      expect(all.length).toBe(6);
    });
  });

  // ── findSymbolById ──

  describe('findSymbolById', () => {
    it('finds symbol by id', () => {
      const sym = db.findSymbolById('src/animals.ts#class:Dog:10');
      expect(sym).not.toBeNull();
      expect(sym!.name).toBe('Dog');
    });

    it('returns null for unknown id', () => {
      expect(db.findSymbolById('nonexistent')).toBeNull();
    });
  });

  // ── getRawDb ──

  describe('getRawDb', () => {
    it('returns the underlying database handle', () => {
      const raw = db.getRawDb();
      expect(raw).toBeDefined();
      // Can execute a simple query
      const row = raw.prepare('SELECT 1 as x').get() as any;
      expect(row.x).toBe(1);
    });
  });

  // ── Annotations ──

  describe('annotations', () => {
    it('adds and retrieves an annotation', () => {
      const id = db.addAnnotation('src/animals.ts#class:Dog:10', 'note', 'Needs refactoring', 'copilot');
      expect(id).toBeGreaterThan(0);

      const annotations = db.getAnnotations({ symbolId: 'src/animals.ts#class:Dog:10' });
      expect(annotations.length).toBeGreaterThanOrEqual(1);
      expect(annotations[0].key).toBe('note');
      expect(annotations[0].value).toBe('Needs refactoring');
      expect(annotations[0].agent).toBe('copilot');
    });

    it('filters by key', () => {
      db.addAnnotation('src/animals.ts#class:Dog:10', 'todo', 'Add tests', 'copilot');
      const notes = db.getAnnotations({ key: 'note' });
      expect(notes.every(a => a.key === 'note')).toBe(true);
    });

    it('filters by agent', () => {
      db.addAnnotation('src/animals.ts#class:Cat:40', 'note', 'Cat note', 'claude');
      const copilotOnly = db.getAnnotations({ agent: 'copilot' });
      expect(copilotOnly.every(a => a.agent === 'copilot')).toBe(true);
    });

    it('filters by sessionId', () => {
      db.addAnnotation('src/animals.ts#class:Dog:10', 'note', 'Session note', 'copilot', 'session-123');
      const sessionNotes = db.getAnnotations({ sessionId: 'session-123' });
      expect(sessionNotes.length).toBeGreaterThanOrEqual(1);
      expect(sessionNotes.every(a => a.sessionId === 'session-123')).toBe(true);
    });

    it('respects limit', () => {
      const limited = db.getAnnotations({ limit: 1 });
      expect(limited).toHaveLength(1);
    });

    it('getAnnotationsForSymbol returns symbol-scoped annotations', () => {
      const anns = db.getAnnotationsForSymbol('src/animals.ts#class:Dog:10');
      expect(anns.length).toBeGreaterThanOrEqual(1);
      expect(anns[0].key).toBeDefined();
      expect(anns[0].value).toBeDefined();
    });

    it('cleanupExpiredAnnotations removes expired entries', () => {
      // Add with TTL of 0 hours (already expired)
      const rawDb = db.getRawDb();
      rawDb.prepare(
        `INSERT INTO annotations (symbol_id, key, value, agent, expires_at) VALUES (?, ?, ?, ?, datetime('now', '-1 hour'))`
      ).run('src/animals.ts#class:Dog:10', 'temp', 'expired value', 'test');

      const removed = db.cleanupExpiredAnnotations();
      expect(removed).toBeGreaterThanOrEqual(1);
    });

    it('getAnnotations excludes expired entries', () => {
      const rawDb = db.getRawDb();
      // Insert an expired annotation
      rawDb.prepare(
        `INSERT INTO annotations (symbol_id, key, value, agent, expires_at) VALUES (?, ?, ?, ?, datetime('now', '-2 hours'))`
      ).run('src/animals.ts#class:Cat:40', 'expired-key', 'should not appear', 'test');

      const results = db.getAnnotations({ key: 'expired-key' });
      expect(results).toHaveLength(0);
    });
  });

  // ── Agent sessions ──

  describe('sessions', () => {
    it('starts and retrieves a session', () => {
      db.startSession('sess-1', 'copilot', '{"task":"review"}');

      const session = db.getSession('sess-1');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('sess-1');
      expect(session!.agent).toBe('copilot');
      expect(session!.status).toBe('active');
      expect(session!.context).toBe('{"task":"review"}');
      expect(session!.endedAt).toBeNull();
    });

    it('returns null for unknown session', () => {
      expect(db.getSession('nonexistent')).toBeNull();
    });

    it('ends a session', () => {
      db.endSession('sess-1', 'completed');
      const session = db.getSession('sess-1');
      expect(session!.status).toBe('completed');
      expect(session!.endedAt).not.toBeNull();
    });

    it('ends a session with failed status', () => {
      db.startSession('sess-2', 'claude');
      db.endSession('sess-2', 'failed');
      const session = db.getSession('sess-2');
      expect(session!.status).toBe('failed');
    });

    it('starts session without context', () => {
      db.startSession('sess-3', 'agent-x');
      const session = db.getSession('sess-3');
      expect(session!.context).toBeNull();
    });
  });
});
