import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { generateTestPlan } from '../../src/server/test-plan.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'server-testplan.db');

describe('generateTestPlan', () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);

    const symbols: CodeSymbol[] = [
      {
        id: 'src/auth.ts#class:AuthService:3',
        name: 'AuthService',
        kind: 'class',
        filePath: 'src/auth.ts',
        startLine: 3,
        endLine: 50,
        exported: true,
        role: 'hub',
        signature: 'class AuthService',
      },
      {
        id: 'src/db.ts#class:DatabasePool:1',
        name: 'DatabasePool',
        kind: 'class',
        filePath: 'src/db.ts',
        startLine: 1,
        endLine: 30,
        exported: true,
      },
      {
        id: 'src/api.ts#function:fetchUser:5',
        name: 'fetchUser',
        kind: 'function',
        filePath: 'src/api.ts',
        startLine: 5,
        endLine: 15,
        exported: true,
      },
      {
        id: 'src/logger.ts#function:Logger:1',
        name: 'Logger',
        kind: 'function',
        filePath: 'src/logger.ts',
        startLine: 1,
        endLine: 10,
        exported: true,
      },
      {
        id: 'src/auth.ts#function:hashPassword:55',
        name: 'hashPassword',
        kind: 'function',
        filePath: 'src/auth.ts',
        startLine: 55,
        endLine: 60,
        exported: true,
      },
      {
        id: 'src/utils.ts#function:formatName:1',
        name: 'formatName',
        kind: 'function',
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 5,
        exported: true,
        role: 'leaf',
      },
      {
        id: 'test/auth.test.ts#function:testAuth:1',
        name: 'testAuth',
        kind: 'function',
        filePath: 'test/auth.test.ts',
        startLine: 1,
        endLine: 10,
        exported: false,
      },
      {
        id: 'test/auth.spec.ts#function:testAuthEdge:2',
        name: 'testAuthEdge',
        kind: 'function',
        filePath: 'test/auth.spec.ts',
        startLine: 2,
        endLine: 12,
        exported: false,
      },
      {
        id: 'src/__tests__/auth.test.ts#function:testAuthIntegration:1',
        name: 'testAuthIntegration',
        kind: 'function',
        filePath: 'src/__tests__/auth.test.ts',
        startLine: 1,
        endLine: 10,
        exported: false,
      },
    ];
    for (const s of symbols) db.insertSymbol(s);

    const links: SymbolLink[] = [
      // External module dep (calls, different file) → 'mock'
      { id: 'l1', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/db.ts#class:DatabasePool:1', type: 'calls', confidence: 0.9 },
      // External module dep (calls, different file) → 'mock'
      { id: 'l2', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/api.ts#function:fetchUser:5', type: 'calls', confidence: 0.9 },
      // Imported from different file → 'stub'
      { id: 'l3', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/logger.ts#function:Logger:1', type: 'imports', confidence: 0.9 },
      // Same-file helper → 'spy'
      { id: 'l4', fromId: 'src/auth.ts#class:AuthService:3', toId: 'src/auth.ts#function:hashPassword:55', type: 'calls', confidence: 0.9 },
      // Test files calling AuthService (existing tests detection)
      { id: 'l5', fromId: 'test/auth.test.ts#function:testAuth:1', toId: 'src/auth.ts#class:AuthService:3', type: 'calls', confidence: 0.9 },
      { id: 'l6', fromId: 'test/auth.spec.ts#function:testAuthEdge:2', toId: 'src/auth.ts#class:AuthService:3', type: 'calls', confidence: 0.9 },
      { id: 'l7', fromId: 'src/__tests__/auth.test.ts#function:testAuthIntegration:1', toId: 'src/auth.ts#class:AuthService:3', type: 'calls', confidence: 0.9 },
    ];
    for (const l of links) db.insertLink(l);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('returns null for non-existent symbol', () => {
    expect(generateTestPlan(db, 'NonExistent')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(generateTestPlan(db, '')).toBeNull();
  });

  describe('symbol with dependencies', () => {
    it('returns plan with all expected fields', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan).not.toBeNull();
      expect(plan!.symbol).toBe('AuthService');
      expect(plan!.kind).toBe('class');
      expect(plan!.file).toBe('src/auth.ts');
      expect(plan!.signature).toBe('class AuthService');
      expect(plan!.mockStrategy).toBeDefined();
      expect(plan!.testScenarios).toBeDefined();
      expect(plan!.existingTests).toBeDefined();
      expect(plan!.planText).toBeDefined();
      expect(plan!.planText.length).toBeGreaterThan(0);
    });

    it('classifies external module dependency as mock', () => {
      const plan = generateTestPlan(db, 'AuthService');
      const dbMock = plan!.mockStrategy.find(m => m.dependency === 'DatabasePool');
      expect(dbMock).toBeDefined();
      expect(dbMock!.type).toBe('mock');
      expect(dbMock!.reason.length).toBeGreaterThan(0);
    });

    it('classifies external calls dependency as mock', () => {
      const plan = generateTestPlan(db, 'AuthService');
      const fetchMock = plan!.mockStrategy.find(m => m.dependency === 'fetchUser');
      expect(fetchMock).toBeDefined();
      expect(fetchMock!.type).toBe('mock');
    });

    it('classifies imported type from different file as stub', () => {
      const plan = generateTestPlan(db, 'AuthService');
      const loggerStub = plan!.mockStrategy.find(m => m.dependency === 'Logger');
      expect(loggerStub).toBeDefined();
      expect(loggerStub!.type).toBe('stub');
    });

    it('classifies same-file helper as spy', () => {
      const plan = generateTestPlan(db, 'AuthService');
      const hashSpy = plan!.mockStrategy.find(m => m.dependency === 'hashPassword');
      expect(hashSpy).toBeDefined();
      expect(hashSpy!.type).toBe('spy');
    });

    it('includes 3 test scenarios', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan!.testScenarios).toHaveLength(3);
      const names = plan!.testScenarios.map(s => s.name);
      expect(names).toEqual(['Happy path', 'Edge case', 'Error handling']);
    });

    it('test scenarios have non-empty descriptions', () => {
      const plan = generateTestPlan(db, 'AuthService');
      for (const scenario of plan!.testScenarios) {
        expect(scenario.description.length).toBeGreaterThan(0);
      }
    });

    it('detects existing tests from .test.ts files', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan!.existingTests).toContain('testAuth');
    });

    it('detects existing tests from .spec.ts files', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan!.existingTests).toContain('testAuthEdge');
    });

    it('detects existing tests from __tests__ directory', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan!.existingTests).toContain('testAuthIntegration');
    });

    it('planText contains required sections', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan!.planText).toContain('# Test Plan');
      expect(plan!.planText).toContain('Mock Strategy');
      expect(plan!.planText).toContain('Test Scenarios');
      expect(plan!.planText).toContain('Happy path');
    });

    it('planText includes Existing Tests section with found tests', () => {
      const plan = generateTestPlan(db, 'AuthService');
      expect(plan!.planText).toContain('Existing Tests');
      expect(plan!.planText).toContain('testAuth');
    });
  });

  describe('symbol with no dependencies', () => {
    it('returns plan with empty mock strategy', () => {
      const plan = generateTestPlan(db, 'formatName');
      expect(plan).not.toBeNull();
      expect(plan!.symbol).toBe('formatName');
      expect(plan!.mockStrategy).toHaveLength(0);
    });

    it('returns plan with empty existing tests', () => {
      const plan = generateTestPlan(db, 'formatName');
      expect(plan!.existingTests).toHaveLength(0);
    });

    it('still includes 3 test scenarios', () => {
      const plan = generateTestPlan(db, 'formatName');
      expect(plan!.testScenarios).toHaveLength(3);
    });

    it('planText shows no existing tests message', () => {
      const plan = generateTestPlan(db, 'formatName');
      expect(plan!.planText).toContain('No existing tests found');
    });

    it('planText shows no external dependencies', () => {
      const plan = generateTestPlan(db, 'formatName');
      expect(plan!.planText).toContain('No external module dependencies to mock');
    });
  });
});
