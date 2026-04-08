import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from '../../src/core/tree-sitter/loader.js';
import { typescriptProvider } from '../../src/core/parsers/javascript.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'sample-ts', 'src');

describe('JavaScript/TypeScript Provider', () => {
  describe('auth.ts — functions + arrow functions + imports', () => {
    let parsed: ReturnType<typeof typescriptProvider.extract>;

    beforeAll(async () => {
      const source = readFileSync(join(FIXTURES, 'auth.ts'), 'utf-8');
      const tree = await parseSource(source, 'typescript');
      parsed = typescriptProvider.extract(source, 'src/auth.ts', tree);
    });

    it('should extract function declarations', () => {
      const handleLogin = parsed.nodes.find(n => n.name === 'handleLogin');
      expect(handleLogin).toBeDefined();
      expect(handleLogin!.label).toBe('Function');
      expect(handleLogin!.isExported).toBe(true);
      expect(handleLogin!.filePath).toBe('src/auth.ts');
    });

    it('should extract async functions', () => {
      const handleLogout = parsed.nodes.find(n => n.name === 'handleLogout');
      expect(handleLogout).toBeDefined();
      expect(handleLogout!.label).toBe('Function');
      expect(handleLogout!.isExported).toBe(true);
    });

    it('should extract arrow functions', () => {
      const formatDate = parsed.nodes.find(n => n.name === 'formatDate');
      expect(formatDate).toBeDefined();
      expect(formatDate!.label).toBe('Function');
    });

    it('should extract import statements', () => {
      expect(parsed.imports.length).toBeGreaterThanOrEqual(1);
      const userServiceImport = parsed.imports.find(i => i.source === './user-service');
      expect(userServiceImport).toBeDefined();
      expect(userServiceImport!.bindings).toContainEqual({ local: 'UserService', imported: 'UserService' });
    });

    it('should create DEFINES edges for each function', () => {
      const definesEdges = parsed.relationships.filter(r => r.type === 'DEFINES');
      expect(definesEdges.length).toBeGreaterThanOrEqual(3);  // handleLogin, handleLogout, formatDate
    });
  });

  describe('user-service.ts — classes, methods, interfaces, heritage', () => {
    let parsed: ReturnType<typeof typescriptProvider.extract>;

    beforeAll(async () => {
      const source = readFileSync(join(FIXTURES, 'user-service.ts'), 'utf-8');
      const tree = await parseSource(source, 'typescript');
      parsed = typescriptProvider.extract(source, 'src/user-service.ts', tree);
    });

    it('should extract interface', () => {
      const user = parsed.nodes.find(n => n.name === 'User' && n.label === 'Interface');
      expect(user).toBeDefined();
      expect(user!.isExported).toBe(true);
    });

    it('should extract class', () => {
      const cls = parsed.nodes.find(n => n.name === 'UserService' && n.label === 'Class');
      expect(cls).toBeDefined();
      expect(cls!.isExported).toBe(true);
    });

    it('should extract methods with HAS_METHOD edges', () => {
      const methods = parsed.nodes.filter(n => n.label === 'Method');
      expect(methods.length).toBeGreaterThanOrEqual(3); // authenticate, invalidateSession, findById

      const hasMethodEdges = parsed.relationships.filter(r => r.type === 'HAS_METHOD');
      expect(hasMethodEdges.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract fields with HAS_PROPERTY edges', () => {
      const props = parsed.nodes.filter(n => n.label === 'Property');
      const hasPropEdges = parsed.relationships.filter(r => r.type === 'HAS_PROPERTY');
      expect(props.length).toBeGreaterThanOrEqual(1);
      expect(hasPropEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect EXTENDS relationship', () => {
      const extendsEdges = parsed.relationships.filter(r => r.type === 'EXTENDS');
      expect(extendsEdges.length).toBeGreaterThanOrEqual(1);

      const userRepoExtends = extendsEdges.find(r => r.sourceId.includes('UserRepository'));
      expect(userRepoExtends).toBeDefined();
    });

    it('should extract abstract class', () => {
      const baseRepo = parsed.nodes.find(n => n.name === 'BaseRepository');
      expect(baseRepo).toBeDefined();
      expect(baseRepo!.label).toBe('Class');
    });
  });

  describe('types.ts — type aliases + interfaces', () => {
    let parsed: ReturnType<typeof typescriptProvider.extract>;

    beforeAll(async () => {
      const source = readFileSync(join(FIXTURES, 'types.ts'), 'utf-8');
      const tree = await parseSource(source, 'typescript');
      parsed = typescriptProvider.extract(source, 'src/types.ts', tree);
    });

    it('should extract exported interface', () => {
      const config = parsed.nodes.find(n => n.name === 'Config');
      expect(config).toBeDefined();
      expect(config!.label).toBe('Interface');
      expect(config!.isExported).toBe(true);
    });

    it('should extract type alias as Interface', () => {
      const userId = parsed.nodes.find(n => n.name === 'UserId');
      expect(userId).toBeDefined();
      expect(userId!.label).toBe('Interface');
    });
  });
});
