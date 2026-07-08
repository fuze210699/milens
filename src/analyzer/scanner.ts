import { join, relative } from 'node:path';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import ignore from 'ignore';
import { supportedExtensions } from '../parser/languages.js';

export interface ScannedFile {
  relativePath: string;   // relative to root, forward slashes
  absolutePath: string;
}

export function scanFiles(rootPath: string, verbose = false): ScannedFile[] {
  const exts = new Set(supportedExtensions());
  const ig = loadIgnoreRules(rootPath);
  const results: ScannedFile[] = [];

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = join(dir, entry);
      const rel = relative(rootPath, abs).replace(/\\/g, '/');

      // Skip common non-source directories (explicit list only)
      if (SKIP_DIRS.has(entry)) continue;

      if (ig.ignores(rel)) continue;

      let stat;
      try { stat = statSync(abs); } catch { continue; }

      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        walk(abs);
      } else if (stat.isFile()) {
        const ext = '.' + entry.split('.').pop()?.toLowerCase();
        if (exts.has(ext)) {
          results.push({ relativePath: rel, absolutePath: abs });
        } else if (verbose) {
          // Skip non-supported files silently
        }
      }
    }
  }

  walk(rootPath);
  return results;
}

function loadIgnoreRules(rootPath: string): ReturnType<typeof ignore> {
  const ig = ignore();

  // Always ignore these
  ig.add(['node_modules', 'dist', 'build', '.git', '__pycache__', 'vendor', 'target']);

  // Read .gitignore if present
  try {
    const content = readFileSync(join(rootPath, '.gitignore'), 'utf-8');
    ig.add(content);
  } catch { /* no .gitignore */ }

  return ig;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit',
  '__pycache__', '.venv', 'venv', 'env',
  'vendor', 'target',
  '.idea', '.vscode',
  'coverage', '.nyc_output',
]);
