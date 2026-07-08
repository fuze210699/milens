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

  it('findDeadCode excludes section kind symbols (markdown headings)', () => {
    db.upsertFileHash('README.md', 'hash');
    db.insertSymbol({
      id: 'README.md#section:overview:5', name: 'Overview', kind: 'section',
      filePath: 'README.md', startLine: 5, endLine: 5, exported: true,
    });
    db.insertSymbol({
      id: 'README.md#section:usage:20', name: 'Usage', kind: 'section',
      filePath: 'README.md', startLine: 20, endLine: 20, exported: true,
    });
    db.upsertFileHash('src/real-unused.ts', 'hash');
    db.insertSymbol({
      id: 'src/real-unused.ts#function:realUnused:1', name: 'realUnused', kind: 'function',
      filePath: 'src/real-unused.ts', startLine: 1, endLine: 5, exported: true,
    });

    const dead = db.findDeadCode(undefined, 100);
    const deadNames = dead.map(s => s.name);

    expect(deadNames).not.toContain('Overview');
    expect(deadNames).not.toContain('Usage');
    expect(deadNames).toContain('realUnused');
  });

  it('getCodebaseSummary returns correct structure', () => {
    const summary = db.getCodebaseSummary();
    expect(summary.symbols).toBeGreaterThanOrEqual(2);
    expect(summary.links).toBeGreaterThanOrEqual(1);
    expect(summary.files).toBeGreaterThanOrEqual(3);
    expect(typeof summary.coveragePct).toBe('number');
    expect(typeof summary.testedSymbols).toBe('number');
    expect(typeof summary.exportedSymbols).toBe('number');
    expect(Array.isArray(summary.domains)).toBe(true);
    expect(Array.isArray(summary.topHubs)).toBe(true);
  });

  it('getTestImpact returns test files for changed symbols', () => {
    const testSym: CodeSymbol = {
      id: 'src/__tests__/auth.test.ts#function:testAuth:5',
      name: 'testAuth',
      kind: 'function',
      filePath: 'src/__tests__/auth.test.ts',
      startLine: 5,
      endLine: 10,
      exported: false,
    };
    db.insertSymbol(testSym);

    const testLink: SymbolLink = {
      id: 'src/__tests__/auth.test.ts#function:testAuth:5->calls->src/auth.ts#class:AuthService:3',
      fromId: testSym.id,
      toId: 'src/auth.ts#class:AuthService:3',
      type: 'calls',
      confidence: 0.8,
    };
    db.insertLink(testLink);

    const impact = db.getTestImpact(['src/auth.ts#class:AuthService:3']);
    expect(impact.testFiles).toContain('src/__tests__/auth.test.ts');
    expect(Array.isArray(impact.changedSymbols)).toBe(true);
  });

  it('getTestImpact returns empty for unknown symbols', () => {
    const impact = db.getTestImpact(['nonexistent:id:1']);
    expect(impact.testFiles).toEqual([]);
  });

  it('getTestCoverageGaps finds untested exported symbols with heat', () => {
    db.updateSymbolMetadata('src/unused.ts#function:unusedHelper:1', 'utility', 10);

    const gaps = db.getTestCoverageGaps(10);
    expect(gaps.length).toBeGreaterThan(0);
    const hasUnused = gaps.some(s => s.name === 'unusedHelper');
    expect(hasUnused).toBe(true);
  });

  it('findTopologicallySimilar returns similar symbols from same file', () => {
    const symA: CodeSymbol = {
      id: 'src/services/shared.ts#function:helperA:1',
      name: 'helperA',
      kind: 'function',
      filePath: 'src/services/shared.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    };
    const symB: CodeSymbol = {
      id: 'src/services/shared.ts#function:helperB:10',
      name: 'helperB',
      kind: 'function',
      filePath: 'src/services/shared.ts',
      startLine: 10,
      endLine: 15,
      exported: true,
    };
    db.insertSymbol(symA);
    db.insertSymbol(symB);

    const linkA: SymbolLink = {
      id: 'shared-helperA-calls-createUser',
      fromId: symA.id,
      toId: 'src/models.ts#function:createUser:10',
      type: 'calls',
      confidence: 0.8,
    };
    const linkB: SymbolLink = {
      id: 'shared-helperB-calls-createUser',
      fromId: symB.id,
      toId: 'src/models.ts#function:createUser:10',
      type: 'calls',
      confidence: 0.8,
    };
    const linkB2: SymbolLink = {
      id: 'shared-helperB-calls-auth',
      fromId: symB.id,
      toId: 'src/auth.ts#class:AuthService:3',
      type: 'calls',
      confidence: 0.8,
    };
    db.insertLink(linkA);
    db.insertLink(linkB);
    db.insertLink(linkB2);

    const similar = db.findTopologicallySimilar(symA.id, 10);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].symbol.name).toBe('helperB');
    expect(similar[0].similarity).toBeGreaterThan(0);
  });

  it('findTopologicallySimilar returns empty for unknown symbol', () => {
    const similar = db.findTopologicallySimilar('nonexistent:id:1', 10);
    expect(similar).toEqual([]);
  });

  it('getConfidenceDistribution returns distribution', () => {
    const dist = db.getConfidenceDistribution();
    expect(typeof dist.high).toBe('number');
    expect(typeof dist.medium).toBe('number');
    expect(typeof dist.low).toBe('number');
    expect(typeof dist.total).toBe('number');
    expect(dist.total).toBe(dist.high + dist.medium + dist.low);
  });

  it('getChangedFiles returns distinct file paths', () => {
    const files = db.getChangedFiles();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/auth.ts');
    expect(new Set(files).size).toBe(files.length);
  });

  it('logToolUsage and getToolUsageStats', () => {
    db.logToolUsage('test_query', 100, 500, 200);
    db.logToolUsage('test_grep', 200, 300, 150);

    const stats = db.getToolUsageStats();
    expect(stats.totalCalls).toBeGreaterThanOrEqual(2);
    expect(stats.totalTokensSaved).toBeGreaterThanOrEqual(350);
    expect(stats.totalTokensOut).toBeGreaterThanOrEqual(800);
    expect(stats.byTool.length).toBeGreaterThanOrEqual(2);
    expect(stats.byTool[0].tool).toBeDefined();
    expect(stats.byTool[0].calls).toBeGreaterThan(0);
    expect(Array.isArray(stats.byDay)).toBe(true);
    expect(Array.isArray(stats.recentCalls)).toBe(true);
  });

  it('getToolUsageStats with repo filter', () => {
    db.logToolUsage('repo_specific', 50, 100, 50, 'my-repo');

    const all = db.getToolUsageStats();
    const filtered = db.getToolUsageStats('my-repo');
    expect(filtered.totalCalls).toBeLessThan(all.totalCalls);
    expect(filtered.totalCalls).toBeGreaterThanOrEqual(1);
  });

  it('recordMetric, getMetricHistory, getMetricTrend', () => {
    db.recordMetric('loc', 5000);
    db.recordMetric('loc', 5200);

    const history = db.getMetricHistory('loc', 30);
    expect(history.length).toBeGreaterThanOrEqual(2);
    const values = history.map(h => h.value);
    expect(values).toContain(5000);
    expect(values).toContain(5200);

    const trend = db.getMetricTrend('loc');
    expect(typeof trend.current).toBe('number');
    expect(typeof trend.previous).toBe('number');
    expect(typeof trend.change).toBe('number');
    expect([5000, 5200]).toContain(trend.current);
    expect(trend.current).not.toBe(trend.previous);
  });

  it('getMetricTrend with single entry', () => {
    db.recordMetric('single_metric', 100);
    const trend = db.getMetricTrend('single_metric');
    expect(trend.current).toBe(100);
    expect(trend.previous).toBeNull();
    expect(trend.change).toBeNull();
  });

  it('getMetricTrend with no entries', () => {
    const trend = db.getMetricTrend('nonexistent_metric');
    expect(trend.current).toBe(0);
    expect(trend.previous).toBeNull();
    expect(trend.change).toBeNull();
  });

  it('getMetricHistory with no entries returns empty', () => {
    const history = db.getMetricHistory('nonexistent_metric', 30);
    expect(history).toEqual([]);
  });

  it('snapshotMetrics records current state', () => {
    db.snapshotMetrics();

    const symbolsHistory = db.getMetricHistory('symbols', 1);
    expect(symbolsHistory.length).toBeGreaterThan(0);

    const linksHistory = db.getMetricHistory('links', 1);
    expect(linksHistory.length).toBeGreaterThan(0);

    const coverageHistory = db.getMetricHistory('test_coverage_pct', 1);
    expect(coverageHistory.length).toBeGreaterThan(0);

    const deadCodeHistory = db.getMetricHistory('dead_code_count', 1);
    expect(deadCodeHistory.length).toBeGreaterThan(0);
  });

  it('isFileUpToDate detects unchanged/changed content', () => {
    const filePath = 'src/check.ts';
    const content = 'export const x = 1;';
    db.upsertFileHash(filePath, content);

    expect(db.isFileUpToDate(filePath, content)).toBe(true);
    expect(db.isFileUpToDate(filePath, 'export const x = 2;')).toBe(false);
    expect(db.isFileUpToDate('nonexistent/file.ts', content)).toBe(false);
  });

  it('rebuildSearch should not throw', () => {
    expect(() => db.rebuildSearch()).not.toThrow();
  });

  it('clearSymbolsAndLinks removes symbols and links', () => {
    const tempSym: CodeSymbol = {
      id: 'temp/file.ts#function:tempFn:1',
      name: 'tempFn',
      kind: 'function',
      filePath: 'temp/file.ts',
      startLine: 1,
      endLine: 5,
      exported: false,
    };
    db.insertSymbol(tempSym);

    const statsBefore = db.getStats();
    expect(statsBefore.symbols).toBeGreaterThanOrEqual(1);

    db.clearSymbolsAndLinks();

    const statsAfter = db.getStats();
    expect(statsAfter.symbols).toBe(0);
    expect(statsAfter.links).toBe(0);
  });

  it('clear removes all data including file hashes', () => {
    const sym: CodeSymbol = {
      id: 'clear/test.ts#function:clearTest:1',
      name: 'clearTest',
      kind: 'function',
      filePath: 'clear/test.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    };
    db.insertSymbol(sym);
    db.upsertFileHash('clear/test.ts', 'hash-clear');

    const statsBefore = db.getStats();
    expect(statsBefore.symbols).toBeGreaterThan(0);

    db.clear();

    const statsAfter = db.getStats();
    expect(statsAfter.symbols).toBe(0);
    expect(statsAfter.links).toBe(0);
    expect(statsAfter.files).toBe(0);
  });
});

