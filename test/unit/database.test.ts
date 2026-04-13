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

  it('finds upstream via import links when _top module symbol exists', () => {
    // Simulate: VueFile.vue imports useClipboard from composable.js
    const composable: CodeSymbol = {
      id: 'src/composables/useClipboard.js#function:useClipboard:6',
      name: 'useClipboard',
      kind: 'function',
      filePath: 'src/composables/useClipboard.js',
      startLine: 6,
      endLine: 12,
      exported: true,
    };
    db.insertSymbol(composable);

    // The _top module symbol for the Vue file (created by engine.ts)
    const topModule: CodeSymbol = {
      id: 'src/views/ClipboardView.vue#module:_top:0',
      name: '_top',
      kind: 'module',
      filePath: 'src/views/ClipboardView.vue',
      startLine: 0,
      endLine: 0,
      exported: false,
    };
    db.insertSymbol(topModule);

    // Import link: Vue file _top → composable function
    const importLink: SymbolLink = {
      id: 'src/views/ClipboardView.vue#module:_top:0->imports->src/composables/useClipboard.js#function:useClipboard:6',
      fromId: 'src/views/ClipboardView.vue#module:_top:0',
      toId: 'src/composables/useClipboard.js#function:useClipboard:6',
      type: 'imports',
      confidence: 0.95,
      line: 2,
    };
    db.insertLink(importLink);

    // findUpstream should now find the Vue file as an upstream dependent
    const upstream = db.findUpstream('src/composables/useClipboard.js#function:useClipboard:6', 3);
    expect(upstream.length).toBeGreaterThan(0);
    expect(upstream.some(u => u.symbol.name === '_top' && u.symbol.filePath === 'src/views/ClipboardView.vue')).toBe(true);
    expect(upstream.some(u => u.via === 'imports')).toBe(true);
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

  it('returns domain stats grouped by zone', () => {
    // Zones are set via setFileZone — simulate domain clustering output
    db.upsertFileHash('src/auth.ts', 'hash-auth');
    db.setFileZone('src/auth.ts', 'auth');
    db.upsertFileHash('src/models.ts', 'hash-models');
    db.setFileZone('src/models.ts', 'auth');
    db.upsertFileHash('src/app.ts', 'hash-app');
    db.setFileZone('src/app.ts', 'app');

    const domains = db.getDomainStats();
    expect(domains.length).toBeGreaterThanOrEqual(2);
    const authDomain = domains.find(d => d.domain === 'auth');
    expect(authDomain).toBeDefined();
    expect(authDomain!.files).toBe(2);
    const appDomain = domains.find(d => d.domain === 'app');
    expect(appDomain).toBeDefined();
    expect(appDomain!.files).toBe(1);
  });

  it('detects stale files by analyzed_at timestamp', () => {
    // Recently analyzed files should NOT appear as stale
    const stale = db.getStaleFiles(24);
    // All files were just upserted, so none should be stale at 24h
    const recentFiles = ['src/auth.ts', 'src/models.ts', 'src/app.ts'];
    for (const f of recentFiles) {
      expect(stale).not.toContain(f);
    }
  });

  it('returns files by zone', () => {
    const authFiles = db.db_getFilesByZone('auth');
    expect(authFiles).toContain('src/auth.ts');
    expect(authFiles).toContain('src/models.ts');
    expect(authFiles).not.toContain('src/app.ts');
  });

  it('returns repo summary with domains and stale count', () => {
    const summary = db.getRepoSummary();
    expect(summary.symbols).toBeGreaterThanOrEqual(2);
    expect(summary.links).toBeGreaterThanOrEqual(1);
    expect(summary.files).toBeGreaterThanOrEqual(3);
    expect(summary.domains).toContain('auth');
    expect(summary.domains).toContain('app');
    expect(typeof summary.staleCount).toBe('number');
  });

  it('findDeadCode excludes framework entry point files', () => {
    // Insert exported symbols in framework entry point files
    const entrySymbols: CodeSymbol[] = [
      { id: 'app/dashboard/page.tsx#function:DashboardPage:1', name: 'DashboardPage', kind: 'function', filePath: 'app/dashboard/page.tsx', startLine: 1, endLine: 10, exported: true },
      { id: 'app/layout.tsx#function:RootLayout:1', name: 'RootLayout', kind: 'function', filePath: 'app/layout.tsx', startLine: 1, endLine: 10, exported: true },
      { id: 'app/api/users/route.ts#function:GET:1', name: 'GET', kind: 'function', filePath: 'app/api/users/route.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'jest.config.ts#variable:config:1', name: 'config', kind: 'variable', filePath: 'jest.config.ts', startLine: 1, endLine: 5, exported: true },
      { id: 'src/routes/+page.svelte#function:load:1', name: 'load', kind: 'function', filePath: 'src/routes/+page.svelte', startLine: 1, endLine: 5, exported: true },
    ];
    for (const sym of entrySymbols) {
      db.upsertFileHash(sym.filePath, 'hash');
      db.insertSymbol(sym);
    }

    // Insert a normal unused exported symbol
    db.upsertFileHash('src/unused.ts', 'hash');
    db.insertSymbol({
      id: 'src/unused.ts#function:unusedHelper:1', name: 'unusedHelper', kind: 'function',
      filePath: 'src/unused.ts', startLine: 1, endLine: 5, exported: true,
    });

    const dead = db.findDeadCode(undefined, 100);
    const deadNames = dead.map(s => s.name);

    // Framework entry points should NOT appear
    expect(deadNames).not.toContain('DashboardPage');
    expect(deadNames).not.toContain('RootLayout');
    expect(deadNames).not.toContain('GET');
    expect(deadNames).not.toContain('config');
    expect(deadNames).not.toContain('load');

    // Normal unused symbol SHOULD appear
    expect(deadNames).toContain('unusedHelper');
  });
});
