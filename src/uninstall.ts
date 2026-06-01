import {
  readFileSync, writeFileSync, rmSync, existsSync,
  readdirSync, statSync, mkdirSync
} from 'node:fs';
import { resolve, relative, join, extname, basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import type { RepoEntry } from './types.js';

export interface UninstallOptions {
  rootPath: string;
  dryRun: boolean;
  purge: boolean;
  skipConfirm: boolean;
  keepAgents: boolean;
  keepConfigs: boolean;
  scanOnly: boolean;
}

export interface AutoRemoveItem {
  file: string;
  action: string;
}

export interface InteractiveItem {
  type: 'mcp-config' | 'dependency' | 'env-var';
  file: string;
  editor?: string;
  detail: string;
  confirmed: boolean;
  action: string;
}

export interface ManualRefItem {
  file: string;
  line: number;
  match: string;
}

export interface UninstallResult {
  autoRemoved: AutoRemoveItem[];
  interactiveItems: InteractiveItem[];
  manualReview: ManualRefItem[];
  summary: UninstallSummary;
}

export interface UninstallSummary {
  filesRemoved: number;
  dirsRemoved: number;
  blocksRemoved: number;
  configsCleaned: number;
  manualRemaining: number;
}

const START_MARKER = '<!-- milens:start -->';
const END_MARKER = '<!-- milens:end -->';

const INJECTED_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.windsurfrules',
  join('.github', 'copilot-instructions.md'),
  join('.cursor', 'index.mdc'),
];

const MCP_CONFIG_FILES: Array<{ file: string; editor: string; key: string }> = [
  { file: '.mcp.json', editor: 'VS Code', key: 'mcpServers.milens' },
  { file: join('.vscode', 'mcp.json'), editor: 'VS Code (workspace)', key: 'mcpServers.milens' },
  { file: join('.cursor', 'mcp.json'), editor: 'Cursor', key: 'mcpServers.milens' },
  { file: join('.claude', 'mcp.json'), editor: 'Claude Code', key: 'mcpServers.milens' },
  { file: 'opencode.json', editor: 'OpenCode', key: 'mcp.milens' },
  { file: join('.zed', 'settings.json'), editor: 'Zed', key: 'context_servers.milens' },
  { file: '.cursorrules', editor: 'Cursor', key: 'mcpServers.milens' },
];

const GEN_DIR_PATTERNS = [
  join('.cursor', 'rules'),
  join('.claude', 'skills', 'generated'),
  join('.claude', 'rules'),
  join('.agents', 'skills'),
  join('.github', 'instructions'),
];

