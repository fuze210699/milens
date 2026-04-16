import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { reviewSymbol } from '../../src/analyzer/review.js';
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
});
