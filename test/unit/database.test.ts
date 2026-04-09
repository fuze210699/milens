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

  it('traces call chains to entrypoints', () => {
    // Add an entrypoint that calls AuthService
    const entrypoint: CodeSymbol = {
      id: 'src/app.ts#function:main:1',
      name: 'main',
      kind: 'function',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 10,
      exported: true,
      role: 'entrypoint',
    };
    db.insertSymbol(entrypoint);

    // main → AuthService (calls link)
    const link: SymbolLink = {
      id: 'src/app.ts#function:main:1->calls->src/auth.ts#class:AuthService:3',
      fromId: 'src/app.ts#function:main:1',
      toId: 'src/auth.ts#class:AuthService:3',
      type: 'calls',
      confidence: 0.9,
    };
    db.insertLink(link);

    // Trace from createUser → should find chain: main → AuthService → createUser
    const traces = db.traceToEntrypoints('src/models.ts#function:createUser:10');
    expect(traces.length).toBeGreaterThan(0);
    // First path should include 'main' somewhere in the chain
    const names = traces[0].path.map(s => s.symbol.name);
    expect(names).toContain('main');
    expect(names).toContain('createUser');
  });

  it('finds entrypoints', () => {
    const entrypoints = db.getEntrypoints();
    expect(entrypoints.some(s => s.name === 'main')).toBe(true);
  });

  it('stores and retrieves external resolution stats', () => {
    db.setMeta('external_imports', '42');
    db.setMeta('external_calls', '100');
    const stats = db.getUnresolvedStats();
    expect(stats.externalImports).toBe(42);
    expect(stats.externalCalls).toBe(100);
  });

  it('stores and retrieves test coverage metadata', () => {
    db.setMeta('test_files', '3');
    db.setMeta('tested_symbols', '12');
    db.setMeta('exported_production_symbols', '20');
    const coverage = db.getTestCoverage();
    expect(coverage.testFiles).toBe(3);
    expect(coverage.testedSymbols).toBe(12);
    expect(coverage.exportedProductionSymbols).toBe(20);
  });
});