export function uninstall(opts: UninstallOptions): UninstallResult {
  const root = resolve(opts.rootPath);

  // ── Scan Phase ──
  const injectedBlocks = scanInjectedBlocks(root, opts.keepAgents);
  const generatedFiles = scanGeneratedFiles(root);
  const gitHookInfo = scanGitHooks(root);
  const cronInfo = scanCronEntry();
  const winTaskInfo = scanWinScheduledTask();
  const dbInfo = scanDatabase(root);
  const regInfo = scanRegistryEntry(root);
  const mcpConfigs = scanMcpConfigs(root);
  const pkgDep = scanPackageJson(root);
  const envVars = scanEnvFiles(root);
  const manualRefs = scanManualReferences(root);

  const autoRemoved: AutoRemoveItem[] = [];
  const interactiveItems: InteractiveItem[] = [];
  let filesRemoved = 0;
  let dirsRemoved = 0;
  let blocksRemoved = 0;
  let configsCleaned = 0;

  // ── Auto-Remove Phase ──
  if (!opts.dryRun && !opts.scanOnly) {
    // Injected blocks
    for (const fp of injectedBlocks) {
      const r = removeInjectedBlock(join(root, fp));
      if (r.removed) {
        blocksRemoved++;
        if (r.kept) {
          autoRemoved.push({ file: fp, action: `removed milens block, kept user content` });
        } else {
          filesRemoved++;
          autoRemoved.push({ file: fp, action: `deleted (milens content only)` });
        }
      }
    }

    // Generated files/dirs
    for (const item of generatedFiles) {
      const fullPath = join(root, item.path);
      try {
        if (item.type === 'dir') {
          rmSync(fullPath, { recursive: true, force: true });
          dirsRemoved++;
          autoRemoved.push({ file: item.path, action: `deleted directory (${item.count} files)` });
        } else {
          rmSync(fullPath, { force: true });
          filesRemoved++;
          autoRemoved.push({ file: item.path, action: 'deleted' });
        }
      } catch {
        autoRemoved.push({ file: item.path, action: 'failed to delete (permission denied)' });
      }
    }

    // Clean up empty parent dirs after removing generated files
    for (const pattern of GEN_DIR_PATTERNS) {
      cleanupEmptyDirs(join(root, pattern), root, autoRemoved, dirsRemoved);
    }

    // Git hooks
    if (gitHookInfo) {
      const result = removeGitHooks(root);
      if (result) {
        filesRemoved++;
        autoRemoved.push({ file: gitHookInfo, action: result });
      }
    }

    // Cron
    if (cronInfo) {
      const result = removeCronEntry();
      if (result) {
        autoRemoved.push({ file: 'crontab', action: result });
      }
    }

    // Windows Scheduled Task
    if (winTaskInfo) {
      const result = removeWinScheduledTask();
      if (result) {
        autoRemoved.push({ file: 'Windows Scheduled Task', action: result });
      }
    }

    // Database
    if (dbInfo) {
      const result = removeDatabase(root);
      if (result) {
        dirsRemoved++;
        autoRemoved.push({ file: '.milens/', action: result });
      }
    }

    // Registry entry
    if (regInfo) {
      const result = removeRegistryEntry(root);
      if (result) {
        autoRemoved.push({ file: '~/.milens/registry.json', action: result });
      }
    }

    // Purge: remove all global milens data
    if (opts.purge) {
      try {
        const milensHome = join(homedir(), '.milens');
        if (existsSync(milensHome)) {
          rmSync(milensHome, { recursive: true, force: true });
          dirsRemoved++;
          autoRemoved.push({ file: '~/.milens/', action: 'purged all global data' });
        }
      } catch {
        autoRemoved.push({ file: '~/.milens/', action: 'failed to purge (permission denied)' });
      }
    }

    // Interactive items — scan and report (actual removal via confirm)
    if (!opts.skipConfirm && !opts.keepConfigs) {
      for (const cfg of mcpConfigs) {
        interactiveItems.push({
          type: 'mcp-config',
          file: cfg.file,
          editor: cfg.editor,
          detail: cfg.preview || `milens entry in ${cfg.file}`,
          confirmed: false,
          action: 'skipped (requires confirmation)',
        });
      }
    }

    if (!opts.skipConfirm) {
      if (pkgDep) {
        interactiveItems.push({
          type: 'dependency',
          file: 'package.json',
          detail: pkgDep.type === 'dependency'
            ? `"milens" in dependencies (${pkgDep.version})`
            : `"milens" in devDependencies (${pkgDep.version})`,
          confirmed: false,
          action: 'skipped (requires confirmation)',
        });
      }

      for (const env of envVars) {
        interactiveItems.push({
          type: 'env-var',
          file: env.file,
          detail: env.vars.join(', '),
          confirmed: false,
          action: 'skipped (requires confirmation)',
        });
      }
    }
  } else {
    // Dry run — just populate items for reporting
    for (const fp of injectedBlocks) {
      const fullPath = join(root, fp);
      const content = tryRead(fullPath);
      if (content) {
        const before = content.slice(0, content.indexOf(START_MARKER)).trim();
        const after = content.slice(content.indexOf(END_MARKER) + END_MARKER.length).trim();
        if (!before && !after) {
          autoRemoved.push({ file: fp, action: 'will delete file (milens content only)' });
        } else {
          autoRemoved.push({ file: fp, action: 'will remove milens block, keep user content' });
        }
      }
    }

    for (const item of generatedFiles) {
      autoRemoved.push({
        file: item.path,
        action: `will delete${item.type === 'dir' ? ` directory (${item.count} files)` : ''}`,
      });
    }

    if (gitHookInfo) autoRemoved.push({ file: gitHookInfo, action: 'will remove' });
    if (cronInfo) autoRemoved.push({ file: 'crontab', action: 'will remove milens entry' });
    if (winTaskInfo) autoRemoved.push({ file: 'Windows Scheduled Task', action: 'will remove' });
    if (dbInfo) autoRemoved.push({ file: '.milens/', action: 'will delete database' });
    if (regInfo) autoRemoved.push({ file: '~/.milens/registry.json', action: 'will remove entry' });
    if (opts.purge) autoRemoved.push({ file: '~/.milens/', action: 'will purge all global data' });

    for (const cfg of mcpConfigs) {
      interactiveItems.push({
        type: 'mcp-config', file: cfg.file, editor: cfg.editor,
        detail: cfg.preview || `milens entry`, confirmed: false,
        action: 'requires confirmation',
      });
    }
    if (pkgDep) {
      interactiveItems.push({
        type: 'dependency', file: 'package.json',
        detail: pkgDep.type === 'dependency'
          ? `"milens" in dependencies (${pkgDep.version})`
          : `"milens" in devDependencies (${pkgDep.version})`,
        confirmed: false, action: 'requires confirmation',
      });
    }
    for (const env of envVars) {
      interactiveItems.push({
        type: 'env-var', file: env.file, detail: env.vars.join(', '),
        confirmed: false, action: 'requires confirmation',
      });
    }
  }

  return {
    autoRemoved,
    interactiveItems,
    manualReview: manualRefs,
    summary: {
      filesRemoved,
      dirsRemoved,
      blocksRemoved,
      configsCleaned,
      manualRemaining: manualRefs.length,
    },
  };
}

