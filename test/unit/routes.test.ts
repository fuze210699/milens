import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { analyze } from '../../src/analyzer/engine.js';
import { RepoRegistry } from '../../src/store/registry.js';
import { createMcpServer } from '../../src/server/mcp.js';

const TEST_ROOT = resolve(join(import.meta.dirname, '..', 'tmp', 'routes-test'));
const DB_PATH = join(TEST_ROOT, '.milens', 'test.db');

function getToolHandler(server: any, name: string): Function {
  const tools = server._registeredTools as Record<string, { handler: Function }>;
  return tools[name].handler;
}

describe('routes tool', () => {
  let registry: RepoRegistry;
  let handler: Function;

  beforeAll(async () => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    mkdirSync(join(TEST_ROOT, 'src'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.milens'), { recursive: true });

    writeFileSync(
      join(TEST_ROOT, 'src', 'app.js'),
      "const router = require('express').Router();\n" +
      "function listUsers(req, res) {\n" +
      "  res.json([]);\n" +
      "}\n" +
      "router.get('/users', listUsers);\n",
    );

    await analyze({ rootPath: TEST_ROOT, dbPath: DB_PATH, force: true });

    registry = new RepoRegistry();
    registry.register(TEST_ROOT, DB_PATH, 'test-hash-routes');

    const server = createMcpServer(TEST_ROOT);
    handler = getToolHandler(server, 'routes');
  });

  afterAll(() => {
    registry.remove(TEST_ROOT);
    try {
      if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    } catch { /* best-effort */ }
  });

  it('detects an Express route and maps it to its handler symbol', async () => {
    const result = await handler({ repo: TEST_ROOT });
    const text = result.content[0].text as string;

    expect(text).toContain('express');
    expect(text).toContain('GET');
    expect(text).toContain('/users');
    expect(text).toContain('src/app.js');
    expect(text).toContain('listUsers');
  });

  it('filters by framework and reports none for a framework with no matches', async () => {
    const result = await handler({ repo: TEST_ROOT, framework: 'flask' });
    const text = result.content[0].text as string;
    expect(text).toContain('No framework routes detected.');
  });

  it('returns a clear error for an unknown framework filter', async () => {
    const result = await handler({ repo: TEST_ROOT, framework: 'not-a-real-framework' });
    const text = result.content[0].text as string;
    expect(text).toContain('Unknown framework "not-a-real-framework"');
    expect(text).toContain('express');
  });
});
