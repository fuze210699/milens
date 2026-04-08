import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'test.db');

describe('Database', () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('inserts and retrieves symbols', () => {
    const sym: CodeSymbol = {
      id: 'src/auth.ts#class:AuthService:3',
      name: 'AuthService',
      kind: 'class',
      filePath: 'src/auth.ts',
      startLine: 3,
      endLine: 20,
      exported: true,
    };
    db.insertSymbol(sym);

    const found = db.findSymbolByName('AuthService');
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('class');
    expect(found[0].exported).toBe(true);
  });

  it('inserts and retrieves links', () => {
    const target: CodeSymbol = {
      id: 'src/models.ts#function:createUser:10',
      name: 'createUser',
      kind: 'function',
      filePath: 'src/models.ts',
      startLine: 10,
      endLine: 12,
      exported: true,
    };
    db.insertSymbol(target);

    const link: SymbolLink = {
      id: 'src/auth.ts#class:AuthService:3->calls->src/models.ts#function:createUser:10',
      fromId: 'src/auth.ts#class:AuthService:3',
      toId: 'src/models.ts#function:createUser:10',
      type: 'calls',
      confidence: 0.9,
      line: 8,
    };
    db.insertLink(link);

    const incoming = db.getIncomingLinks(target.id);
    expect(incoming).toHaveLength(1);
    expect(incoming[0].type).toBe('calls');

    const outgoing = db.getOutgoingLinks('src/auth.ts#class:AuthService:3');
    expect(outgoing).toHaveLength(1);
  });

  it('searches symbols with FTS5', () => {
    db.rebuildSearch();
    const results = db.searchSymbols('Auth');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(s => s.name === 'AuthService')).toBe(true);
  });

  it('finds upstream dependencies via recursive CTE', () => {
    const upstream = db.findUpstream('src/models.ts#function:createUser:10', 3);
    expect(upstream.length).toBeGreaterThan(0);
    expect(upstream.some(u => u.symbol.name === 'AuthService')).toBe(true);
  });

  it('reports stats correctly', () => {
    const stats = db.getStats();
    expect(stats.symbols).toBeGreaterThanOrEqual(2);
    expect(stats.links).toBeGreaterThanOrEqual(1);
  });
});