// ── Scan Functions ──

function scanInjectedBlocks(rootPath: string, keepAgents: boolean): string[] {
  const results: string[] = [];
  for (const relPath of INJECTED_FILES) {
    if (keepAgents && (relPath === 'AGENTS.md' || relPath === 'CLAUDE.md')) continue;
    const fullPath = join(rootPath, relPath);
    try {
      const content = readFileSync(fullPath, 'utf-8');
      if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
        results.push(relPath);
      }
    } catch { /* file doesn't exist */ }
  }
  return results;
}

function scanGeneratedFiles(rootPath: string): Array<{ path: string; type: string; count: number }> {
  const results: Array<{ path: string; type: string; count: number }> = [];

  for (const pattern of GEN_DIR_PATTERNS) {
    const dir = join(rootPath, pattern);
    if (!existsSync(dir)) continue;

    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (isMilensGenerated(fullPath)) {
          if (entry.isDirectory()) {
            let fileCount = 0;
            try {
              fileCount = countFilesRecursive(fullPath);
            } catch { fileCount = 1; }
            results.push({ path: relative(rootPath, fullPath).replace(/\\/g, '/'), type: 'dir', count: fileCount });
          } else {
            results.push({ path: relative(rootPath, fullPath).replace(/\\/g, '/'), type: 'file', count: 1 });
          }
        }
      }
    } catch { /* can't read dir */ }
  }

  return results;
}

function isMilensGenerated(filePath: string): boolean {
  const name = basename(filePath);
  if (name.startsWith('milens')) return true;
  if (name === 'milens.mdc') return true;
  if (name.endsWith('.instructions.md')) return true;

  try {
    const content = readFileSync(filePath, 'utf-8').slice(0, 500);
    if (content.includes('name: milens') || content.includes('Auto-generated by milens')) {
      return true;
    }
    if (content.includes(START_MARKER)) return true;
  } catch { /* binary/unreadable */ }

  return false;
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        count += countFilesRecursive(join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch { count = 1; }
  return count;
}

function scanGitHooks(rootPath: string): string | null {
  const hookPath = join(rootPath, '.git', 'hooks', 'pre-commit');
  if (!existsSync(hookPath)) return null;

  try {
    const content = readFileSync(hookPath, 'utf-8');
    if (content.includes('milens') && content.includes('Auto-installed by milens init')) {
      return join('.git', 'hooks', 'pre-commit');
    }
  } catch { /* can't read */ }
  return null;
}

function scanCronEntry(): boolean {
  try {
    const current = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: 'pipe' });
    return current.includes('milens evolve');
  } catch {
    return false;
  }
}

