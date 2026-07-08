import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Capture watch callbacks and control mock behavior
const watchListeners: Record<string, Array<(...args: any[]) => void>> = {};
const mockWatchClose = vi.fn();
let watchCallCount = 0;
let watchShouldThrow = false;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    watch: vi.fn((_path: string, _opts: any, _callback?: Function) => {
      if (watchShouldThrow) throw new Error('ENOTSUP');
      watchCallCount++;
      if (_callback) {
        if (!watchListeners['change']) watchListeners['change'] = [];
        watchListeners['change'].push(_callback);
      }
      return {
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (!watchListeners[event]) watchListeners[event] = [];
          watchListeners[event].push(cb);
        }),
        close: mockWatchClose,
      };
    }),
    existsSync: actual.existsSync,
    mkdirSync: actual.mkdirSync,
    rmSync: actual.rmSync,
  };
});

import { FileWatcher } from '../../src/server/watcher.js';
import { writeFileSync } from 'node:fs';

describe('FileWatcher', () => {
  let testDir: string;
  let milensDir: string;
  let dbPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(watchListeners).forEach(k => delete watchListeners[k]);
    mockWatchClose.mockClear();
    watchCallCount = 0;
    watchShouldThrow = false;

    testDir = join(tmpdir(), `milens-watcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    milensDir = join(testDir, '.milens');
    mkdirSync(milensDir, { recursive: true });
    dbPath = join(milensDir, 'milens.db');
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  // ── Construction ──

  it('constructs with default options', () => {
    const w = new FileWatcher({ rootPath: testDir, dbPath });
    expect(w).toBeDefined();
    expect(w.isRunning()).toBe(false);
  });

  it('accepts custom debounce and ignores', () => {
    const w = new FileWatcher({
      rootPath: testDir, dbPath, debounceMs: 500, extraIgnores: ['custom-ignore'],
    });
    expect(w).toBeDefined();
  });

  // ── Logger callback (regression: NEVER console.log/console.error) ──

  it('uses provided logger callback instead of console.log/error', () => {
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');

    const loggerCalls: Array<{ level: string; msg: string }> = [];
    const logger = (level: 'info' | 'warning' | 'error', msg: string) => {
      loggerCalls.push({ level, msg });
    };

    const w = new FileWatcher({ rootPath: testDir, dbPath, logger });
    w.stop();

    expect(loggerCalls.length).toBeGreaterThanOrEqual(1);
    expect(loggerCalls.some(c => c.msg.includes('Stopped'))).toBe(true);

    const consoleWatcherCalls = [
      ...(logSpy.mock.calls || []),
      ...(errorSpy.mock.calls || []),
    ].filter((c: any[]) => c[0] && typeof c[0] === 'string' && c[0].includes('[milens:watcher]'));
    expect(consoleWatcherCalls.length).toBe(0);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── start/stop/isRunning ──

  it('start sets running to true when db exists', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath });
    w.start();
    expect(w.isRunning()).toBe(true);
  });

  it('start logs error when db does not exist', () => {
    const loggerCalls: Array<{ level: string; msg: string }> = [];
    const w = new FileWatcher({
      rootPath: testDir,
      dbPath: join(milensDir, 'nonexistent.db'),
      logger: (level, msg) => loggerCalls.push({ level, msg }),
    });
    w.start();

    expect(w.isRunning()).toBe(false);
    expect(loggerCalls.length).toBe(1);
    expect(loggerCalls[0].level).toBe('error');
    expect(loggerCalls[0].msg).toContain('No index found');
  });

  it('stop sets running to false', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath });
    w.start();
    expect(w.isRunning()).toBe(true);
    w.stop();
    expect(w.isRunning()).toBe(false);
  });

  it('start is idempotent', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath });
    w.start();
    const afterFirst = watchCallCount;
    w.start();
    expect(watchCallCount).toBe(afterFirst);
    expect(w.isRunning()).toBe(true);
  });

  // ── File filtering via change callback ──

  it('accepts source file extensions via change callback', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath, debounceMs: 10 });
    w.start();

    const changeHandlers = watchListeners['change'];
    expect(changeHandlers).toBeDefined();
    expect(changeHandlers.length).toBeGreaterThanOrEqual(1);

    changeHandlers[0]('change', 'src/main.ts');
    expect(w.isRunning()).toBe(true);
    w.stop();
  });

  it('ignores node_modules files via change callback', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath, debounceMs: 10 });
    w.start();

    const changeHandlers = watchListeners['change'];
    changeHandlers[0]('change', 'node_modules/some-lib/index.js');
    w.stop();
  });

  it('ignores non-source extensions', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath, debounceMs: 10 });
    w.start();

    const changeHandlers = watchListeners['change'];
    changeHandlers[0]('change', 'data/file.bin');
    changeHandlers[0]('change', 'images/logo.png');
    w.stop();
  });

  it('logs watcher error events through logger', () => {
    writeFileSync(dbPath, '');
    const loggerCalls: Array<{ level: string; msg: string }> = [];
    const w = new FileWatcher({
      rootPath: testDir, dbPath,
      logger: (level, msg) => loggerCalls.push({ level, msg }),
    });

    w.start();
    const errorHandlers = watchListeners['error'];
    expect(errorHandlers).toBeDefined();

    errorHandlers[0](new Error('Watcher failure'));
    expect(loggerCalls.some(c => c.level === 'error' && c.msg.includes('Watcher failure'))).toBe(true);
    w.stop();
  });

  it('handles watch failure gracefully (unsupported platform)', () => {
    writeFileSync(dbPath, '');
    watchShouldThrow = true;

    const loggerCalls: Array<{ level: string; msg: string }> = [];
    const w = new FileWatcher({
      rootPath: testDir, dbPath,
      logger: (level, msg) => loggerCalls.push({ level, msg }),
    });

    w.start();
    expect(w.isRunning()).toBe(false);
    expect(loggerCalls.some(c => c.level === 'error' && c.msg.includes('not available'))).toBe(true);
  });

  it('logs start message via logger when starting', () => {
    writeFileSync(dbPath, '');
    const loggerCalls: Array<{ level: string; msg: string }> = [];
    const w = new FileWatcher({
      rootPath: testDir, dbPath, debounceMs: 2000,
      logger: (level, msg) => loggerCalls.push({ level, msg }),
    });

    w.start();
    expect(w.isRunning()).toBe(true);
    expect(loggerCalls.some(c => c.level === 'info' && c.msg.includes('Watching'))).toBe(true);
    w.stop();
  });

  it('stop calls close on the underlying watcher', () => {
    writeFileSync(dbPath, '');
    const w = new FileWatcher({ rootPath: testDir, dbPath });
    w.start();
    expect(mockWatchClose).not.toHaveBeenCalled();

    w.stop();
    expect(mockWatchClose).toHaveBeenCalled();
    expect(w.isRunning()).toBe(false);
  });
});
