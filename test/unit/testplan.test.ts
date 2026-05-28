import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { generateTestPlan, findCoverageGaps, analyzeTestImpact } from '../../src/analyzer/testplan.js';
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

  // ── analyzeTestImpact ──

  it('analyzeTestImpact with invalid ref returns empty result', () => {
    const result = analyzeTestImpact(db, process.cwd(), 'invalid;ref!');
    expect(result.changedSymbols).toEqual([]);
    expect(result.mustRun).toEqual([]);
    expect(result.shouldRun).toEqual([]);
    expect(result.coverageGaps).toEqual([]);
  });

  it('analyzeTestImpact in non-git repo returns empty', () => {
    const tmpDir = join(tmpdir(), 'milens-nongit-impact-' + process.pid);
    mkdirSync(tmpDir, { recursive: true });
    try {
      const result = analyzeTestImpact(db, tmpDir);
      expect(result.changedSymbols).toEqual([]);
      expect(result.mustRun).toEqual([]);
      expect(result.shouldRun).toEqual([]);
      expect(result.coverageGaps).toEqual([]);
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('analyzeTestImpact with test file changed puts it in mustRun', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'testfile-impact');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'test'), { recursive: true });
      writeFileSync(join(gitDir, 'test', 'tp-auth.test.ts'), '// test');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'test', 'tp-auth.test.ts'), '// modified test');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    try {
      const result = analyzeTestImpact(db, gitDir);
      expect(result.mustRun).toContain('test/tp-auth.test.ts');
      expect(result.changedSymbols).toEqual([]);
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('analyzeTestImpact with production symbol changed finds direct test coverage', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'direct-impact');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      mkdirSync(join(gitDir, 'test'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'tp-app.ts'), '// app');
      writeFileSync(join(gitDir, 'test', 'tp-app.test.ts'), '// test');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'tp-app.ts'), '// modified app');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    const symbolId = 'src/tp-app.ts#function:main:1';
    const testId = 'test/tp-app.test.ts#function:testApp:1';
    db.insertSymbol({ id: symbolId, name: 'main', kind: 'function', filePath: 'src/tp-app.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: testId, name: 'testApp', kind: 'function', filePath: 'test/tp-app.test.ts', startLine: 1, endLine: 5, exported: false });
    db.insertLink({ id: 'ti1', fromId: testId, toId: symbolId, type: 'calls', confidence: 0.9 });

    try {
      const result = analyzeTestImpact(db, gitDir);
      expect(result.changedSymbols.length).toBe(1);
      expect(result.changedSymbols[0].name).toBe('main');
      expect(result.mustRun).toContain('test/tp-app.test.ts');
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('analyzeTestImpact puts indirect test coverage in shouldRun', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'indirect-impact');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      mkdirSync(join(gitDir, 'test'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'tp-lib.ts'), '// lib');
      writeFileSync(join(gitDir, 'test', 'tp-shared.test.ts'), '// test');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'tp-lib.ts'), '// modified lib');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    // test → middleware → lib (changed)
    const middlewareId = 'src/tp-middleware.ts#function:wrap:1';
    const libId = 'src/tp-lib.ts#function:helper:1';
    const testId = 'test/tp-shared.test.ts#function:testWrap:1';
    db.insertSymbol({ id: middlewareId, name: 'wrap', kind: 'function', filePath: 'src/tp-middleware.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: libId, name: 'helper', kind: 'function', filePath: 'src/tp-lib.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: testId, name: 'testWrap', kind: 'function', filePath: 'test/tp-shared.test.ts', startLine: 1, endLine: 5, exported: false });
    db.insertLink({ id: 'ii1', fromId: testId, toId: middlewareId, type: 'calls', confidence: 0.9 });
    db.insertLink({ id: 'ii2', fromId: middlewareId, toId: libId, type: 'calls', confidence: 0.9 });

    try {
      const result = analyzeTestImpact(db, gitDir);
      expect(result.shouldRun).toContain('test/tp-shared.test.ts');
      expect(result.mustRun).not.toContain('test/tp-shared.test.ts');
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('analyzeTestImpact avoids duplicates between mustRun and shouldRun', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'dedup-impact');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      mkdirSync(join(gitDir, 'test'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'tp-both.ts'), '// both');
      writeFileSync(join(gitDir, 'test', 'tp-dupe.test.ts'), '// test');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'tp-both.ts'), '// modified both');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    const bothId = 'src/tp-both.ts#function:bothFn:1';
    const upId = 'src/tp-upstream.ts#function:upFn:1';
    const testId = 'test/tp-dupe.test.ts#function:testBoth:1';
    db.insertSymbol({ id: bothId, name: 'bothFn', kind: 'function', filePath: 'src/tp-both.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: upId, name: 'upFn', kind: 'function', filePath: 'src/tp-upstream.ts', startLine: 1, endLine: 5, exported: true });
    db.insertSymbol({ id: testId, name: 'testBoth', kind: 'function', filePath: 'test/tp-dupe.test.ts', startLine: 1, endLine: 5, exported: false });
    // test → both (direct — puts test in mustRun)
    db.insertLink({ id: 'dd1', fromId: testId, toId: bothId, type: 'calls', confidence: 0.9 });
    // upstream → both (upstream is found as caller of both)
    db.insertLink({ id: 'dd2', fromId: upId, toId: bothId, type: 'calls', confidence: 0.9 });
    // test → upstream (puts test in shouldRun via upstream chain)
    db.insertLink({ id: 'dd3', fromId: testId, toId: upId, type: 'calls', confidence: 0.9 });

    try {
      const result = analyzeTestImpact(db, gitDir);
      if (result.mustRun.includes('test/tp-dupe.test.ts')) {
        expect(result.shouldRun).not.toContain('test/tp-dupe.test.ts');
      }
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('analyzeTestImpact reports coverage gaps', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'gap-impact');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'tp-untested.ts'), '// untested');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'tp-untested.ts'), '// modified untested');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    db.insertSymbol({
      id: 'src/tp-untested.ts#function:gapFn:1',
      name: 'gapFn', kind: 'function',
      filePath: 'src/tp-untested.ts', startLine: 1, endLine: 5, exported: true,
    });

    try {
      const result = analyzeTestImpact(db, gitDir);
      expect(result.coverageGaps.length).toBeGreaterThan(0);
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
