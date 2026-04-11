import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';
import type { CodeSymbol, ExtractionResult, RawImport } from '../types.js';

const spec: LangSpec = {
  id: 'markdown',
  extensions: ['.md', '.mdx'],
  wasmName: '',
  queries: {},
  resolveImport(raw, fromFile, root, aliases) {
    // Strip anchor from path
    raw = raw.split('#')[0];
    if (!raw) return null;

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
 * Extract structural symbols from Markdown: headings → section symbols, links → imports.
 */
export function extractMarkdown(source: string, filePath: string): ExtractionResult {
  const lines = source.split(/\r?\n/);
  const totalLines = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  const symbols: CodeSymbol[] = [];
  const imports: RawImport[] = [];

  // Track fenced code blocks to skip them
  let inCodeBlock = false;

  // First pass: collect headings
  const headings: { level: number; name: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s*#+\s*)?$/);
    if (headingMatch) {
      headings.push({
        level: headingMatch[1].length,
        name: headingMatch[2].trim(),
        line: i + 1,
      });
    }
  }

  // Build symbols from headings with proper endLine and parentId
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];

    // endLine: extends to line before next heading of same/higher level, or EOF
    let endLine = totalLines;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        endLine = headings[j].line - 1;
        break;
      }
    }

    // parentId: nearest preceding heading with lower level
    let parentId: string | undefined;
    for (let j = i - 1; j >= 0; j--) {
      if (headings[j].level < h.level) {
        parentId = `${filePath}#section:${headings[j].name}:${headings[j].line}`;
        break;
      }
    }

    symbols.push({
      id: `${filePath}#section:${h.name}:${h.line}`,
      name: h.name,
      kind: 'section',
      filePath,
      startLine: h.line,
      endLine,
      exported: true,
      parentId,
    });
  }

  // Second pass: extract links as imports
  inCodeBlock = false;
  const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    let match;
    while ((match = linkRe.exec(line)) !== null) {
      const url = match[2];
      // Only local file references, skip URLs and anchors
      if (!url.startsWith('http://') && !url.startsWith('https://') &&
          !url.startsWith('mailto:') && !url.startsWith('#')) {
        const path = url.split('#')[0];
        if (path) {
          imports.push({
            filePath,
            modulePath: path,
            names: [],
            isDefault: false,
            isWildcard: true,
            line: i + 1,
          });
        }
      }
    }
    linkRe.lastIndex = 0;
  }

  return {
    symbols,
    imports,
    calls: [],
    heritage: [],
    exportedNames: new Set(symbols.map(s => s.name)),
    reExports: [],
  };
}

export default spec;
