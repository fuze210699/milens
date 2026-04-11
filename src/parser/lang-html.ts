import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';
import type { RawImport } from '../types.js';

const spec: LangSpec = {
  id: 'html',
  extensions: ['.html', '.htm'],
  wasmName: 'tree-sitter-html',
  queries: {}, // HTML extraction done via regex helpers in engine.ts
  resolveImport(raw, fromFile, root, aliases) {
    // Check aliases first
    for (const [alias, target] of Object.entries(aliases)) {
      if (raw.startsWith(alias + '/') || raw === alias) {
        raw = raw.replace(alias, target);
        break;
      }
    }

    if (!raw.startsWith('.') && !raw.startsWith('/')) return null;
    const dir = dirname(join(root, fromFile));
    const base = join(dir, raw);
    if (existsSync(base)) return relative(root, base).replace(/\\/g, '/');
    return null;
  },
};

/**
 * Extract inline <script> blocks from HTML (excludes <script src="...">).
 * Returns each block's content and its starting line offset.
 */
export function extractHtmlScripts(source: string): Array<{ content: string; lineOffset: number }> {
  const results: Array<{ content: string; lineOffset: number }> = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const fullMatchStart = match.index;
    const tagEnd = match[0].indexOf('>') + 1;
    const contentStart = fullMatchStart + tagEnd;
    const lineOffset = source.slice(0, contentStart).split('\n').length - 1;
    if (match[1].trim()) {
      results.push({ content: match[1], lineOffset });
    }
  }
  return results;
}

/**
 * Extract asset references from HTML: <script src="...">, <link rel="stylesheet" href="...">.
 */
export function extractHtmlRefs(source: string, filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // <script src="...">
    const scriptMatch = line.match(/<script[^>]+\bsrc\s*=\s*["']([^"']+)["']/i);
    if (scriptMatch) {
      imports.push({
        filePath,
        modulePath: scriptMatch[1],
        names: [],
        isDefault: false,
        isWildcard: true,
        line: i + 1,
      });
    }

    // <link ... href="..." ...> (only stylesheet links)
    if (/<link\b/i.test(line) && /rel\s*=\s*["']stylesheet["']/i.test(line)) {
      const hrefMatch = line.match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch) {
        imports.push({
          filePath,
          modulePath: hrefMatch[1],
          names: [],
          isDefault: false,
          isWildcard: true,
          line: i + 1,
        });
      }
    }
  }

  return imports;
}

export default spec;