function scanWinScheduledTask(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execSync('schtasks /Query /TN "MilensEvolve"', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function scanDatabase(rootPath: string): boolean {
  return existsSync(join(rootPath, '.milens', 'milens.db'));
}

function scanRegistryEntry(rootPath: string): string | null {
  try {
    const { RepoRegistry } = require('./store/registry.js');
    const reg = new RepoRegistry();
    const entry = reg.findByRoot(resolve(rootPath));
    return entry ? entry.rootPath : null;
  } catch {
    return null;
  }
}

function scanMcpConfigs(rootPath: string): Array<{ file: string; editor: string; preview: string }> {
  const results: Array<{ file: string; editor: string; preview: string }> = [];

  for (const cfg of MCP_CONFIG_FILES) {
    const fullPath = join(rootPath, cfg.file);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, 'utf-8');
      if (!content.includes('"milens"') && !content.includes("'milens'")) continue;

      const idx = content.indexOf('"milens"');
      const previewStart = Math.max(0, idx - 20);
      const previewEnd = Math.min(content.length, idx + 120);
      let preview = content.slice(previewStart, previewEnd).replace(/\n/g, ' ').trim();

      // Find the milens object
      const braceIdx = content.indexOf('{', idx);
      if (braceIdx !== -1) {
        let depth = 0;
        let endIdx = braceIdx;
        for (let i = braceIdx; i < Math.min(content.length, braceIdx + 300); i++) {
          if (content[i] === '{') depth++;
          if (content[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
        }
        preview = content.slice(idx, endIdx).replace(/\n/g, ' ').trim();
      }

      results.push({ file: cfg.file, editor: cfg.editor, preview: preview.slice(0, 150) });
    } catch { /* parse error */ }
  }

  return results;
}

function scanPackageJson(rootPath: string): { type: 'dependency' | 'devDependency'; version: string } | null {
  const pkgPath = join(rootPath, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (pkg.dependencies?.milens) {
      return { type: 'dependency', version: pkg.dependencies.milens };
    }
    if (pkg.devDependencies?.milens) {
      return { type: 'devDependency', version: pkg.devDependencies.milens };
    }
  } catch { /* parse error */ }
  return null;
}

function scanEnvFiles(rootPath: string): Array<{ file: string; vars: string[] }> {
  const envFiles = ['.env', '.env.local', '.env.development'];
  const results: Array<{ file: string; vars: string[] }> = [];

  for (const envFile of envFiles) {
    const fullPath = join(rootPath, envFile);
    if (!existsSync(fullPath)) continue;

    try {
      const lines = readFileSync(fullPath, 'utf-8').split('\n');
      const milensLines: string[] = [];
      for (const line of lines) {
        if (/MILENS_/i.test(line)) {
          milensLines.push(line.trim());
        }
      }
      if (milensLines.length > 0) {
        results.push({ file: envFile, vars: milensLines });
      }
    } catch { /* can't read */ }
  }

  return results;
}

function scanManualReferences(rootPath: string): ManualRefItem[] {
  const refs: ManualRefItem[] = [];
  const skipDirs = ['node_modules', '.git', '.milens', 'dist', 'build', '.next', '__pycache__'];
  const skipPrefixes = [
    join(rootPath, '.cursor', 'rules'),
    join(rootPath, '.claude', 'skills', 'generated'),
    join(rootPath, '.claude', 'rules'),
    join(rootPath, '.agents', 'skills'),
    join(rootPath, '.github', 'instructions'),
  ];

  const isSkipped = (p: string): boolean => {
    if (skipDirs.some(d => p.includes(`${join('', d)}`))) return true;
    if (skipPrefixes.some(prefix => p.startsWith(prefix))) return true;
    if (MCP_CONFIG_FILES.some(c => p.endsWith(c.file))) return true;
    if (p.endsWith(join('', '.env')) || p.endsWith(join('', '.env.local')) || p.endsWith(join('', '.env.development'))) return true;
    return false;
  };

  const extensions = ['.md', '.mdx', '.yml', '.yaml', '.toml', '.txt', '.sh'];
  const candidateFiles = collectFiles(rootPath, extensions, skipDirs);

  for (const file of candidateFiles) {
    if (isSkipped(file)) continue;

    try {
      const lines = readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('milens')) {
          refs.push({
            file: relative(rootPath, file).replace(/\\/g, '/'),
            line: i + 1,
            match: lines[i].trim().slice(0, 120),
          });
        }
      }
    } catch { /* binary/unreadable */ }
  }

  return refs;
}

function collectFiles(root: string, extensions: string[], skipDirs: string[]): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        const rel = relative(root, fullPath);

        if (entry.isDirectory()) {
          if (skipDirs.includes(entry.name)) continue;
          if (entry.name.startsWith('.')) continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch { /* can't read dir */ }
  };
  walk(root);
  return results;
}

// ── Remove Functions ──

