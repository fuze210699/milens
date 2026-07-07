/**
 * CLI Tests
 *
 * Strategy: cli.ts is a pure side-effect module (no exports) using Commander.
 * All command handlers do async dynamic imports that trigger heavy operations
 * (DB, file system, analysis, etc.). Testing those requires full infrastructure.
 *
 * What we test here:
 *   1. Module can be imported without crashing
 *   2. Help text is generated and includes all registered subcommands
 *   3. Version flag outputs the version string from package.json
 *   4. Version can be overridden via MILENS_VERSION env var
 *   5. Unknown/no-command scenarios don't crash
 *
 * We mock process.exit, process.stdout.write, process.stderr.write, console.log,
 * and console.error to prevent Commander from terminating the test runner and to
 * capture output for assertions.
 *
 * Dynamic import + vi.resetModules() is used because the module has top-level
 * side effects (program.parse()) and we need fresh state per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdirSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { RepoRegistry } from '../../src/store/registry.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

const PKG = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'),
);

const originalArgv = [...process.argv];

function getOutput(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
}

/**
 * Dynamically import the CLI module with given argv.
 * All spies must be in place BEFORE calling this.
 */
async function importCli(argv: string[] = []): Promise<void> {
  process.argv = ['node', 'milens', ...argv];
  await import('../../src/cli.js');
}

describe('CLI', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Bypass filesystem read for version — makes tests resilient to build artifacts
    process.env.MILENS_VERSION = PKG.version;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.argv = [...originalArgv];
    delete process.env.MILENS_VERSION;
  });

  // ── Import ──────────────────────────────────────────────────────────

  describe('module import', () => {
    it('imports without crashing (no args)', async () => {
      await expect(importCli()).resolves.toBeUndefined();
    });

    it('imports without crashing (--version)', async () => {
      await expect(importCli(['--version'])).resolves.toBeUndefined();
    });

    it('imports without crashing (--help)', async () => {
      await expect(importCli(['--help'])).resolves.toBeUndefined();
    });
  });

  // ── Version ─────────────────────────────────────────────────────────

  describe('--version', () => {
    it('outputs the version string', async () => {
      await importCli(['--version']);
      const output = getOutput(stdoutSpy);
      expect(output).toContain(PKG.version);
      expect(output.trim()).toBeTruthy();
    });

    it('terminates with exit code 0', async () => {
      await importCli(['--version']);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('respects MILENS_VERSION env var override', async () => {
      // AfterEach restores spies; we re-set for a fresh import with override.
      vi.restoreAllMocks();
      vi.resetModules();

      // milens(fix): rule=SEC-010 — Never assign secret values to process.env in code. Use external .env files (gitignored) or a secrets manager.
      process.env.MILENS_VERSION = '9.9.9-test';
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      process.argv = ['node', 'milens', '--version'];
      await import('../../src/cli.js');

      expect(getOutput(spy)).toContain('9.9.9-test');

      vi.restoreAllMocks();
      vi.resetModules();
      delete process.env.MILENS_VERSION;
    });
  });

  // ── Help ────────────────────────────────────────────────────────────

  describe('--help', () => {
    it('outputs help text', async () => {
      await importCli(['--help']);
      const output = getOutput(stdoutSpy);
      expect(output.length).toBeGreaterThan(200);
      expect(output).toContain('milens');
    });

    it('terminates with exit code 0', async () => {
      await importCli(['--help']);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('includes program description', async () => {
      await importCli(['--help']);
      const output = getOutput(stdoutSpy);
      expect(output).toContain('Code intelligence');
    });

    it('lists all expected top-level subcommands', async () => {
      await importCli(['--help']);
      const output = getOutput(stdoutSpy);

      const expected = [
        'analyze',
        'search',
        'inspect',
        'impact',
        'status',
        'list',
        'clean',
        'dashboard',
        'evolve',
        'metrics',
        'security',
        'hooks',
        'init',
        'watch',
        'workflow',
        'serve',
        'orchestrate',
      ];

      for (const cmd of expected) {
        expect(output).toContain(cmd);
      }
    });
  });

  // ── Package metadata ────────────────────────────────────────────────

  describe('version metadata', () => {
    it('package.json has a valid semver version', () => {
      expect(PKG.version).toBeTruthy();
      expect(PKG.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  // ── Hook actions ─────────────────────────────────────────────────────

  describe('hooks actions registered', () => {
    it('hooks --help shows new options', async () => {
      process.argv = ['node', 'milens', 'hooks', '--help'];
      await import('../../src/cli.js');

      const output = getOutput(stdoutSpy);
      expect(output).toContain('--agent');
      expect(output).toContain('--repo');
    });
  });

  describe('hook handler functions', () => {
    const TEST_DIR = join(import.meta.dirname, '..', 'tmp', 'hook-handler-test');

    beforeAll(() => {
      mkdirSync(join(TEST_DIR, '.milens'), { recursive: true });
      const dbPath = join(TEST_DIR, '.milens', 'milens.db');
      if (existsSync(dbPath)) unlinkSync(dbPath);
      const db = new Database(dbPath);
      db.close();
    });

    afterAll(() => {
      try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
    });

    it('defaultOnSessionStart returns codebase context', async () => {
      const { defaultOnSessionStart } = await import('../../src/server/hooks.js');
      const ctx = { agent: 'test', sessionId: 'test-session', rootPath: TEST_DIR };
      const dbPath = join(TEST_DIR, '.milens', 'milens.db');
      const output = await defaultOnSessionStart(ctx, dbPath);
      expect(output).toContain('Codebase Context');
      expect(output.length).toBeGreaterThan(0);
    });

    it('defaultOnPreCompact returns snapshot info', async () => {
      const { defaultOnPreCompact } = await import('../../src/server/hooks.js');
      const dbPath = join(TEST_DIR, '.milens', 'milens.db');
      const output = await defaultOnPreCompact(TEST_DIR, dbPath);
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain('Pre-compact');
    });

    it('defaultOnSessionEnd returns session summary', async () => {
      const { defaultOnSessionEnd } = await import('../../src/server/hooks.js');
      const ctx = { agent: 'test', sessionId: 'test-session', rootPath: TEST_DIR };
      const dbPath = join(TEST_DIR, '.milens', 'milens.db');
      const output = await defaultOnSessionEnd(ctx, dbPath);
      expect(output).toContain('Session End Summary');
      expect(output.length).toBeGreaterThan(0);
    });

    it('defaultOnPostCompact returns context restored message', async () => {
      const { defaultOnPostCompact } = await import('../../src/server/hooks.js');
      const output = await defaultOnPostCompact(TEST_DIR);
      expect(output.length).toBeGreaterThan(0);
    });
  });
});
