import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HookManager, HookConfig } from '../../src/server/hooks.js';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
