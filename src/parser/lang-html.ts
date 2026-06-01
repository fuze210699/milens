import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';
import type { RawImport } from '../types.js';

const spec: LangSpec = {
  id: 'html',
  extensions: ['.html', '.htm'],
  wasmName: 'tree-sitter-html',
  queries: {
    calls: `(element
      (start_tag
        (attribute (attribute_name) (quoted_attribute_value (attribute_value) @callee)))
    ) @def`,
  },
  resolveImport(raw, fromFile, root, aliases) {
    // Check aliases first
    let aliased = false;
    for (const [alias, target] of Object.entries(aliases)) {
      if (raw.startsWith(alias + '/') || raw === alias) {
        raw = raw.replace(alias, target);
        aliased = true;
        break;
      }
    }

    if (!aliased && !raw.startsWith('.') && !raw.startsWith('/')) return null;
    const base = aliased ? join(root, raw) : join(dirname(join(root, fromFile)), raw);
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

/**
 * Extract form actions, anchor hrefs, img/src/source assets, and link icons.
 */
export function extractHtmlLinks(source: string, filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match any attribute value prefixed by common tag+attribute patterns
    const patterns = [
      /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i,
      /<form\b[^>]*\baction\s*=\s*["']([^"']+)["']/i,
      /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i,
      /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i,
      /<link\b[^>]*\brel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*\bhref\s*=\s*["']([^"']+)["']/i,
      /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["']/i,
    ];
    for (const re of patterns) {
      const m = line.match(re);
      if (m && !m[1].startsWith('#') && !m[1].startsWith('javascript:')) {
        imports.push({
          filePath,
          modulePath: m[1],
          names: [],
          isDefault: false,
          isWildcard: true,
          line: i + 1,
        });
        break;
      }
    }
  }

  return imports;
}

export default spec;
