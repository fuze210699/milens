import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { markChecked, checkEdit, readMode, writeMode, handleMarkChecked, handleCheckEdit } from '../../src/server/guard-hook.js';

const TEST_ROOT = resolve(join(tmpdir(), `milens-guard-hook-${randomUUID().slice(0, 8)}`));
const MILENS_DIR = join(TEST_ROOT, '.milens');
const HOOK_STATE_DIR = join(MILENS_DIR, 'hook-state');
const CONFIG_PATH = join(HOOK_STATE_DIR, 'config.json');

beforeAll(() => {
  mkdirSync(HOOK_STATE_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ mode: 'warn' }, null, 2), 'utf-8');
});

afterAll(() => {
  try { rmSync(TEST_ROOT, { recursive: true, force: true }); } catch { /* cleanup best effort */ }
});

function markerPath(sessionId: string): string {
  return join(HOOK_STATE_DIR, `${sessionId}.json`);
}

describe('markChecked', () => {
  it('writes a marker file with timestamp and tool name', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    markChecked({ session_id: sessionId, tool_name: 'impact' }, TEST_ROOT);

    const marker = JSON.parse(readFileSync(markerPath(sessionId), 'utf-8'));
    expect(marker.lastCheckedAt).toBeDefined();
    expect(marker.lastCheckedTool).toBe('impact');
  });

  it('overwrites an existing marker instead of erroring', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    writeFileSync(markerPath(sessionId), JSON.stringify({ lastCheckedAt: 'old', lastCheckedTool: 'old' }), 'utf-8');

    markChecked({ session_id: sessionId, tool_name: 'context' }, TEST_ROOT);

    const marker = JSON.parse(readFileSync(markerPath(sessionId), 'utf-8'));
    expect(marker.lastCheckedTool).toBe('context');
    expect(marker.lastCheckedAt).not.toBe('old');
  });

  it('is a no-op when session_id is missing', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    markChecked({ tool_name: 'impact' }, TEST_ROOT);
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('is a no-op when session_id is empty string', () => {
    markChecked({ session_id: '', tool_name: 'impact' }, TEST_ROOT);
    expect(existsSync(markerPath(''))).toBe(false);
  });
});