export function removeInjectedBlock(filePath: string): { removed: boolean; kept: boolean } {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const startIdx = content.indexOf(START_MARKER);
    const endIdx = content.indexOf(END_MARKER);

    if (startIdx === -1 || endIdx === -1) return { removed: false, kept: false };

    let before = content.slice(0, startIdx);
    let after = content.slice(endIdx + END_MARKER.length);

    before = before.replace(/\n{2,}$/, '\n');
    after = after.replace(/^\n{2,}/, '\n');

    const cleaned = (before + after).trim();

    if (!cleaned) {
      rmSync(filePath, { force: true });
      return { removed: true, kept: false };
    }

    writeFileSync(filePath, cleaned + '\n');
    return { removed: true, kept: true };
  } catch {
    return { removed: false, kept: false };
  }
}

export function removeDatabase(rootPath: string): string {
  const milensDir = join(rootPath, '.milens');
  if (existsSync(milensDir)) {
    rmSync(milensDir, { recursive: true, force: true });
    return 'removed .milens/ (database + configs)';
  }
  return '';
}

export function removeRegistryEntry(rootPath: string): string {
  try {
    const { RepoRegistry } = require('./store/registry.js');
    const reg = new RepoRegistry();
    const absolute = resolve(rootPath);
    const removed = reg.remove(absolute);
    return removed ? `removed registry entry for ${absolute}` : '';
  } catch {
    return '';
  }
}

export function removeGitHooks(rootPath: string): string {
  const hookPath = join(rootPath, '.git', 'hooks', 'pre-commit');
  if (!existsSync(hookPath)) return '';

  try {
    const content = readFileSync(hookPath, 'utf-8');
    if (!content.includes('milens') || !content.includes('Auto-installed by milens init')) {
      return 'git hook exists but was not installed by milens — kept';
    }
    rmSync(hookPath, { force: true });
    return 'removed milens-installed pre-commit hook';
  } catch {
    return '';
  }
}

export function removeCronEntry(): string {
  try {
    const current = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: 'pipe' });
    const lines = current.split('\n');
    const filtered = lines.filter(line => !line.includes('milens evolve'));
    if (filtered.length === lines.length) return '';

    const tmpFile = join(homedir(), '.milens', 'crontab.tmp');
    mkdirSync(dirname(tmpFile), { recursive: true });
    writeFileSync(tmpFile, filtered.join('\n').trim() + '\n');
    execSync(`crontab "${tmpFile}"`, { stdio: 'pipe' });
    rmSync(tmpFile, { force: true });
    return 'removed milens cron job';
  } catch {
    return '';
  }
}

export function removeWinScheduledTask(): string {
  if (process.platform !== 'win32') return '';
  try {
    execSync('schtasks /Delete /TN "MilensEvolve" /F', { stdio: 'pipe' });
    return 'removed Windows Scheduled Task "MilensEvolve"';
  } catch {
    return '';
  }
}

export function removeMcpEntry(rootPath: string, configFile: string): boolean {
  const fullPath = join(rootPath, configFile);
  if (!existsSync(fullPath)) return false;

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(content);
    let removed = false;

    if (configFile === 'opencode.json' && parsed.mcp?.milens) {
      delete parsed.mcp.milens;
      if (Object.keys(parsed.mcp).length === 0) delete parsed.mcp;
      removed = true;
    } else if (configFile === '.zed' + join('', 'settings.json') && parsed.context_servers?.milens) {
      delete parsed.context_servers.milens;
      if (Object.keys(parsed.context_servers).length === 0) delete parsed.context_servers;
      removed = true;
    } else if (parsed.mcpServers?.milens) {
      delete parsed.mcpServers.milens;
      if (Object.keys(parsed.mcpServers).length === 0) delete parsed.mcpServers;
      removed = true;
    }

    if (removed) {
      writeFileSync(fullPath, JSON.stringify(parsed, null, 2) + '\n');
    }
    return removed;
  } catch {
    return false;
  }
}

export function removePackageDep(rootPath: string): string {
  try {
    execSync('npm uninstall milens', { cwd: rootPath, stdio: 'pipe' });
    return 'removed milens from package.json';
  } catch {
    // Fall back to manual removal
    const pkgPath = join(rootPath, 'package.json');
    if (!existsSync(pkgPath)) return '';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      let removed = false;
      if (pkg.dependencies?.milens) { delete pkg.dependencies.milens; removed = true; }
      if (pkg.devDependencies?.milens) { delete pkg.devDependencies.milens; removed = true; }
      if (removed) {
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        return 'removed milens from package.json (manual)';
      }
    } catch { /* parse error */ }
    return '';
  }
}

