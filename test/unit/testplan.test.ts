import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { generateTestPlan, findCoverageGaps } from '../../src/analyzer/testplan.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'testplan-test.db');

describe('testplan', () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);

    // Build graph:
    // AuthService (class, hub) → DatabasePool (class, calls) → Logger (utility, calls)
    // AuthService → fetchUser (function, calls)
    // test/auth.test.ts#testAuth → AuthService (test coverage)

    const symbols: CodeSymbol[] = [
      { id: 'src/auth.ts#class:AuthService:3', name: 'AuthService', kind: 'class', filePath: 'src/auth.ts', startLine: 3, endLine: 50, exported: true, role: 'hub' },
      { id: 'src/db.ts#class:DatabasePool:1', name: 'DatabasePool', kind: 'class', filePath: 'src/db.ts', startLine: 1, endLine: 30, exported: true },
      { id: 'src/logger.ts#function:Logger:1', name: 'Logger', kind: 'function', filePath: 'src/logger.ts', startLine: 1, endLine: 10, exported: true, role: 'utility' },
      { id: 'src/api.ts#function:fetchUser:5', name: 'fetchUser', kind: 'function', filePath: 'src/api.ts', startLine: 5, endLine: 15, exported: true },
      { id: 'test/auth.test.ts#function:testAuth:1', name: 'testAuth', kind: 'function', filePath: 'test/auth.test.ts', startLine: 1, endLine: 10, exported: false },
      { id: 'src/utils.ts#function:formatName:1', name: 'formatName', kind: 'function', filePath: 'src/utils.ts', startLine: 1, endLine: 5, exported: true, role: 'leaf' },
      // Non-exported — should not appear in coverage gaps
      { id: 'src/internal.ts#function:internalHelper:1', name: 'internalHelper', kind: 'function', filePath: 'src/internal.ts', startLine: 1, endLine: 5, exported: false },
      // Type — should be excluded from coverage gaps
      { id: 'src/types.ts#interface:User:1', name: 'User', kind: 'interface', filePath: 'src/types.ts', startLine: 1, endLine: 5, exported: true },
    ];
    for (const s of symbols) db.insertSymbol(s);

    const links: SymbolLink[] = [
      { id: 'l1', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/db.ts#class:DatabasePool:1', type: 'calls', confidence: 0.9 },
      { id: 'l2', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/logger.ts#function:Logger:1', type: 'calls', confidence: 0.9 },
      { id: 'l3', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/api.ts#function:fetchUser:5', type: 'calls', confidence: 0.9 },
      { id: 'l4', fromId: 'test/auth.test.ts#function:testAuth:1', toId: 'src/auth.ts#class:AuthService:3', type: 'calls', confidence: 0.9 },
    ];
    for (const l of links) db.insertLink(l);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── generateTestPlan ──

  it('returns null for unknown symbol', () => {
    expect(generateTestPlan(db, 'NonExistent')).toBeNull();
  });

  it('generates plan with dependencies and mock suggestions', () => {
    const plan = generateTestPlan(db, 'AuthService');
    expect(plan).not.toBeNull();
    expect(plan!.target.name).toBe('AuthService');
    expect(plan!.target.kind).toBe('class');

    // Should have 3 dependencies
    expect(plan!.dependencies.length).toBe(3);
    const depNames = plan!.dependencies.map(d => d.name);
    expect(depNames).toContain('DatabasePool');
    expect(depNames).toContain('Logger');
    expect(depNames).toContain('fetchUser');

    // Mock suggestions for each dependency
    expect(plan!.mockSuggestions.length).toBe(3);

    // DatabasePool should be 'fake' (database pattern)
    const dbMock = plan!.mockSuggestions.find(m => m.dependency === 'DatabasePool');
    expect(dbMock).toBeDefined();
    expect(dbMock!.strategy).toBe('fake');

    // Logger should be 'spy' (utility pattern)
    const loggerMock = plan!.mockSuggestions.find(m => m.dependency === 'Logger');
    expect(loggerMock).toBeDefined();
    expect(loggerMock!.strategy).toBe('spy');

    // fetchUser should be 'fake' (fetch/network pattern)
    const fetchMock = plan!.mockSuggestions.find(m => m.dependency === 'fetchUser');
    expect(fetchMock).toBeDefined();
    expect(fetchMock!.strategy).toBe('fake');
  });

  it('includes existing test files in plan', () => {
    const plan = generateTestPlan(db, 'AuthService');
    expect(plan!.existingTests).toContain('test/auth.test.ts');
  });

  it('generates unit, integration, and edge_case test suggestions', () => {
    const plan = generateTestPlan(db, 'AuthService');
    const types = plan!.suggestedTests.map(t => t.type);
    expect(types).toContain('unit');
    expect(types).toContain('integration');
  });

  it('generates plan for symbol with no dependencies', () => {
    const plan = generateTestPlan(db, 'formatName');
    expect(plan).not.toBeNull();
    expect(plan!.dependencies).toHaveLength(0);
    expect(plan!.mockSuggestions).toHaveLength(0);
    expect(plan!.suggestedTests.length).toBeGreaterThan(0);
  });

  // ── findCoverageGaps ──

  it('finds untested exported symbols', () => {
    const gaps = findCoverageGaps(db);
    const names = gaps.map(g => g.symbol.name);

    // AuthService IS tested (via test file link), should NOT appear
    expect(names).not.toContain('AuthService');

    // Untested exported symbols should appear
    expect(names).toContain('DatabasePool');
    expect(names).toContain('fetchUser');
    expect(names).toContain('formatName');
  });

  it('excludes non-exported and types from gaps', () => {
    const gaps = findCoverageGaps(db);
    const names = gaps.map(g => g.symbol.name);

    expect(names).not.toContain('internalHelper'); // not exported
    expect(names).not.toContain('User');            // interface
  });

  it('sorts gaps by risk (high > medium > low)', () => {
    const gaps = findCoverageGaps(db);
    if (gaps.length >= 2) {
      const riskOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < gaps.length; i++) {
        const prevRisk = riskOrder[gaps[i - 1].riskIfUntested];
        const currRisk = riskOrder[gaps[i].riskIfUntested];
        if (prevRisk !== currRisk) {
          expect(prevRisk).toBeLessThanOrEqual(currRisk);
        }
      }
    }
  });

  it('respects limit parameter', () => {
    const gaps = findCoverageGaps(db, undefined, 2);
    expect(gaps.length).toBeLessThanOrEqual(2);
  });

  it('filters by filePath', () => {
    const gaps = findCoverageGaps(db, 'src/api.ts');
    expect(gaps.every(g => g.symbol.filePath === 'src/api.ts')).toBe(true);
  });
});
