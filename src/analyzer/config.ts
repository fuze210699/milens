import { join, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * Auto-detect project aliases from config files.
 * Supports: tsconfig.json, jsconfig.json, composer.json (PSR-4),
 *           pyproject.toml (tool.poetry / [project] packages),
 *           Cargo.toml (workspace members), go.mod (module name).
 */
export function loadAliases(rootPath: string): Record<string, string> {
  const aliases: Record<string, string> = {};

  // ── TypeScript: tsconfig.json paths ──
  readTsConfigPaths(join(rootPath, 'tsconfig.json'), aliases);

  // ── JavaScript: jsconfig.json paths ──
  readTsConfigPaths(join(rootPath, 'jsconfig.json'), aliases);

  // ── PHP: composer.json PSR-4 autoload ──
  readComposerPsr4(join(rootPath, 'composer.json'), aliases);

  // ── Python: pyproject.toml package dirs ──
  readPyprojectAliases(join(rootPath, 'pyproject.toml'), aliases);

  // ── Go: go.mod module name ──
  readGoModAliases(join(rootPath, 'go.mod'), aliases);

  // ── Rust: Cargo.toml workspace members ──
  readCargoAliases(join(rootPath, 'Cargo.toml'), aliases);

  // ── Monorepo: scan immediate subdirectories for tsconfig/jsconfig ──
  scanSubdirectoryConfigs(rootPath, aliases);

  return aliases;
}

/**
 * Strip // and /* comments from JSONC, respecting string literals.
 * Replaces comment content with spaces to preserve positions/offsets.
 */
function stripJsonComments(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    // String literal — skip to closing quote
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++; // skip escaped char
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
    // Line comment
    } else if (text[i] === '/' && text[i + 1] === '/') {
      let j = i + 2;
      while (j < text.length && text[j] !== '\n') j++;
      result += ' '.repeat(j - i);
      i = j;
    // Block comment
    } else if (text[i] === '/' && text[i + 1] === '*') {
      let j = i + 2;
      while (j < text.length - 1 && !(text[j] === '*' && text[j + 1] === '/')) j++;
      j += 2; // skip */
      result += ' '.repeat(j - i);
      i = j;
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

function readTsConfigPaths(configPath: string, aliases: Record<string, string>): void {
  if (!existsSync(configPath)) return;
  try {
    const raw = stripJsonComments(readFileSync(configPath, 'utf-8'));
    const cfg = JSON.parse(raw);

    // Handle "extends" — resolve base config paths
    if (cfg.extends) {
      const baseDir = resolve(configPath, '..');
      const basePath = resolveExtendsPath(baseDir, cfg.extends);
      if (basePath) readTsConfigPaths(basePath, aliases);
    }

    // Handle "references" — modern multi-config projects (e.g. Vue 3 create-vue)
    // tsconfig.json may have no paths itself but reference tsconfig.app.json which does
    if (Array.isArray(cfg.references)) {
      const baseDir = resolve(configPath, '..');
      for (const ref of cfg.references) {
        const refPath = ref?.path;
        if (typeof refPath !== 'string') continue;
        const resolved = resolve(baseDir, refPath);
        // Reference can point to a directory (containing tsconfig.json) or a file
        for (const candidate of [resolved, join(resolved, 'tsconfig.json'), resolved + '.json']) {
          if (existsSync(candidate)) {
            readTsConfigPaths(candidate, aliases);
            break;
          }
        }
      }
    }

    const paths = cfg.compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries(paths)) {
      const clean = alias.replace('/*', '');
      const target = (targets as string[])[0]?.replace('/*', '').replace('./', '') ?? '';
      if (clean && target) aliases[clean] = target;
    }
  } catch { /* ignore parse errors */ }
}

function resolveExtendsPath(baseDir: string, extendsValue: string): string | null {
  // Could be a relative path or a node_modules package
  if (extendsValue.startsWith('.')) {
    const resolved = resolve(baseDir, extendsValue);
    for (const candidate of [resolved, resolved + '.json']) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage']);

function scanSubdirectoryConfigs(rootPath: string, aliases: Record<string, string>): void {
  let entries: import('node:fs').Dirent[];
  try { entries = readdirSync(rootPath, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const subDir = entry.name;
    const subAliases: Record<string, string> = {};
    readTsConfigPaths(join(rootPath, subDir, 'tsconfig.json'), subAliases);
    readTsConfigPaths(join(rootPath, subDir, 'jsconfig.json'), subAliases);
    for (const [alias, target] of Object.entries(subAliases)) {
      const prefixed = join(subDir, target);
      if (alias in aliases) {
        // Append as alternative target (tried in order during resolution)
        if (!aliases[alias].split('|').includes(prefixed)) {
          aliases[alias] += '|' + prefixed;
        }
      } else {
        aliases[alias] = prefixed;
      }
    }
  }
}

function readComposerPsr4(composerPath: string, aliases: Record<string, string>): void {
  if (!existsSync(composerPath)) return;
  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf-8'));
    for (const section of ['autoload', 'autoload-dev']) {
      for (const [ns, dir] of Object.entries(composer[section]?.['psr-4'] ?? {})) {
        aliases[ns] = (dir as string).replace(/\/$/, '');
      }
    }
  } catch { /* ignore */ }
}

function readPyprojectAliases(pyprojectPath: string, aliases: Record<string, string>): void {
  if (!existsSync(pyprojectPath)) return;
  try {
    const content = readFileSync(pyprojectPath, 'utf-8');
    // Simple TOML parsing for package name → src mapping
    // Look for [tool.poetry] name or [project] name
    const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (nameMatch) {
      const pkgName = nameMatch[1].replace(/-/g, '_');
      // Check common Python source layouts
      const rootDir = resolve(pyprojectPath, '..');
      if (existsSync(join(rootDir, 'src', pkgName))) {
        aliases[pkgName] = `src/${pkgName}`;
      } else if (existsSync(join(rootDir, pkgName))) {
        aliases[pkgName] = pkgName;
      }
    }
  } catch { /* ignore */ }
}

function readGoModAliases(goModPath: string, aliases: Record<string, string>): void {
  if (!existsSync(goModPath)) return;
  try {
    const content = readFileSync(goModPath, 'utf-8');
    const moduleMatch = content.match(/^module\s+(\S+)/m);
    if (moduleMatch) {
      aliases[moduleMatch[1]] = '.';
    }
  } catch { /* ignore */ }
}

function readCargoAliases(cargoPath: string, aliases: Record<string, string>): void {
  if (!existsSync(cargoPath)) return;
  try {
    const content = readFileSync(cargoPath, 'utf-8');
    // Extract [package] name for crate:: alias
    const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (nameMatch) {
      aliases[`crate::${nameMatch[1].replace(/-/g, '_')}`] = 'src';
    }
    // Extract workspace members
    const membersMatch = content.match(/members\s*=\s*\[([^\]]+)\]/);
    if (membersMatch) {
      const members = membersMatch[1].match(/"([^"]+)"/g);
      if (members) {
        for (const m of members) {
          const dir = m.replace(/"/g, '');
          aliases[dir] = dir;
        }
      }
    }
  } catch { /* ignore */ }
}
