import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { existsSync, unlinkSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { analyze, getCachedTree, clearTreeCache } from '../../src/analyzer/engine.js';
import { Database } from '../../src/store/db.js';

describe('Engine Tree Cache', () => {
  it('getCachedTree returns undefined for unknown path', () => {
    expect(getCachedTree('/nonexistent.ts')).toBeUndefined();
  });

  it('clearTreeCache does not throw when called', () => {
    expect(() => clearTreeCache()).not.toThrow();
  });

  it('clearTreeCache can be called multiple times safely', () => {
    clearTreeCache();
    clearTreeCache();
    // Should not throw
  });

  it('getCachedTree returns undefined after clearing', () => {
    clearTreeCache();
    expect(getCachedTree('any.ts')).toBeUndefined();
  });

  it('tree cache is initially empty on module load', () => {
    clearTreeCache();
    // After clearing, any path should return undefined
    expect(getCachedTree('test.ts')).toBeUndefined();
    expect(getCachedTree('src/main.ts')).toBeUndefined();
  });
});

describe('Incremental analyze does not corrupt repo-wide meta', () => {
  const tmpDir = join(import.meta.dirname, '..', 'tmp', 'incr-meta');
  const dbPath = join(tmpDir, '.milens', 'test.db');

  beforeAll(async () => {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(join(tmpDir, 'test'), { recursive: true });
    mkdirSync(join(tmpDir, '.milens'), { recursive: true });

    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    writeFileSync(join(tmpDir, 'src', 'utils.ts'),
      'import { add } from "./math";\nexport function double(x: number): number {\n  return add(x, x);\n}\n');
    writeFileSync(join(tmpDir, 'test', 'math.test.ts'),
      'import { add } from "../src/math";\nimport { describe, it, expect } from "vitest";\n' +
      'describe("add", () => {\n  it("should add two numbers", () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});\n');

    if (existsSync(dbPath)) { try { unlinkSync(dbPath); } catch { /* */ } }
    await analyze({ rootPath: tmpDir, dbPath, force: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full analyze populates repo-wide meta with meaningful values', () => {
    const db = new Database(dbPath);
    const coverage = db.getTestCoverage();
    const domains = db.getDomainStats();
    const stats = db.getStats();
    db.close();

    expect(stats.symbols).toBeGreaterThan(0);
    expect(stats.links).toBeGreaterThan(0);
    expect(coverage.testFiles).toBeGreaterThan(0);
    expect(coverage.exportedProductionSymbols).toBeGreaterThan(0);
    expect(domains.length).toBeGreaterThan(0);
  });

  it('incremental analyze of one new file does not overwrite repo-wide meta', async () => {
    const dbBefore = new Database(dbPath);
    const coverageBefore = dbBefore.getTestCoverage();
    const domainsBefore = dbBefore.getDomainStats();
    dbBefore.close();

    writeFileSync(join(tmpDir, 'src', 'newfile.ts'),
      'export const VERSION = "1.0";\n');

    await analyze({ rootPath: tmpDir, dbPath, force: true, files: ['src/newfile.ts'] });

    const dbAfter = new Database(dbPath);
    const coverageAfter = dbAfter.getTestCoverage();
    const domainsAfter = dbAfter.getDomainStats();
    dbAfter.close();

    expect(coverageAfter.testFiles).toBe(coverageBefore.testFiles);
    expect(coverageAfter.testedSymbols).toBe(coverageBefore.testedSymbols);
    expect(coverageAfter.exportedProductionSymbols).toBe(coverageBefore.exportedProductionSymbols);
    expect(domainsAfter.length).toBe(domainsBefore.length);
  });
});
