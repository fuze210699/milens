import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { countDependentFiles, scoreSymbolRisk, classifyRisk } from '../../src/analyzer/risk.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'test-risk.db');

describe('countDependentFiles', () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
  });

  afterAll(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('returns 0 for symbol with no incoming links', () => {
    db.insertSymbol({ id: 'isolated.ts#function:noDeps:1', name: 'noDeps', kind: 'function',
      filePath: 'isolated.ts', startLine: 1, endLine: 3, exported: true });
    const result = countDependentFiles(db, 'isolated.ts#function:noDeps:1');
    expect(result.count).toBe(0);
    expect(result.files).toEqual([]);
  });

  it('dedupes by caller file — imports + calls from same file = 1 dependent', () => {
    db.insertSymbol({ id: 'target.ts#function:shared:1', name: 'shared', kind: 'function',
      filePath: 'target.ts', startLine: 1, endLine: 3, exported: true });
    db.insertSymbol({ id: 'a.ts#module:_top:0', name: '_top', kind: 'module',
      filePath: 'a.ts', startLine: 0, endLine: 0, exported: false });
    db.insertSymbol({ id: 'a.ts#function:callerA:5', name: 'callerA', kind: 'function',
      filePath: 'a.ts', startLine: 5, endLine: 8, exported: true });
    db.insertSymbol({ id: 'b.ts#module:_top:0', name: '_top', kind: 'module',
      filePath: 'b.ts', startLine: 0, endLine: 0, exported: false });
    db.insertSymbol({ id: 'b.ts#function:callerB:5', name: 'callerB', kind: 'function',
      filePath: 'b.ts', startLine: 5, endLine: 8, exported: true });
    db.insertLink({ id: 'l1', fromId: 'a.ts#module:_top:0', toId: 'target.ts#function:shared:1', type: 'imports', confidence: 0.9 });
    db.insertLink({ id: 'l2', fromId: 'a.ts#function:callerA:5', toId: 'target.ts#function:shared:1', type: 'calls', confidence: 0.9 });
    db.insertLink({ id: 'l3', fromId: 'b.ts#module:_top:0', toId: 'target.ts#function:shared:1', type: 'imports', confidence: 0.9 });
    db.insertLink({ id: 'l4', fromId: 'b.ts#function:callerB:5', toId: 'target.ts#function:shared:1', type: 'calls', confidence: 0.9 });

    const result = countDependentFiles(db, 'target.ts#function:shared:1');
    expect(result.count).toBe(2);
    expect(result.files).toHaveLength(2);
    expect(result.files).toContain('a.ts');
    expect(result.files).toContain('b.ts');
  });

  it('excludes test files when excludeTestFiles is true', () => {
    db.insertSymbol({ id: 'prod.ts#function:prodFn:1', name: 'prodFn', kind: 'function',
      filePath: 'prod.ts', startLine: 1, endLine: 3, exported: true });
    db.insertSymbol({ id: 'prod.test.ts#module:_top:0', name: '_top', kind: 'module',
      filePath: 'prod.test.ts', startLine: 0, endLine: 0, exported: false });
    db.insertSymbol({ id: 'src/caller.ts#function:realCaller:5', name: 'realCaller', kind: 'function',
      filePath: 'src/caller.ts', startLine: 5, endLine: 8, exported: true });
    db.insertLink({ id: 'tl1', fromId: 'prod.test.ts#module:_top:0', toId: 'prod.ts#function:prodFn:1', type: 'imports', confidence: 0.9 });
    db.insertLink({ id: 'tl2', fromId: 'src/caller.ts#function:realCaller:5', toId: 'prod.ts#function:prodFn:1', type: 'calls', confidence: 0.9 });

    const withTests = countDependentFiles(db, 'prod.ts#function:prodFn:1');
    expect(withTests.count).toBe(2);

    const withoutTests = countDependentFiles(db, 'prod.ts#function:prodFn:1', { excludeTestFiles: true });
    expect(withoutTests.count).toBe(1);
    expect(withoutTests.files).toEqual(['src/caller.ts']);
  });
});

describe('scoreSymbolRisk', () => {
  it('scores exported hub with many dependents and no test as HIGH+', () => {
    const sym = {
      id: 'x', name: 'criticalFn', kind: 'function' as const,
      filePath: 'src/critical.ts', startLine: 1, endLine: 10, exported: true,
      role: 'hub' as const, heat: 90,
    };
    const { score } = scoreSymbolRisk(sym, 12, false);
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it('scores internal implementation detail as 0', () => {
    const sym = {
      id: 'x', name: 'internalFn', kind: 'function' as const,
      filePath: 'src/internal.ts', startLine: 1, endLine: 5, exported: false,
      heat: 0,
    };
    const { score, reasons } = scoreSymbolRisk(sym, 0, false);
    expect(score).toBe(0);
    expect(reasons).toContain('internal implementation detail');
  });

  it('scores non-exported with single dependent as low', () => {
    const sym = {
      id: 'x', name: 'helperFn', kind: 'function' as const,
      filePath: 'src/helper.ts', startLine: 1, endLine: 5, exported: false,
      heat: 30,
    };
    const { score } = scoreSymbolRisk(sym, 1, false);
    expect(score).toBeLessThan(15);
  });
});

describe('classifyRisk', () => {
  it('returns CRITICAL for score >= 50', () => {
    expect(classifyRisk(50, false, false)).toBe('CRITICAL');
  });

  it('returns CRITICAL when hasCriticalHub is true', () => {
    expect(classifyRisk(5, false, true)).toBe('CRITICAL');
  });

  it('returns HIGH for score >= 30', () => {
    expect(classifyRisk(30, false, false)).toBe('HIGH');
  });

  it('returns MEDIUM for score >= 10', () => {
    expect(classifyRisk(10, false, false)).toBe('MEDIUM');
  });

  it('returns MEDIUM when hasUntested is true', () => {
    expect(classifyRisk(5, true, false)).toBe('MEDIUM');
  });

  it('returns LOW otherwise', () => {
    expect(classifyRisk(5, false, false)).toBe('LOW');
  });
});
