import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  removeInjectedBlock,
  removeDatabase,
  removeGitHooks,
  removeMcpEntry,
  removeEnvVars,
  removePackageDep,
  UninstallOptions,
  uninstall,
} from '../../src/uninstall.js';

const START_MARKER = '<!-- milens:start -->';
const END_MARKER = '<!-- milens:end -->';

const TEST_DIR = join(import.meta.dirname, '..', 'tmp', 'uninstall-test');

function tmpPath(...segments: string[]): string {
  return join(TEST_DIR, ...segments);
}

function writeInDir(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  const parentDir = join(fullPath, '..');
  try { mkdirSync(resolve(parentDir), { recursive: true }); } catch {}
  writeFileSync(fullPath, content);
}

describe('removeInjectedBlock', () => {
  const repo = tmpPath('inject-block-test');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('removes milens block and keeps user content before block', () => {
    const path = join(repo, 'AGENTS.md');
    const content = `# Project: foo\n\n${START_MARKER}\n# Milens Block\n...\n${END_MARKER}\n\n## My Section\nSome text`;
    writeFileSync(path, content);

    const result = removeInjectedBlock(path);
    expect(result.removed).toBe(true);
    expect(result.kept).toBe(true);

    const remaining = readFileSync(path, 'utf-8');
    expect(remaining).toContain('# Project: foo');
    expect(remaining).toContain('## My Section');
    expect(remaining).not.toContain(START_MARKER);
    expect(remaining).not.toContain(END_MARKER);
    expect(remaining).not.toContain('Milens Block');
  });

  it('removes milens block and keeps user content on both sides', () => {
    const path = join(repo, 'CLAUDE.md');
    const content = `# Before\n\n${START_MARKER}\nMilens\n${END_MARKER}\n\n# After`;
    writeFileSync(path, content);

    const result = removeInjectedBlock(path);
    expect(result.removed).toBe(true);
    expect(result.kept).toBe(true);

    const remaining = readFileSync(path, 'utf-8');
    expect(remaining).toContain('# Before');
    expect(remaining).toContain('# After');
    expect(remaining).not.toContain(START_MARKER);
  });

  it('deletes file when it contains only the milens block', () => {
    const path = join(repo, 'only-milens.md');
    const content = `${START_MARKER}\n# Milens\n...\n${END_MARKER}`;
    writeFileSync(path, content);

    const result = removeInjectedBlock(path);
    expect(result.removed).toBe(true);
    expect(result.kept).toBe(false);
    expect(existsSync(path)).toBe(false);
  });

  it('returns removed=false when no markers present', () => {
    const path = join(repo, 'no-milens.md');
    writeFileSync(path, '# Regular content\nNothing here');

    const result = removeInjectedBlock(path);
    expect(result.removed).toBe(false);
    expect(result.kept).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  it('returns removed=false when file does not exist', () => {
    const result = removeInjectedBlock(join(repo, 'nonexistent.md'));
    expect(result.removed).toBe(false);
  });
});

describe('removeDatabase', () => {
  const repo = tmpPath('db-test');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('removes .milens directory', () => {
    const milensDir = join(repo, '.milens');
    mkdirSync(milensDir, { recursive: true });
    writeFileSync(join(milensDir, 'milens.db'), 'mock');

    const result = removeDatabase(repo);
    expect(result).toContain('removed');
    expect(existsSync(milensDir)).toBe(false);
  });

  it('returns empty string when no .milens directory', () => {
    const result = removeDatabase(repo);
    expect(result).toBe('');
  });
});

describe('removeGitHooks', () => {
  const repo = tmpPath('hooks-test');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('removes milens-installed pre-commit hook', () => {
    const hooksDir = join(repo, '.git', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const hookContent = `#!/bin/bash\n# Auto-installed by milens init\necho "milens check"\n`;
    writeFileSync(join(hooksDir, 'pre-commit'), hookContent);

    const result = removeGitHooks(repo);
    expect(result).toContain('removed');
    expect(existsSync(join(hooksDir, 'pre-commit'))).toBe(false);
  });

  it('keeps hook not installed by milens', () => {
    const hooksDir = join(repo, '.git', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-commit'), `#!/bin/bash\necho "custom hook"\n`);

    const result = removeGitHooks(repo);
    expect(result).toContain('kept');
    expect(existsSync(join(hooksDir, 'pre-commit'))).toBe(true);
  });

  it('returns empty string when no hook exists', () => {
    const result = removeGitHooks(repo);
    expect(result).toBe('');
  });
});

describe('removeMcpEntry', () => {
  const repo = tmpPath('mcp-test');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('removes milens from standard mcp.json', () => {
    const path = join(repo, '.mcp.json');
    writeFileSync(path, JSON.stringify({
      mcpServers: {
        milens: { command: 'npx', args: ['milens', 'serve'] },
        other: { command: 'node', args: ['server.js'] },
      },
    }));

    const result = removeMcpEntry(repo, '.mcp.json');
    expect(result).toBe(true);

    const remaining = JSON.parse(readFileSync(path, 'utf-8'));
    expect(remaining.mcpServers.milens).toBeUndefined();
    expect(remaining.mcpServers.other).toBeDefined();
  });

  it('removes milens from opencode.json', () => {
    const path = join(repo, 'opencode.json');
    writeFileSync(path, JSON.stringify({
      mcp: { milens: { type: 'local', command: 'npx' } },
    }));

    const result = removeMcpEntry(repo, 'opencode.json');
    expect(result).toBe(true);

    const remaining = JSON.parse(readFileSync(path, 'utf-8'));
    expect(remaining.mcp).toBeUndefined();
  });

  it('returns false when file does not exist', () => {
    const result = removeMcpEntry(repo, '.mcp.json');
    expect(result).toBe(false);
  });
});

describe('removeEnvVars', () => {
  const repo = tmpPath('env-test');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('removes MILENS_* lines from .env', () => {
    writeInDir(repo, '.env', 'NODE_ENV=development\nMILENS_PROFILE=standard\nDATABASE_URL=postgres://...\nMILENS_DEBUG=true\n');
    const result = removeEnvVars(repo, '.env');
    expect(result).toContain('cleaned');

    const remaining = readFileSync(join(repo, '.env'), 'utf-8');
    expect(remaining).toContain('NODE_ENV=development');
    expect(remaining).toContain('DATABASE_URL');
    expect(remaining).not.toContain('MILENS_');
  });

  it('deletes .env if all content is MILENS vars', () => {
    writeInDir(repo, '.env', 'MILENS_PROFILE=standard\nMILENS_DEBUG=true\n');
    const result = removeEnvVars(repo, '.env');
    expect(result).toContain('cleaned');
    expect(existsSync(join(repo, '.env'))).toBe(false);
  });

  it('returns empty string when file does not exist', () => {
    const result = removeEnvVars(repo, '.env');
    expect(result).toBe('');
  });
});

describe('uninstall (dry-run)', () => {
  const repo = tmpPath('full-dryrun');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('scans and reports without modifying files', () => {
    // Create test fixtures
    writeInDir(repo, 'AGENTS.md', `# Project\n\n${START_MARKER}\nMilens block\n${END_MARKER}\n\n# Footer`);
    writeInDir(repo, join('.milens', 'milens.db'), 'fake db');
    writeInDir(repo, 'package.json', JSON.stringify({ name: 'test', devDependencies: { milens: '0.6.5' } }));

    const opts: UninstallOptions = {
      rootPath: repo,
      dryRun: true,
      purge: false,
      skipConfirm: true,
      keepAgents: false,
      keepConfigs: true,
      scanOnly: false,
    };

    const result = uninstall(opts);

    // Should find injected block
    const injected = result.autoRemoved.find(i => i.file === 'AGENTS.md');
    expect(injected).toBeDefined();
    expect(injected!.action).toContain('will remove');

    // Should find database
    const db = result.autoRemoved.find(i => i.file === '.milens/');
    expect(db).toBeDefined();

    // Should find package dep
    const dep = result.interactiveItems.find(i => i.file === 'package.json');
    expect(dep).toBeDefined();

    // Files should still exist (dry run)
    expect(existsSync(join(repo, 'AGENTS.md'))).toBe(true);
  });

  it('returns empty results when nothing found', () => {
    const opts: UninstallOptions = {
      rootPath: repo,
      dryRun: true,
      purge: false,
      skipConfirm: true,
      keepAgents: false,
      keepConfigs: true,
      scanOnly: false,
    };

    const result = uninstall(opts);
    const allCount = result.autoRemoved.length + result.interactiveItems.length + result.manualReview.length;
    expect(allCount).toBe(0);
  });

  it('respects keepAgents option', () => {
    writeInDir(repo, 'AGENTS.md', `${START_MARKER}\nmilens\n${END_MARKER}`);
    writeInDir(repo, 'CLAUDE.md', `${START_MARKER}\nmilens\n${END_MARKER}`);

    const opts: UninstallOptions = {
      rootPath: repo,
      dryRun: true,
      purge: false,
      skipConfirm: true,
      keepAgents: true,
      keepConfigs: true,
      scanOnly: false,
    };

    const result = uninstall(opts);
    expect(result.autoRemoved.length).toBe(0);
  });
});

describe('uninstall (live)', () => {
  const repo = tmpPath('full-live');

  beforeEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('removes injected block and database', () => {
    writeInDir(repo, 'AGENTS.md', `${START_MARKER}\nMilens content\n${END_MARKER}`);
    mkdirSync(join(repo, '.milens'), { recursive: true });
    writeInDir(repo, join('.milens', 'milens.db'), 'fake db');
    writeInDir(repo, '.env', 'MILENS_PROFILE=standard\n');

    const opts: UninstallOptions = {
      rootPath: repo,
      dryRun: false,
      purge: false,
      skipConfirm: true,
      keepAgents: false,
      keepConfigs: true,
      scanOnly: false,
    };

    const result = uninstall(opts);

    // AGENTS.md should be deleted (only milens content)
    expect(existsSync(join(repo, 'AGENTS.md'))).toBe(false);

    // .milens should be removed
    expect(existsSync(join(repo, '.milens'))).toBe(false);

    // Check results
    const agentsItem = result.autoRemoved.find(i => i.file === 'AGENTS.md');
    expect(agentsItem).toBeDefined();

    const dbItem = result.autoRemoved.find(i => i.file === '.milens/');
    expect(dbItem).toBeDefined();
  });

  it('removes injected block and keeps user content', () => {
    writeInDir(repo, 'AGENTS.md', `# User Content\n\n${START_MARKER}\nMilens\n${END_MARKER}\n\n# More Content`);

    const opts: UninstallOptions = {
      rootPath: repo,
      dryRun: false,
      purge: false,
      skipConfirm: true,
      keepAgents: false,
      keepConfigs: true,
      scanOnly: false,
    };

    uninstall(opts);

    expect(existsSync(join(repo, 'AGENTS.md'))).toBe(true);
    const content = readFileSync(join(repo, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# User Content');
    expect(content).toContain('# More Content');
    expect(content).not.toContain(START_MARKER);
    expect(content).not.toContain('Milens');
  });
});