describe('checkEdit', () => {
  it('warn mode: returns allow and consumes marker when marker exists', () => {
    writeMode(TEST_ROOT, 'warn');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    markChecked({ session_id: sessionId, tool_name: 'impact' }, TEST_ROOT);

    const result = checkEdit({ session_id: sessionId, tool_name: 'Edit' }, TEST_ROOT);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('warn mode: never denies, shows advisory message when no marker exists', () => {
    writeMode(TEST_ROOT, 'warn');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;

    const result = checkEdit({ session_id: sessionId, tool_name: 'Write' }, TEST_ROOT);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.systemMessage).toBeDefined();
    expect(parsed.systemMessage).toContain('milens safety check');
  });

  it('strict mode: allows and consumes marker when exists', () => {
    writeMode(TEST_ROOT, 'strict');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    markChecked({ session_id: sessionId, tool_name: 'guard_edit_check' }, TEST_ROOT);

    const result = checkEdit({ session_id: sessionId, tool_name: 'Edit' }, TEST_ROOT);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('strict mode: denies with exitCode 0 and permissionDecision deny when no marker exists', () => {
    writeMode(TEST_ROOT, 'strict');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;

    const result = checkEdit({ session_id: sessionId, tool_name: 'MultiEdit' }, TEST_ROOT);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('milens safety check');
  });

  it('consumption: two consecutive checkEdit calls — second sees no marker', () => {
    writeMode(TEST_ROOT, 'warn');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    markChecked({ session_id: sessionId, tool_name: 'overview' }, TEST_ROOT);

    const first = checkEdit({ session_id: sessionId, tool_name: 'Edit' }, TEST_ROOT);
    expect(JSON.parse(first.stdout).hookSpecificOutput.permissionDecision).toBe('allow');
    expect(existsSync(markerPath(sessionId))).toBe(false);

    const second = checkEdit({ session_id: sessionId, tool_name: 'Edit' }, TEST_ROOT);
    const parsedSecond = JSON.parse(second.stdout);
    expect(parsedSecond.systemMessage).toBeDefined();
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('is a no-op when session_id is missing', () => {
    const result = checkEdit({ tool_name: 'Edit' }, TEST_ROOT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('handleMarkChecked (raw stdin)', () => {
  it('writes a marker file for valid JSON stdin', () => {
    writeMode(TEST_ROOT, 'warn');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    handleMarkChecked(JSON.stringify({ session_id: sessionId, tool_name: 'impact' }), TEST_ROOT);

    const marker = JSON.parse(readFileSync(markerPath(sessionId), 'utf-8'));
    expect(marker.lastCheckedTool).toBe('impact');
  });

  it('is a no-op on empty string stdin', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    expect(() => handleMarkChecked('', TEST_ROOT)).not.toThrow();
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('is a no-op on non-JSON string stdin', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    expect(() => handleMarkChecked('not-json-at-all', TEST_ROOT)).not.toThrow();
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('is a no-op on valid JSON but wrong shape (string instead of object)', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    expect(() => handleMarkChecked('"just a string"', TEST_ROOT)).not.toThrow();
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });

  it('is a no-op on valid JSON but wrong shape (number)', () => {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    expect(() => handleMarkChecked('42', TEST_ROOT)).not.toThrow();
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });
});

describe('handleCheckEdit (raw stdin)', () => {
  it('warn mode: no-op on empty string input', () => {
    writeMode(TEST_ROOT, 'warn');
    const result = handleCheckEdit('', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('warn mode: no-op on non-JSON string input', () => {
    writeMode(TEST_ROOT, 'warn');
    const result = handleCheckEdit('not-json-at-all', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('warn mode: no-op on valid JSON but wrong shape (string)', () => {
    writeMode(TEST_ROOT, 'warn');
    const result = handleCheckEdit('"just a string"', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('warn mode: no-op on valid JSON but wrong shape (number)', () => {
    writeMode(TEST_ROOT, 'warn');
    const result = handleCheckEdit('42', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('strict mode: denies on empty string input (fail closed)', () => {
    writeMode(TEST_ROOT, 'strict');
    const result = handleCheckEdit('', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('strict mode: denies on non-JSON string input (fail closed)', () => {
    writeMode(TEST_ROOT, 'strict');
    const result = handleCheckEdit('not-json-at-all', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('strict mode: denies on valid JSON but wrong shape (fail closed)', () => {
    writeMode(TEST_ROOT, 'strict');
    const result = handleCheckEdit('[]', TEST_ROOT);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('works correctly for valid JSON input', () => {
    writeMode(TEST_ROOT, 'warn');
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    handleMarkChecked(JSON.stringify({ session_id: sessionId, tool_name: 'overview' }), TEST_ROOT);

    const result = handleCheckEdit(JSON.stringify({ session_id: sessionId, tool_name: 'Edit' }), TEST_ROOT);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(existsSync(markerPath(sessionId))).toBe(false);
  });
});

describe('readMode / writeMode', () => {
  it('reads warn when config file is missing', () => {
    const tempDir = resolve(join(tmpdir(), `milens-noconfig-${randomUUID().slice(0, 8)}`));
    mkdirSync(join(tempDir, '.milens', 'hook-state'), { recursive: true });
    try {
      expect(readMode(tempDir)).toBe('warn');
    } finally {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('reads strict after writing strict', () => {
    writeMode(TEST_ROOT, 'strict');
    expect(readMode(TEST_ROOT)).toBe('strict');
  });

  it('reads warn after writing warn', () => {
    writeMode(TEST_ROOT, 'warn');
    expect(readMode(TEST_ROOT)).toBe('warn');
  });
});