export function removeEnvVars(rootPath: string, envFile: string): string {
  const fullPath = join(rootPath, envFile);
  if (!existsSync(fullPath)) return '';

  try {
    const lines = readFileSync(fullPath, 'utf-8').split('\n');
    const filtered = lines.filter(line => !/MILENS_/i.test(line));
    const cleaned = filtered.join('\n').trim();

    if (cleaned) {
      writeFileSync(fullPath, cleaned + '\n');
    } else {
      rmSync(fullPath, { force: true });
    }
    return `cleaned MILENS_* vars from ${envFile}`;
  } catch {
    return '';
  }
}

// ── Helpers ──

function cleanupEmptyDirs(
  dirPath: string, rootPath: string,
  items: AutoRemoveItem[], _dirsCount: number
): void {
  try {
    if (!existsSync(dirPath)) return;
    if (readdirSync(dirPath).length === 0) {
      rmSync(dirPath, { recursive: true, force: true });
      items.push({ file: relative(rootPath, dirPath).replace(/\\/g, '/'), action: 'cleaned empty directory' });
    }
    // Check parent
    const parent = dirname(dirPath);
    if (parent !== rootPath && existsSync(parent)) {
      try {
        if (readdirSync(parent).length === 0) {
          rmSync(parent, { recursive: true, force: true });
          items.push({ file: relative(rootPath, parent).replace(/\\/g, '/'), action: 'cleaned empty directory' });
        }
      } catch { /* parent may not exist */ }
    }
  } catch { /* dir doesn't exist */ }
}

function tryRead(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ── Output Formatting ──

export function formatUninstallOutput(result: UninstallResult, dryRun: boolean, scanOnly: boolean): string {
  const lines: string[] = [];

  const header = dryRun
    ? 'Milens Uninstall — Dry Run'
    : 'Milens Uninstall';
  const sub = dryRun ? '(No files will be modified)' : scanOnly ? '(Scan only)' : '';

  lines.push('╔════════════════════════════════════════════════════╗');
  lines.push(`║  ${padCenter(header, 48)}║`);
  if (sub) lines.push(`║  ${padCenter(sub, 48)}║`);
  lines.push('╚════════════════════════════════════════════════════╝');
  lines.push('');

  // Step 1: Auto-remove section
  if (result.autoRemoved.length > 0) {
    const label = dryRun ? 'WILL AUTO-REMOVE' : 'AUTO-REMOVED';
    lines.push(`📁 ${label} (${result.autoRemoved.length} items)`);
    lines.push('');
    for (const item of result.autoRemoved) {
      lines.push(`  ✗ ${item.file} — ${item.action}`);
    }
    lines.push('');
    lines.push('━'.repeat(50));
    lines.push('');
  }

  // Step 2: Interactive items
  if (result.interactiveItems.length > 0) {
    const label = scanOnly ? 'SCAN RESULTS' : dryRun ? 'NEEDS CONFIRMATION' : 'INTERACTIVE';
    lines.push(`⚠️  ${label} (${result.interactiveItems.length} items)`);
    lines.push('');
    for (const item of result.interactiveItems) {
      const prefix = item.confirmed ? '✓' : '?';
      const editorInfo = item.editor ? ` — ${item.editor}` : '';
      lines.push(`  ${prefix} ${item.file}${editorInfo}: ${item.detail}`);
    }
    lines.push('');
    lines.push('━'.repeat(50));
    lines.push('');
  }

  // Step 3: Manual review
  if (result.manualReview.length > 0) {
    lines.push(`📋 MANUAL REVIEW (${result.manualReview.length} files — your content, cannot auto-remove)`);
    lines.push('');
    for (const ref of result.manualReview.slice(0, 15)) {
      lines.push(`   ${ref.file}:${ref.line}  "${ref.match}"`);
    }
    if (result.manualReview.length > 15) {
      lines.push(`   ... and ${result.manualReview.length - 15} more references`);
    }
    lines.push('');
    lines.push('━'.repeat(50));
    lines.push('');
  }

  // Summary
  if (!scanOnly) {
    lines.push('Summary:');
    lines.push(`  Auto-remove: ${result.autoRemoved.length} items (injected blocks, generated files, hooks, DB, cron)`);
    lines.push(`  Interactive: ${result.interactiveItems.length} items (MCP configs, deps, env)`);
    lines.push(`  Manual:      ${result.summary.manualRemaining} files to review`);
  }

  return lines.join('\n');
}

function padCenter(text: string, width: number): string {
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}
