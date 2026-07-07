import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Captured HTTP request handler (set by node:http mock below) ──
let capturedRequestHandler: Function | null = null;

// ── Mock node:http FIRST (before any imports that use it) ──
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    createServer: vi.fn((handler: Function) => {
      capturedRequestHandler = handler;
      return {
        listen: vi.fn((_port: number, _host: string, cb: Function) => cb()),
      };
    }),
  };
});

// ── Mock McpServer ──
const mockSendLoggingMessage = vi.fn();
const mockServerConnect = vi.fn();
const registeredTools: Record<string, { handler: Function; schema: any }> = {};

const mockTool = vi.fn((name: string, schema: any, handler: Function) => {
  registeredTools[name] = { handler, schema };
});

const mockServerInstance = {
  server: { sendLoggingMessage: mockSendLoggingMessage },
  connect: mockServerConnect,
  tool: mockTool,
  prompt: vi.fn(),
  resource: vi.fn(),
  _registeredTools: registeredTools,
};

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(function () {
    return mockServerInstance;
  }),
  ResourceTemplate: vi.fn(),
}));

// ── Mock StdioServerTransport ──
const mockStdioTransport = vi.fn();
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(function () {
    mockStdioTransport();
    return {};
  }),
}));

// ── Mock StreamableHTTPServerTransport ──
const mockHandleRequest = vi.fn();
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn(function () {
    return { handleRequest: mockHandleRequest };
  }),
}));

// ── Mock FileWatcher ──
const mockWatcherStart = vi.fn();
const mockWatcherStop = vi.fn();
vi.mock('../../src/server/watcher.js', () => ({
  FileWatcher: vi.fn(function () {
    return { start: mockWatcherStart, stop: mockWatcherStop, isRunning: vi.fn(() => false) };
  }),
}));

// ── Mock RepoRegistry ──
const mockFindByRoot = vi.fn();
vi.mock('../../src/store/registry.js', () => ({
  RepoRegistry: vi.fn(function () {
    return {
      findByRoot: mockFindByRoot,
      listAll: vi.fn(() => []),
      register: vi.fn(),
      remove: vi.fn(),
    };
  }),
}));

// ── Mock HookManager ──
const mockLoadConfig = vi.fn(() => ({
  enabled: true, onFileChange: true, onSessionStart: true,
  onSessionEnd: true, onPreCommit: true, onPreCompact: true, onPostCompact: true,
}));
vi.mock('../../src/server/hooks.js', () => ({
  HookManager: vi.fn(function () {
    return { loadConfig: mockLoadConfig };
  }),
  defaultOnSessionStart: vi.fn(),
  defaultOnSessionEnd: vi.fn(),
  defaultOnPreCommit: vi.fn(),
  defaultOnFileChange: vi.fn(),
  defaultOnPreCompact: vi.fn(),
  defaultOnPostCompact: vi.fn(),
}));

// ── Mocks for heavy deps ──
vi.mock('../../src/orchestrator/orchestrator.js', () => ({ Orchestrator: vi.fn() }));
vi.mock('../../src/security/rules.js', () => ({
  loadRules: vi.fn(() => ({ rules: [], categories: new Map() })),
}));
vi.mock('../../src/server/mcp-prompts.js', () => ({
  registerAllPrompts: vi.fn(), MILENS_PROMPT_NAMES: [],
}));
vi.mock('../../src/server/test-plan.js', () => ({ generateTestPlan: vi.fn() }));
vi.mock('../../src/analyzer/review.js', () => ({ reviewPr: vi.fn() }));
vi.mock('ignore', () => ({
  default: vi.fn(() => ({ add: vi.fn(), ignores: vi.fn(() => false) })),
}));
vi.mock('../../src/parser/loader.js', () => ({
  getParser: vi.fn(), loadLanguage: vi.fn(),
}));

import { startStdio, startHttp } from '../../src/server/mcp.js';

