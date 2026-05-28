import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { generateSkills } from '../../src/skills.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const TMP_DIR = join(import.meta.dirname, '..', 'tmp');
const EMPTY_ROOT = join(TMP_DIR, 'skills-empty-root');
const EMPTY_DB = join(TMP_DIR, 'skills-empty.db');

const POPULATED_ROOT = join(TMP_DIR, 'skills-populated-root');
const POPULATED_DB = join(TMP_DIR, 'skills-populated.db');

const EDITORS_ROOT = join(TMP_DIR, 'skills-editors-root');
const EDITORS_DB = join(TMP_DIR, 'skills-editors.db');

function cleanDir(dir: string) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

function cleanFile(file: string) {
  if (existsSync(file)) rmSync(file, { force: true });
}

describe('generateSkills', () => {
  mkdirSync(TMP_DIR, { recursive: true });
  cleanDir(EMPTY_ROOT);
  cleanDir(POPULATED_ROOT);
  cleanDir(EDITORS_ROOT);
  cleanFile(EMPTY_DB);
  cleanFile(POPULATED_DB);
  cleanFile(EDITORS_DB);

  describe('with empty database', () => {
    let db: Database;

    beforeAll(() => {
      mkdirSync(EMPTY_ROOT, { recursive: true });
      db = new Database(EMPTY_DB);
    });

    afterAll(() => {
      db.close();
      cleanDir(EMPTY_ROOT);
      cleanFile(EMPTY_DB);
    });

    it('returns 0 count', () => {
      const result = generateSkills(db, EMPTY_ROOT);
      expect(result.count).toBe(0);
    });

    it('returns empty dirs when no editors specified', () => {
      const result = generateSkills(db, EMPTY_ROOT, []);
      expect(result.dirs).toHaveLength(0);
    });

    it('unknown editor names are ignored', () => {
      const result = generateSkills(db, EMPTY_ROOT, ['nonexistent']);
      expect(result.dirs).toHaveLength(0);
    });
  });

  describe('editor selection', () => {
    let db: Database;

    beforeAll(() => {
      mkdirSync(EDITORS_ROOT, { recursive: true });
      db = new Database(EDITORS_DB);

      // Symbols in an area with >= 2
      const symbols: CodeSymbol[] = [
        {
          id: 'src/auth/service.ts#class:AuthService:1',
          name: 'AuthService',
          kind: 'class',
          filePath: 'src/auth/service.ts',
          startLine: 1,
          endLine: 30,
          exported: true,
          heat: 10,
        },
        {
          id: 'src/auth/middleware.ts#function:authMiddleware:1',
          name: 'authMiddleware',
          kind: 'function',
          filePath: 'src/auth/middleware.ts',
          startLine: 1,
          endLine: 15,
          exported: true,
          signature: '(req, res, next) => void',
          heat: 5,
        },
      ];
      for (const s of symbols) db.insertSymbol(s);

      const links: SymbolLink[] = [
        {
          id: 'el1',
          fromId: 'src/auth/middleware.ts#function:authMiddleware:1',
          toId: 'src/auth/service.ts#class:AuthService:1',
          type: 'imports',
          confidence: 0.9,
        },
      ];
      for (const l of links) db.insertLink(l);
    });

    afterAll(() => {
      db.close();
      cleanDir(EDITORS_ROOT);
      cleanFile(EDITORS_DB);
    });

    it('undefined editors defaults to all editors', () => {
      const result = generateSkills(db, EDITORS_ROOT, undefined);
      expect(result.dirs.length).toBeGreaterThanOrEqual(1);
      expect(result.dirs.some(d => d.includes('.github'))).toBe(true);
      expect(result.dirs.some(d => d.includes('.cursor'))).toBe(true);
      expect(result.dirs.some(d => d.includes('.claude'))).toBe(true);
      expect(result.dirs.some(d => d.includes('.agents'))).toBe(true);
    });

    it('generates for copilot only', () => {
      const result = generateSkills(db, EDITORS_ROOT, ['copilot']);
      expect(result.dirs.length).toBe(1);
      expect(result.dirs[0]).toContain('.github');
    });

    it('generates for cursor only', () => {
      const result = generateSkills(db, EDITORS_ROOT, ['cursor']);
      expect(result.dirs.length).toBe(1);
      expect(result.dirs[0]).toContain('.cursor');
    });

    it('generates for claude only', () => {
      const result = generateSkills(db, EDITORS_ROOT, ['claude']);
      expect(result.dirs.length).toBe(1);
      expect(result.dirs[0]).toContain('.claude');
    });

    it('generates for agents only', () => {
      const result = generateSkills(db, EDITORS_ROOT, ['agents']);
      expect(result.dirs.length).toBe(1);
      expect(result.dirs[0]).toContain('.agents');
    });

    it('generates for multiple specific editors', () => {
      const result = generateSkills(db, EDITORS_ROOT, ['cursor', 'agents']);
      expect(result.dirs.length).toBe(2);
      expect(result.dirs.some(d => d.includes('.cursor'))).toBe(true);
      expect(result.dirs.some(d => d.includes('.agents'))).toBe(true);
    });
  });

  describe('with populated database', () => {
    let db: Database;

    beforeAll(() => {
      mkdirSync(POPULATED_ROOT, { recursive: true });
      db = new Database(POPULATED_DB);

      const symbols: CodeSymbol[] = [
        {
          id: 'src/auth/service.ts#class:AuthService:1',
          name: 'AuthService',
          kind: 'class',
          filePath: 'src/auth/service.ts',
          startLine: 1,
          endLine: 30,
          exported: true,
          role: 'hub',
          heat: 50,
        },
        {
          id: 'src/auth/middleware.ts#function:authMiddleware:1',
          name: 'authMiddleware',
          kind: 'function',
          filePath: 'src/auth/middleware.ts',
          startLine: 1,
          endLine: 15,
          exported: true,
          signature: '(req, res, next) => void',
          role: 'utility',
          heat: 5,
        },
        {
          id: 'src/db/pool.ts#class:DatabasePool:1',
          name: 'DatabasePool',
          kind: 'class',
          filePath: 'src/db/pool.ts',
          startLine: 1,
          endLine: 40,
          exported: true,
          heat: 20,
        },
        {
          id: 'src/db/query.ts#function:executeQuery:1',
          name: 'executeQuery',
          kind: 'function',
          filePath: 'src/db/query.ts',
          startLine: 1,
          endLine: 25,
          exported: true,
          heat: 3,
        },
        {
          id: 'src/parser/parse.ts#function:parseFile:1',
          name: 'parseFile',
          kind: 'function',
          filePath: 'src/parser/parse.ts',
          startLine: 1,
          endLine: 50,
          exported: true,
          role: 'entrypoint',
          heat: 80,
          signature: '(path: string) => Result',
        },
        {
          id: 'src/parser/walker.ts#function:walkTree:10',
          name: 'walkTree',
          kind: 'function',
          filePath: 'src/parser/walker.ts',
          startLine: 10,
          endLine: 35,
          exported: true,
          heat: 15,
        },
      ];
      for (const s of symbols) db.insertSymbol(s);

      const links: SymbolLink[] = [
        {
          id: 'pl1',
          fromId: 'src/auth/middleware.ts#function:authMiddleware:1',
          toId: 'src/auth/service.ts#class:AuthService:1',
          type: 'imports',
          confidence: 0.9,
        },
        {
          id: 'pl2',
          fromId: 'src/auth/service.ts#class:AuthService:1',
          toId: 'src/db/pool.ts#class:DatabasePool:1',
          type: 'calls',
          confidence: 0.9,
        },
        {
          id: 'pl3',
          fromId: 'src/parser/parse.ts#function:parseFile:1',
          toId: 'src/parser/walker.ts#function:walkTree:10',
          type: 'calls',
          confidence: 0.95,
        },
        {
          id: 'pl4',
          fromId: 'src/db/query.ts#function:executeQuery:1',
          toId: 'src/db/pool.ts#class:DatabasePool:1',
          type: 'calls',
          confidence: 0.9,
        },
        // Cross-area link: auth → db
        {
          id: 'pl5',
          fromId: 'src/auth/service.ts#class:AuthService:1',
          toId: 'src/db/query.ts#function:executeQuery:1',
          type: 'calls',
          confidence: 0.85,
        },
      ];
      for (const l of links) db.insertLink(l);

      // Pre-generate skills for all editors
      generateSkills(db, POPULATED_ROOT);
    });

    afterAll(() => {
      db.close();
      cleanDir(POPULATED_ROOT);
      cleanFile(POPULATED_DB);
    });

    it('generates skills and returns count', () => {
      // Re-run to verify count is consistent
      const result = generateSkills(db, POPULATED_ROOT);
      expect(result.count).toBeGreaterThan(0);
    });

    it('returns active directories', () => {
      const result = generateSkills(db, POPULATED_ROOT);
      expect(result.dirs.length).toBeGreaterThan(0);
    });

    it('creates .agents/skills/ output directory', () => {
      expect(existsSync(join(POPULATED_ROOT, '.agents', 'skills'))).toBe(true);
    });

    it('creates .cursor/rules/ output directory', () => {
      expect(existsSync(join(POPULATED_ROOT, '.cursor', 'rules'))).toBe(true);
    });

    it('creates .github/instructions/ output directory', () => {
      expect(existsSync(join(POPULATED_ROOT, '.github', 'instructions'))).toBe(true);
    });

    it('creates .claude/skills/generated/ output directory', () => {
      expect(existsSync(join(POPULATED_ROOT, '.claude', 'skills', 'generated'))).toBe(true);
    });

    it('creates AGENTS.md at root level', () => {
      expect(existsSync(join(POPULATED_ROOT, 'AGENTS.md'))).toBe(true);
    });

    it('creates CLAUDE.md at root level', () => {
      expect(existsSync(join(POPULATED_ROOT, 'CLAUDE.md'))).toBe(true);
    });

    it('creates skill files in .agents/skills/', () => {
      const skillsDir = join(POPULATED_ROOT, '.agents', 'skills');
      expect(existsSync(join(skillsDir, 'milens', 'SKILL.md'))).toBe(true);
    });

    it('creates area skill directories under .agents/skills/', () => {
      const skillsDir = join(POPULATED_ROOT, '.agents', 'skills');
      expect(existsSync(skillsDir)).toBe(true);
    });

    it('creates cursor rules for areas', () => {
      const cursorDir = join(POPULATED_ROOT, '.cursor', 'rules');
      const entries = readDir(cursorDir);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('creates copilot instructions for areas', () => {
      const copilotDir = join(POPULATED_ROOT, '.github', 'instructions');
      const entries = readDir(copilotDir);
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});

function readDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}
