import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HookManager, HookConfig, defaultOnSessionStart, defaultOnSessionEnd, defaultOnPreCommit, defaultOnFileChange, defaultOnPreCompact, defaultOnPostCompact } from '../../src/server/hooks.js';
import { Database } from '../../src/store/db.js';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';
import type { SessionContext } from '../../src/server/hooks.js';

describe('HookManager', () => {
  let manager: HookManager;
  let testDir: string;

  beforeEach(() => {
    manager = new HookManager();
    testDir = join(tmpdir(), `milens-hook-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      const hooksPath = join(testDir, '.milens', 'hooks.json');
      if (existsSync(hooksPath)) {
        unlinkSync(hooksPath);
      }
    } catch {}
  });

  it('loads default config with all hooks enabled', () => {
    const config = manager.loadConfig(testDir);
    expect(config.enabled).toBe(true);
    expect(config.onSessionStart).toBe(true);
    expect(config.onSessionEnd).toBe(true);
    expect(config.onPreCommit).toBe(true);
    expect(config.onFileChange).toBe(true);
    expect(config.onPreCompact).toBe(true);
    expect(config.onPostCompact).toBe(true);
  });

  it('saves and loads config persistently', () => {
    const config: HookConfig = {
      enabled: true,
      onSessionStart: true,
      onSessionEnd: false,
      onPreCommit: true,
      onFileChange: false,
      onPreCompact: false,
      onPostCompact: false,
    };
    manager.saveConfig(config, testDir);

    const loaded = manager.loadConfig(testDir);
    expect(loaded.onSessionStart).toBe(true);
    expect(loaded.onSessionEnd).toBe(false);
    expect(loaded.onPreCommit).toBe(true);
    expect(loaded.onFileChange).toBe(false);
  });

  it('enables a single hook', () => {
    let config = manager.loadConfig(testDir);
    config.onSessionStart = false;
    manager.saveConfig(config, testDir);

    manager.enableHook('onSessionStart', testDir);
    const updated = manager.loadConfig(testDir);
    expect(updated.onSessionStart).toBe(true);
  });

  it('disables a single hook', () => {
    manager.disableHook('onSessionStart', testDir);
    const updated = manager.loadConfig(testDir);
    expect(updated.onSessionStart).toBe(false);
  });

  it('toggles enabled state', () => {
    manager.enableHook('onPreCommit', testDir);
    expect(manager.loadConfig(testDir).onPreCommit).toBe(true);

    manager.disableHook('onPreCommit', testDir);
    expect(manager.loadConfig(testDir).onPreCommit).toBe(false);
  });

  it('throws on unknown hook name', () => {
    expect(() => manager.enableHook('unknownHook' as any, testDir)).toThrow('Unknown hook');
    expect(() => manager.disableHook('unknownHook' as any, testDir)).toThrow('Unknown hook');
  });

  it('returns project config path', () => {
    const configPath = manager.getProjectConfigPath(testDir);
    expect(configPath).toContain('.milens');
    expect(configPath).toContain('hooks.json');
  });
});

describe('default hook functions', () => {
  let testDir: string;
  let milensDir: string;
  let dbPath: string;
  let ctx: SessionContext;

  function seedDatabase(db: Database): void {
    const syms: CodeSymbol[] = [
      { id: 'src/main.ts#function:main:1', name: 'main', kind: 'function', filePath: 'src/main.ts', startLine: 1, endLine: 10, exported: true, role: 'entrypoint', heat: 10 },
      { id: 'src/utils.ts#function:helper:5', name: 'helper', kind: 'function', filePath: 'src/utils.ts', startLine: 5, endLine: 12, exported: false, heat: 5 },
      { id: 'src/orphan.ts#function:orphan:1', name: 'orphan', kind: 'function', filePath: 'src/orphan.ts', startLine: 1, endLine: 5, exported: true },
    ];
    for (const s of syms) db.insertSymbol(s);

    const links: SymbolLink[] = [
      { id: 'l1', fromId: 'src/main.ts#function:main:1', toId: 'src/utils.ts#function:helper:5', type: 'calls', confidence: 0.9 },
    ];
    for (const l of links) db.insertLink(l);

    db.upsertFileHash('src/main.ts', 'content-main');
    db.upsertFileHash('src/utils.ts', 'content-util');
    db.upsertFileHash('src/orphan.ts', 'content-orphan');

    db.setMeta('tested_symbols', '1');
    db.setMeta('exported_production_symbols', '2');
    db.setMeta('test_files', '1');
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `milens-hook-fn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    milensDir = join(testDir, '.milens');
    mkdirSync(milensDir, { recursive: true });
    dbPath = join(milensDir, 'milens.db');
    ctx = { agent: 'test-agent', sessionId: 'test-session-123', rootPath: testDir };
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  // ── defaultOnSessionStart ──

  it('defaultOnSessionStart returns codebase context with stats for valid DB', async () => {
    const db = new Database(dbPath);
    seedDatabase(db);
    db.close();

    const result = await defaultOnSessionStart(ctx, dbPath);
    expect(result).toContain('## Codebase Context');
    expect(result).toContain('3 files');
    expect(result).toContain('3 symbols');
    expect(result).toContain('**50%**');
  });

  it('defaultOnSessionStart throws for invalid DB path', async () => {
    const badPath = join(testDir, '__nonexistent__', 'db.db');
    await expect(defaultOnSessionStart(ctx, badPath)).rejects.toThrow();
  });

  // ── defaultOnSessionEnd ──

  it('defaultOnSessionEnd returns session summary with stats', async () => {
    const db = new Database(dbPath);
    seedDatabase(db);
    db.close();

    const result = await defaultOnSessionEnd(ctx, dbPath);
    expect(result).toContain('## Session End Summary');
    expect(result).toContain('test-agent');
    expect(result).toContain('test-session-123');
    expect(result).toContain('3 files');
    expect(result).toContain('3 symbols');
    expect(result).toContain('**50%**');
  });

  it('defaultOnSessionEnd handles missing DB gracefully', async () => {
    const badPath = join(testDir, '__nonexistent__', 'db.db');
    await expect(defaultOnSessionEnd(ctx, badPath)).rejects.toThrow();
  });

  // ── defaultOnPreCommit ──

  it('defaultOnPreCommit returns risk report (no changes = safe to commit)', async () => {
    const db = new Database(dbPath);
    seedDatabase(db);
    db.close();

    const result = await defaultOnPreCommit(testDir);
    expect(result).toContain('## Pre-Commit Risk Report');
    expect(result).toContain('No changed files detected');
    expect(result).toContain('Safe to commit');
  });

  it('defaultOnPreCommit handles missing DB gracefully', async () => {
    const missingDir = join(tmpdir(), `milens-hook-nodb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(missingDir, { recursive: true });
    try {
      const result = await defaultOnPreCommit(missingDir);
      expect(result).toContain('**SKIP**');
      expect(result).toContain('No milens database found');
    } finally {
      try { rmSync(missingDir, { recursive: true, force: true }); } catch {}
    }
  });

  // ── defaultOnFileChange ──

  it('defaultOnFileChange lists changed files with symbol counts', async () => {
    const db = new Database(dbPath);
    seedDatabase(db);
    db.close();

    const result = await defaultOnFileChange(['src/main.ts', 'src/utils.ts'], testDir);
    expect(result).toContain('## File Change Detected');
    expect(result).toContain('2 file(s) changed');
    expect(result).toContain('src/main.ts');
    expect(result).toContain('src/utils.ts');
  });

  it('defaultOnFileChange handles missing DB gracefully', async () => {
    const missingDir = join(tmpdir(), `milens-hook-nodb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(missingDir, { recursive: true });
    try {
      const result = await defaultOnFileChange(['src/main.ts'], missingDir);
      expect(result).toBe('No milens database found.');
    } finally {
      try { rmSync(missingDir, { recursive: true, force: true }); } catch {}
    }
  });

  // ── defaultOnPreCompact ──

  it('defaultOnPreCompact snapshots metrics', async () => {
    const db = new Database(dbPath);
    seedDatabase(db);
    db.close();

    const result = await defaultOnPreCompact(testDir, dbPath);
    expect(result).toContain('Pre-compact snapshot saved');
    expect(result).toContain('3 files');
    expect(result).toContain('3 symbols');
  });

  it('defaultOnPreCompact handles missing DB', async () => {
    const badPath = join(testDir, '__nonexistent__', 'db.db');
    const result = await defaultOnPreCompact(testDir, badPath);
    expect(result).toBe('No milens database found.');
  });

  // ── defaultOnPostCompact ──

  it('defaultOnPostCompact recalls annotations', async () => {
    const db = new Database(dbPath);
    seedDatabase(db);
    db.close();

    const result = await defaultOnPostCompact(testDir);
    expect(result).toContain('## Context Restored');
    expect(result).toContain('No annotations to restore context');
  });

  it('defaultOnPostCompact handles missing DB', async () => {
    const missingDir = join(tmpdir(), `milens-hook-nodb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(missingDir, { recursive: true });
    try {
      const result = await defaultOnPostCompact(missingDir);
      expect(result).toBe('No milens database found.');
    } finally {
      try { rmSync(missingDir, { recursive: true, force: true }); } catch {}
    }
  });
});