function createTestDir() {
  const dir = join(tmpdir(), `milens-transport-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(dir, '.milens'), { recursive: true });
  writeFileSync(join(dir, '.milens', 'milens.db'), '');
  return dir;
}

describe('startStdio', () => {
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredTools).forEach(k => delete registeredTools[k]);
    mockServerConnect.mockResolvedValue(undefined);
    mockStdioTransport.mockClear();
    mockWatcherStart.mockClear();
    mockWatcherStop.mockClear();
    mockFindByRoot.mockClear();
    mockLoadConfig.mockClear();
    mockTool.mockClear();
    capturedRequestHandler = null;

    testDir = createTestDir();

    mockFindByRoot.mockReturnValue({ rootPath: testDir, dbPath: join(testDir, '.milens', 'milens.db') });
    mockLoadConfig.mockReturnValue({
      enabled: true, onFileChange: true, onSessionStart: true,
      onSessionEnd: true, onPreCommit: true, onPreCompact: true, onPostCompact: true,
    });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('creates McpServer and connects via StdioServerTransport', async () => {
    await startStdio(testDir);
    expect(mockStdioTransport).toHaveBeenCalled();
    expect(mockServerConnect).toHaveBeenCalled();
  });

  it('starts FileWatcher when hooks are enabled with onFileChange', async () => {
    await startStdio(testDir);
    expect(mockWatcherStart).toHaveBeenCalled();
  });

  it('does NOT start FileWatcher when hooks are disabled', async () => {
    mockLoadConfig.mockReturnValue({
      enabled: false, onFileChange: true, onSessionStart: true,
      onSessionEnd: true, onPreCommit: true, onPreCompact: true, onPostCompact: true,
    });
    await startStdio(testDir);
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('does NOT start FileWatcher when onFileChange is false', async () => {
    mockLoadConfig.mockReturnValue({
      enabled: true, onFileChange: false, onSessionStart: true,
      onSessionEnd: true, onPreCommit: true, onPreCompact: true, onPostCompact: true,
    });
    await startStdio(testDir);
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('does NOT create watcher when no rootPath is provided', async () => {
    await startStdio();
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('does NOT create watcher when repo is not found in registry', async () => {
    mockFindByRoot.mockReturnValue(null);
    await startStdio(testDir);
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('registers SIGINT/SIGTERM cleanup handlers', async () => {
    const sigintBefore = process.listeners('SIGINT').length;
    const sigtermBefore = process.listeners('SIGTERM').length;
    await startStdio(testDir);
    expect(process.listeners('SIGINT').length).toBeGreaterThan(sigintBefore);
    expect(process.listeners('SIGTERM').length).toBeGreaterThan(sigtermBefore);
  });

  it('cleanup stops the watcher on SIGINT', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await startStdio(testDir);
    const addedListeners = process.listeners('SIGINT').slice(-1);
    if (addedListeners.length > 0) {
      await (addedListeners[0] as Function)();
    }
    expect(mockWatcherStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
});

describe('startHttp', () => {
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredTools).forEach(k => delete registeredTools[k]);
    mockServerConnect.mockResolvedValue(undefined);
    mockWatcherStart.mockClear();
    mockWatcherStop.mockClear();
    mockFindByRoot.mockClear();
    mockLoadConfig.mockClear();
    mockHandleRequest.mockClear();
    mockTool.mockClear();
    capturedRequestHandler = null;

    testDir = createTestDir();

    mockFindByRoot.mockReturnValue({ rootPath: testDir, dbPath: join(testDir, '.milens', 'milens.db') });
    mockLoadConfig.mockReturnValue({
      enabled: true, onFileChange: true, onSessionStart: true,
      onSessionEnd: true, onPreCommit: true, onPreCompact: true, onPostCompact: true,
    });
    mockHandleRequest.mockResolvedValue(undefined);
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('creates McpServer and starts HTTP server', async () => {
    await startHttp(3101, testDir);
    expect(capturedRequestHandler).not.toBeNull();
  });

  it('handles POST /mcp creating a new session', async () => {
    await startHttp(3102, testDir);

    const mockReq = {
      method: 'POST',
      url: '/mcp',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      on: vi.fn(),
    };
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };

    const chunks: Buffer[] = [];
    mockReq.on.mockImplementation((event: string, cb: Function) => {
      if (event === 'data') {
        cb(Buffer.from('{"method":"initialize","params":{}}'));
        return mockReq;
      }
      if (event === 'end') { cb(); return mockReq; }
      if (event === 'error') return mockReq;
      return mockReq;
    });

    await capturedRequestHandler!(mockReq, mockRes);
    expect(mockHandleRequest).toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded', async () => {
    await startHttp(3103, testDir);

    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };

    const makeReq = (ip: string) => ({
      method: 'POST',
      url: '/mcp',
      socket: { remoteAddress: ip },
      headers: {},
      on: vi.fn(),
    });

    for (let i = 0; i < 70; i++) {
      const mockReq = makeReq('127.0.0.2');
      mockReq.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data' || event === 'error') return mockReq;
        if (event === 'end') { cb(); return mockReq; }
        return mockReq;
      });
      await capturedRequestHandler!(mockReq, mockRes);
    }

    const rateLimitCalls = mockRes.writeHead.mock.calls.filter(
      (call: any[]) => call[0] === 429,
    );
    expect(rateLimitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 404 for non-POST requests', async () => {
    await startHttp(3104, testDir);

    const mockReq = {
      method: 'GET',
      url: '/mcp',
      socket: { remoteAddress: '127.0.0.3' },
      headers: {},
      on: vi.fn(),
    };
    const mockRes = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };

    await capturedRequestHandler!(mockReq, mockRes);
    expect(mockRes.writeHead).toHaveBeenCalledWith(404);
  });

  it('returns 404 for unknown routes', async () => {
    await startHttp(3105, testDir);

    const mockReq = {
      method: 'POST',
      url: '/unknown',
      socket: { remoteAddress: '127.0.0.4' },
      headers: {},
      on: vi.fn(),
    };
    const mockRes = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };

    await capturedRequestHandler!(mockReq, mockRes);
    expect(mockRes.writeHead).toHaveBeenCalledWith(404);
  });

  it('starts FileWatcher when hooks are enabled', async () => {
    await startHttp(3106, testDir);
    expect(mockWatcherStart).toHaveBeenCalled();
  });

  it('does NOT start FileWatcher when hooks are disabled', async () => {
    mockLoadConfig.mockReturnValue({
      enabled: false, onFileChange: true, onSessionStart: true,
      onSessionEnd: true, onPreCommit: true, onPreCompact: true, onPostCompact: true,
    });
    await startHttp(3107, testDir);
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('does NOT create watcher when no rootPath', async () => {
    await startHttp(3108);
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('registers SIGINT/SIGTERM cleanup handlers', async () => {
    const sigintBefore = process.listeners('SIGINT').length;
    const sigtermBefore = process.listeners('SIGTERM').length;
    await startHttp(3109, testDir);
    expect(process.listeners('SIGINT').length).toBeGreaterThan(sigintBefore);
    expect(process.listeners('SIGTERM').length).toBeGreaterThan(sigtermBefore);
  });

  it('handles bad request gracefully (non-JSON body)', async () => {
    await startHttp(3110, testDir);

    const mockReq = {
      method: 'POST',
      url: '/mcp',
      socket: { remoteAddress: '127.0.0.5' },
      headers: {},
      on: vi.fn(),
      destroy: vi.fn(),
    };
    const mockRes = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };

    mockReq.on.mockImplementation((event: string, cb: Function) => {
      if (event === 'data' || event === 'error') return mockReq;
      if (event === 'end') { cb(); return mockReq; }
      return mockReq;
    });

    await capturedRequestHandler!(mockReq, mockRes);

    const badReqCalls = mockRes.writeHead.mock.calls.filter(
      (call: any[]) => call[0] === 400,
    );
    expect(badReqCalls.length).toBeGreaterThanOrEqual(1);
  });
});
