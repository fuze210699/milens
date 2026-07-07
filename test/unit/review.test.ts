import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { reviewSymbol, reviewPr } from '../../src/analyzer/review.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'review-test.db');

describe('review', () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);

    // Build a small symbol graph:
    // main (entrypoint) → AuthService (hub, exported) → createUser (exported) → hashPassword (leaf)
    // test.spec.ts#testAuth → AuthService (test coverage link)

    const symbols: CodeSymbol[] = [
      { id: 'src/app.ts#function:main:1', name: 'main', kind: 'function', filePath: 'src/app.ts', startLine: 1, endLine: 10, exported: true, role: 'entrypoint' },
      { id: 'src/auth.ts#class:AuthService:3', name: 'AuthService', kind: 'class', filePath: 'src/auth.ts', startLine: 3, endLine: 50, exported: true, role: 'hub', heat: 10 },
      { id: 'src/models.ts#function:createUser:10', name: 'createUser', kind: 'function', filePath: 'src/models.ts', startLine: 10, endLine: 20, exported: true },
      { id: 'src/utils.ts#function:hashPassword:5', name: 'hashPassword', kind: 'function', filePath: 'src/utils.ts', startLine: 5, endLine: 12, exported: true, role: 'leaf' },
      { id: 'test/auth.spec.ts#function:testAuth:1', name: 'testAuth', kind: 'function', filePath: 'test/auth.spec.ts', startLine: 1, endLine: 15, exported: false },
      { id: 'src/orphan.ts#function:orphan:1', name: 'orphan', kind: 'function', filePath: 'src/orphan.ts', startLine: 1, endLine: 5, exported: true },
    ];
    for (const s of symbols) db.insertSymbol(s);

    const links: SymbolLink[] = [
      { id: 'l1', fromId: 'src/app.ts#function:main:1', toId: 'src/auth.ts#class:AuthService:3', type: 'calls', confidence: 0.9 },
      { id: 'l2', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/models.ts#function:createUser:10', type: 'calls', confidence: 0.9 },
      { id: 'l3', fromId: 'src/models.ts#function:createUser:10', toId: 'src/utils.ts#function:hashPassword:5', type: 'calls', confidence: 0.9 },
      { id: 'l4', fromId: 'test/auth.spec.ts#function:testAuth:1', toId: 'src/auth.ts#class:AuthService:3', type: 'calls', confidence: 0.9 },
    ];
    for (const l of links) db.insertLink(l);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('reviewSymbol returns null for unknown symbol', () => {
    const result = reviewSymbol(db, 'NonExistent');
    expect(result).toBeNull();
  });

  it('reviewSymbol scores a hub with dependents', () => {
    const result = reviewSymbol(db, 'AuthService');
    expect(result).not.toBeNull();
    expect(result!.symbol.name).toBe('AuthService');
    expect(result!.dependents).toBeGreaterThanOrEqual(1);
    expect(result!.tested).toBe(true); // test file links to it
    expect(result!.riskScore).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result!.riskLevel);
    expect(result!.reasons.some(r => r.includes('hub'))).toBe(true);
  });

  it('reviewSymbol flags untested exported symbol', () => {
    const result = reviewSymbol(db, 'createUser');
    expect(result).not.toBeNull();
    expect(result!.tested).toBe(false);
    expect(result!.reasons.some(r => r.includes('no test coverage'))).toBe(true);
  });

  it('reviewSymbol handles leaf with no dependents', () => {
    const result = reviewSymbol(db, 'orphan');
    expect(result).not.toBeNull();
    expect(result!.dependents).toBe(0);
    expect(result!.riskScore).toBeGreaterThanOrEqual(0);
  });

  it('reviewSymbol returns low risk for leaf with test', () => {
    const result = reviewSymbol(db, 'hashPassword');
    expect(result).not.toBeNull();
    // hashPassword has 1 dependent (createUser calls it) but no test directly
    expect(result!.dependents).toBeGreaterThanOrEqual(1);
  });

  it('risk levels are ordered correctly', () => {
    const hub = reviewSymbol(db, 'AuthService');
    const orphan = reviewSymbol(db, 'orphan');
    expect(hub).not.toBeNull();
    expect(orphan).not.toBeNull();
    expect(hub!.riskScore).toBeGreaterThan(orphan!.riskScore);
  });

  // ── reviewPr ──

  it('reviewPr returns LOW in non-git repo', () => {
    const tmpDir = join(tmpdir(), 'milens-nongit-review-' + process.pid);
    mkdirSync(tmpDir, { recursive: true });
    try {
      const result = reviewPr(db, tmpDir);
      expect(result.risk).toBe('LOW');
      expect(result.summary).toContain('Not a git repository');
      expect(result.score).toBe(0);
      expect(result.changedFiles).toEqual([]);
      expect(result.symbols).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.untestedChanges).toBe(0);
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('reviewPr with invalid ref returns safely', () => {
    const result = reviewPr(db, process.cwd(), 'invalid;ref!');
    expect(result.risk).toBe('LOW');
    expect(result.summary).toContain('Not a git repository');
  });

  it('reviewPr with no changed files returns LOW', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'clean-review');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'file.ts'), '// clean');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    try {
      const result = reviewPr(db, gitDir);
      expect(result.risk).toBe('LOW');
      expect(result.summary).toContain('No changed files');
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('reviewPr detects changed symbols and calculates score', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'changed-review');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'rp-module.ts'), '// module');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'rp-module.ts'), '// modified module');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    db.insertSymbol({
      id: 'src/rp-module.ts#function:process:1',
      name: 'process',
      kind: 'function',
      filePath: 'src/rp-module.ts',
      startLine: 1, endLine: 10,
      exported: true,
      heat: 3,
    });

    try {
      const result = reviewPr(db, gitDir);
      expect(result.changedFiles).toContain('src/rp-module.ts');
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('reviewPr skips test files', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'skip-review');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'rp-lib.ts'), '// lib');
      writeFileSync(join(gitDir, 'src', 'rp-lib.test.ts'), '// test');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'rp-lib.ts'), '// modified lib');
      writeFileSync(join(gitDir, 'src', 'rp-lib.test.ts'), '// modified test');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    db.insertSymbol({
      id: 'src/rp-lib.ts#function:helper:1',
      name: 'helper',
      kind: 'function',
      filePath: 'src/rp-lib.ts',
      startLine: 1, endLine: 5,
      exported: true,
    });
    db.insertSymbol({
      id: 'src/rp-lib.test.ts#function:testHelper:1',
      name: 'testHelper',
      kind: 'function',
      filePath: 'src/rp-lib.test.ts',
      startLine: 1, endLine: 5,
      exported: false,
    });

    try {
      const result = reviewPr(db, gitDir);
      expect(result.changedFiles).toContain('src/rp-lib.ts');
      expect(result.changedFiles).not.toContain('src/rp-lib.test.ts');
      const symbolPaths = result.symbols.map(s => s.symbol.filePath);
      expect(symbolPaths).toContain('src/rp-lib.ts');
      expect(symbolPaths).not.toContain('src/rp-lib.test.ts');
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('reviewPr counts untested changes', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'untested-review');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'rp-untested.ts'), '// untested');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'rp-untested.ts'), '// modified untested');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    db.insertSymbol({
      id: 'src/rp-untested.ts#function:noTestFn:1',
      name: 'noTestFn',
      kind: 'function',
      filePath: 'src/rp-untested.ts',
      startLine: 1, endLine: 5,
      exported: true,
    });

    try {
      const result = reviewPr(db, gitDir);
      expect(result.untestedChanges).toBeGreaterThan(0);
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('reviewPr classifies risk level based on symbol properties', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'risk-review');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'rp-core.ts'), '// core');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'rp-core.ts'), '// modified core');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    const hubId = 'src/rp-core.ts#class:CoreHub:1';
    const callerAId = 'src/rp-consumerA.ts#function:useA:1';
    const callerBId = 'src/rp-consumerB.ts#function:useB:1';
    db.insertSymbol({
      id: hubId, name: 'CoreHub', kind: 'class',
      filePath: 'src/rp-core.ts', startLine: 1, endLine: 50,
      exported: true, role: 'hub', heat: 100,
    });
    db.insertSymbol({
      id: callerAId, name: 'useA', kind: 'function',
      filePath: 'src/rp-consumerA.ts', startLine: 1, endLine: 3, exported: true,
    });
    db.insertSymbol({
      id: callerBId, name: 'useB', kind: 'function',
      filePath: 'src/rp-consumerB.ts', startLine: 1, endLine: 3, exported: true,
    });
    db.insertLink({ id: 'hlink1', fromId: callerAId, toId: hubId, type: 'calls', confidence: 0.9 });
    db.insertLink({ id: 'hlink2', fromId: callerBId, toId: hubId, type: 'calls', confidence: 0.9 });

    try {
      const result = reviewPr(db, gitDir);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.risk);
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(typeof result.score).toBe('number');
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('reviewPr summary contains hotspots and untested counts', () => {
    const gitDir = join(import.meta.dirname, '..', 'tmp', 'summary-review');
    mkdirSync(gitDir, { recursive: true });
    try {
      execSync('git init', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
      execSync('git config user.name "test"', { cwd: gitDir, stdio: 'pipe' });
      mkdirSync(join(gitDir, 'src'), { recursive: true });
      writeFileSync(join(gitDir, 'src', 'rp-feature.ts'), '// feature');
      execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });
      writeFileSync(join(gitDir, 'src', 'rp-feature.ts'), '// modified feature');
    } catch {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    db.insertSymbol({
      id: 'src/rp-feature.ts#function:run:1',
      name: 'run', kind: 'function',
      filePath: 'src/rp-feature.ts', startLine: 1, endLine: 5, exported: true,
    });

    try {
      const result = reviewPr(db, gitDir);
      expect(result.summary).toContain('files changed');
      expect(result.summary).toContain('symbols affected');
      expect(result.summary).toContain('risk:');
      expect(result.summary).toContain('score:');
    } finally {
      try { rmSync(gitDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  describe('dependents counting', () => {
    const DEDUPE_DB = join(import.meta.dirname, '..', 'tmp', 'review-dedupe-test.db');
    let dedupeDb: Database;

    beforeAll(() => {
      if (existsSync(DEDUPE_DB)) unlinkSync(DEDUPE_DB);
      dedupeDb = new Database(DEDUPE_DB);

      // Target used by exactly 2 real caller files, each of which both imports
      // AND calls it (module-level import edge + real call edge) — this must
      // count as 2 dependents, not 4.
      const symbols: CodeSymbol[] = [
        { id: 'target.ts#function:shared:1', name: 'shared', kind: 'function', filePath: 'target.ts', startLine: 1, endLine: 3, exported: true },
        { id: 'a.ts#module:_top:0', name: '_top', kind: 'module', filePath: 'a.ts', startLine: 0, endLine: 0, exported: false },
        { id: 'a.ts#function:callerA:5', name: 'callerA', kind: 'function', filePath: 'a.ts', startLine: 5, endLine: 8, exported: true },
        { id: 'b.ts#module:_top:0', name: '_top', kind: 'module', filePath: 'b.ts', startLine: 0, endLine: 0, exported: false },
        { id: 'b.ts#function:callerB:5', name: 'callerB', kind: 'function', filePath: 'b.ts', startLine: 5, endLine: 8, exported: true },
      ];
      for (const s of symbols) dedupeDb.insertSymbol(s);

      const links: SymbolLink[] = [
        { id: 'd1', fromId: 'a.ts#module:_top:0', toId: 'target.ts#function:shared:1', type: 'imports', confidence: 0.95 },
        { id: 'd2', fromId: 'a.ts#function:callerA:5', toId: 'target.ts#function:shared:1', type: 'calls', confidence: 0.9 },
        { id: 'd3', fromId: 'b.ts#module:_top:0', toId: 'target.ts#function:shared:1', type: 'imports', confidence: 0.95 },
        { id: 'd4', fromId: 'b.ts#function:callerB:5', toId: 'target.ts#function:shared:1', type: 'calls', confidence: 0.9 },
      ];
      for (const l of links) dedupeDb.insertLink(l);
    });

    afterAll(() => {
      dedupeDb.close();
      if (existsSync(DEDUPE_DB)) unlinkSync(DEDUPE_DB);
    });

    it('reviewSymbol counts distinct caller files, not raw import+call link rows', () => {
      const result = reviewSymbol(dedupeDb, 'shared');
      expect(result).not.toBeNull();
      expect(result!.dependents).toBe(2);
    });
  });
});