// Separate describe with fresh DB for test-only-referenced detection
describe('findTestOnlyReferenced', () => {
  const TEST_DB2 = join(import.meta.dirname, '..', 'tmp', 'test-tor.db');
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB2)) unlinkSync(TEST_DB2);
    db = new Database(TEST_DB2);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB2)) unlinkSync(TEST_DB2);
  });

  it('returns symbol referenced only by test files', () => {
    db.insertSymbol({ id: 'src/orphan.ts#function:orphanFn:1', name: 'orphanFn', kind: 'function',
      filePath: 'src/orphan.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: 'test/orphan.test.ts#function:test_fn:5', name: 'test_fn', kind: 'function',
      filePath: 'test/orphan.test.ts', startLine: 5, endLine: 10, exported: false });
    db.insertLink({ id: 'torl1', fromId: 'test/orphan.test.ts#function:test_fn:5',
      toId: 'src/orphan.ts#function:orphanFn:1', type: 'calls', confidence: 0.9 });

    const results = db.findTestOnlyReferenced(20);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.name === 'orphanFn')).toBe(true);
  });

  it('does not return symbol also referenced by non-test file', () => {
    db.insertSymbol({ id: 'src/used.ts#function:usedFn:1', name: 'usedFn', kind: 'function',
      filePath: 'src/used.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: 'test/used.test.ts#function:test_fn2:5', name: 'test_fn2', kind: 'function',
      filePath: 'test/used.test.ts', startLine: 5, endLine: 10, exported: false });
    db.insertSymbol({ id: 'src/prod.ts#function:prodUser:10', name: 'prodUser', kind: 'function',
      filePath: 'src/prod.ts', startLine: 10, endLine: 15, exported: true });
    db.insertLink({ id: 'torl2', fromId: 'test/used.test.ts#function:test_fn2:5',
      toId: 'src/used.ts#function:usedFn:1', type: 'calls', confidence: 0.9 });
    db.insertLink({ id: 'torl3', fromId: 'src/prod.ts#function:prodUser:10',
      toId: 'src/used.ts#function:usedFn:1', type: 'calls', confidence: 0.9 });

    const results = db.findTestOnlyReferenced(20);
    expect(results.some(r => r.name === 'usedFn')).toBe(false);
  });

  it('returns empty for symbol with zero incoming links', () => {
    db.insertSymbol({ id: 'src/alone.ts#function:aloneFn:1', name: 'aloneFn', kind: 'function',
      filePath: 'src/alone.ts', startLine: 1, endLine: 5, exported: true });

    const results = db.findTestOnlyReferenced(20);
    expect(results.some(r => r.name === 'aloneFn')).toBe(false);
  });

  it('finds a low-heat orphan even when many higher-heat non-orphan candidates exist (limit must not truncate before filtering)', () => {
    // 25 high-heat symbols each with a real (non-test) caller — not orphaned.
    for (let i = 0; i < 25; i++) {
      db.insertSymbol({ id: `src/busy${i}.ts#function:busyFn${i}:1`, name: `busyFn${i}`, kind: 'function',
        filePath: `src/busy${i}.ts`, startLine: 1, endLine: 5, exported: true, heat: 90 });
      db.insertSymbol({ id: `src/caller${i}.ts#function:callerFn${i}:1`, name: `callerFn${i}`, kind: 'function',
        filePath: `src/caller${i}.ts`, startLine: 1, endLine: 5, exported: true, heat: 90 });
      db.insertLink({ id: `busyl${i}`, fromId: `src/caller${i}.ts#function:callerFn${i}:1`,
        toId: `src/busy${i}.ts#function:busyFn${i}:1`, type: 'calls', confidence: 0.9 });
    }

    // A single low-heat orphan referenced only by a test file — ranks below all 25 above by heat.
    db.insertSymbol({ id: 'src/lowheat.ts#function:lowHeatOrphan:1', name: 'lowHeatOrphan', kind: 'function',
      filePath: 'src/lowheat.ts', startLine: 1, endLine: 5, exported: true, heat: 1 });
    db.insertSymbol({ id: 'test/lowheat.test.ts#function:test_low:5', name: 'test_low', kind: 'function',
      filePath: 'test/lowheat.test.ts', startLine: 5, endLine: 10, exported: false });
    db.insertLink({ id: 'lowheatl1', fromId: 'test/lowheat.test.ts#function:test_low:5',
      toId: 'src/lowheat.ts#function:lowHeatOrphan:1', type: 'calls', confidence: 0.9 });

    // Default-ish small limit (30) — the orphan must still be found, not truncated away
    // by an internal SQL LIMIT applied before the test-only filter.
    const results = db.findTestOnlyReferenced(30);
    expect(results.some(r => r.name === 'lowHeatOrphan')).toBe(true);
  });
});
