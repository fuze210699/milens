import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RepoRegistry } from '../../src/store/registry.js';
import { createMcpServer } from '../../src/server/mcp.js';

const TEST_ROOT = resolve(join(import.meta.dirname, '..', 'tmp', 'findings-report-test'));
const DB_PATH = join(TEST_ROOT, '.milens', 'milens.db'); // never actually opened by this tool

function getToolHandler(server: any, name: string): Function {
  const tools = server._registeredTools as Record<string, { handler: Function }>;
  return tools[name].handler;
}

describe('generate_findings_report tool', () => {
  let registry: RepoRegistry;
  let handler: Function;

  beforeAll(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    mkdirSync(join(TEST_ROOT, 'src'), { recursive: true });
    // 5-line source file used to test in-range / out-of-range line verification
    writeFileSync(join(TEST_ROOT, 'src', 'foo.ts'), 'line1\nline2\nline3\nline4\nline5\n');

    registry = new RepoRegistry();
    registry.register(TEST_ROOT, DB_PATH, 'test-hash-findings');

    const server = createMcpServer(TEST_ROOT);
    handler = getToolHandler(server, 'generate_findings_report');
  });

  afterAll(() => {
    registry.remove(TEST_ROOT);
    try {
      if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    } catch { /* best-effort */ }
  });

  it('verifies a real file:line and includes it in the report', async () => {
    const result = await handler({
      repo: TEST_ROOT,
      title: 'Sample report',
      findings: [{
        id: 'BUG-1',
        severity: 'high',
        title: 'Something is wrong',
        file: 'src/foo.ts',
        line: 3,
        root_cause: 'It broke because of X.',
        repro: 'Call foo() with Y.',
        fix: 'Do Z instead.',
      }],
    });

    const summary = result.content[0].text as string;
    expect(summary).toContain('Verified findings: 1/1');
    expect(summary).not.toContain('Rejected');

    const reportPath = summary.match(/Report written: (.+)/)?.[1];
    expect(reportPath).toBeTruthy();
    expect(existsSync(reportPath!)).toBe(true);

    const content = readFileSync(reportPath!, 'utf-8');
    expect(content).toContain('<report title="Sample report"');
    expect(content).toContain('<finding id="BUG-1" severity="high" status="open" file="src/foo.ts" line="3">');
    expect(content).toContain('### Something is wrong');
    expect(content).toContain('It broke because of X.');
    expect(content).toContain('Do Z instead.');
    expect(content).toContain('| BUG-1 | high | src/foo.ts:3 | open |');
    // LLM-optimized schema: no inline JSON data block
    expect(content).not.toContain('```json');
  });

  it('rejects a finding pointing at a nonexistent file', async () => {
    const result = await handler({
      repo: TEST_ROOT,
      title: 'Rejection test — missing file',
      findings: [{
        id: 'FAKE-1',
        severity: 'low',
        title: 'Bogus finding',
        file: 'src/does-not-exist.ts',
        line: 1,
        root_cause: 'n/a',
        repro: 'n/a',
        fix: 'n/a',
      }],
    });

    const summary = result.content[0].text as string;
    expect(summary).toContain('Verified findings: 0/1');
    expect(summary).toContain('Rejected (unverified location): 1 — FAKE-1');

    const reportPath = summary.match(/Report written: (.+)/)?.[1]!;
    const content = readFileSync(reportPath, 'utf-8');
    expect(content).toContain('⚠ Rejected — location unverified');
    expect(content).toContain('FAKE-1');
    expect(content).toContain('file does not exist: src/does-not-exist.ts');
    // Rejected findings must not leak into the trusted table/finding blocks
    expect(content).not.toContain('<finding id="FAKE-1"');
  });

  it('rejects a finding whose line number is out of range', async () => {
    const result = await handler({
      repo: TEST_ROOT,
      title: 'Rejection test — bad line',
      findings: [{
        id: 'BUG-2',
        severity: 'medium',
        title: 'Line out of range',
        file: 'src/foo.ts',
        line: 9999,
        root_cause: 'n/a',
        repro: 'n/a',
        fix: 'n/a',
      }],
    });

    const summary = result.content[0].text as string;
    expect(summary).toContain('Verified findings: 0/1');
    expect(summary).toContain('Rejected (unverified location): 1 — BUG-2');

    const reportPath = summary.match(/Report written: (.+)/)?.[1]!;
    const content = readFileSync(reportPath, 'utf-8');
    expect(content).toContain('line 9999 out of range (file has 6 lines)');
  });

  it('handles a mix of verified and rejected findings in one call', async () => {
    const result = await handler({
      repo: TEST_ROOT,
      title: 'Mixed report',
      findings: [
        {
          id: 'GOOD-1', severity: 'critical', title: 'Real one', file: 'src/foo.ts', line: 1,
          root_cause: 'x', repro: 'y', fix: 'z',
        },
        {
          id: 'BAD-1', severity: 'low', title: 'Fake one', file: 'src/nope.ts', line: 1,
          root_cause: 'x', repro: 'y', fix: 'z',
        },
      ],
    });

    const summary = result.content[0].text as string;
    expect(summary).toContain('Verified findings: 1/2');
    expect(summary).toContain('Rejected (unverified location): 1 — BAD-1');
  });

  it('renders optional impact field and defaults status to "open"', async () => {
    const result = await handler({
      repo: TEST_ROOT,
      title: 'Impact field test',
      findings: [{
        id: 'BUG-3', severity: 'high', title: 'Has impact', file: 'src/foo.ts', line: 2,
        root_cause: 'x', repro: 'y', fix: 'z', impact: 'Breaks prod for everyone.',
      }],
    });

    const reportPath = (result.content[0].text as string).match(/Report written: (.+)/)?.[1]!;
    const content = readFileSync(reportPath, 'utf-8');
    expect(content).toContain('**Impact**\nBreaks prod for everyone.');
    expect(content).toContain('status="open"');
  });

  it('includes method, notes, and fix_order when provided', async () => {
    const result = await handler({
      repo: TEST_ROOT,
      title: 'Full sections test',
      method: 'Ran a manual audit.',
      findings: [{
        id: 'BUG-4', severity: 'medium', title: 'Something', file: 'src/foo.ts', line: 4,
        root_cause: 'x', repro: 'y', fix: 'z',
      }],
      notes: ['Minor thing worth knowing.'],
      fix_order: '1. Fix BUG-4 first.',
    });

    const reportPath = (result.content[0].text as string).match(/Report written: (.+)/)?.[1]!;
    const content = readFileSync(reportPath, 'utf-8');
    expect(content).toContain('Ran a manual audit.');
    expect(content).toContain('## Notes');
    expect(content).toContain('Minor thing worth knowing.');
    expect(content).toContain('## Fix order');
    expect(content).toContain('1. Fix BUG-4 first.');
  });

  it('writes reports under .milens/tmp/reports and does not delete previous ones', async () => {
    await handler({
      repo: TEST_ROOT,
      title: 'First report',
      findings: [{ id: 'A', severity: 'low', title: 'a', file: 'src/foo.ts', line: 1, root_cause: 'x', repro: 'y', fix: 'z' }],
    });
    await handler({
      repo: TEST_ROOT,
      title: 'Second report',
      findings: [{ id: 'B', severity: 'low', title: 'b', file: 'src/foo.ts', line: 1, root_cause: 'x', repro: 'y', fix: 'z' }],
    });

    const dir = join(TEST_ROOT, '.milens', 'tmp', 'reports');
    const files = readdirSync(dir);
    const mdFiles = files.filter((f: string) => f.endsWith('.md'));
    // At least the two reports from this test, plus everything from earlier tests in this file.
    expect(mdFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('warns when .milens/ is not in the repo .gitignore', async () => {
    const noIgnoreRoot = join(TEST_ROOT, 'no-gitignore-fixture');
    mkdirSync(join(noIgnoreRoot, 'src'), { recursive: true });
    writeFileSync(join(noIgnoreRoot, 'src', 'foo.ts'), 'line1\nline2\n');

    const reg2 = new RepoRegistry();
    reg2.register(noIgnoreRoot, DB_PATH, 'test-hash-noignore');
    try {
      const server = createMcpServer(noIgnoreRoot);
      const h = getToolHandler(server, 'generate_findings_report');
      const result = await h({
        repo: noIgnoreRoot,
        title: 'No gitignore test',
        findings: [{ id: 'A', severity: 'low', title: 'a', file: 'src/foo.ts', line: 1, root_cause: 'x', repro: 'y', fix: 'z' }],
      });
      expect(result.content[0].text).toContain('.milens/" is not in this repo\'s .gitignore');
    } finally {
      reg2.remove(noIgnoreRoot);
      rmSync(noIgnoreRoot, { recursive: true, force: true });
    }
  });

  it('does not warn when .milens/ is already gitignored', async () => {
    const ignoredRoot = join(TEST_ROOT, 'has-gitignore-fixture');
    mkdirSync(join(ignoredRoot, 'src'), { recursive: true });
    writeFileSync(join(ignoredRoot, 'src', 'foo.ts'), 'line1\nline2\n');
    writeFileSync(join(ignoredRoot, '.gitignore'), 'node_modules/\n.milens/\n');

    const reg2 = new RepoRegistry();
    reg2.register(ignoredRoot, DB_PATH, 'test-hash-ignored');
    try {
      const server = createMcpServer(ignoredRoot);
      const h = getToolHandler(server, 'generate_findings_report');
      const result = await h({
        repo: ignoredRoot,
        title: 'Has gitignore test',
        findings: [{ id: 'A', severity: 'low', title: 'a', file: 'src/foo.ts', line: 1, root_cause: 'x', repro: 'y', fix: 'z' }],
      });
      expect(result.content[0].text).not.toContain('is not in this repo');
    } finally {
      reg2.remove(ignoredRoot);
      rmSync(ignoredRoot, { recursive: true, force: true });
    }
  });
});
