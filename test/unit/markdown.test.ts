import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractMarkdown } from '../../src/parser/lang-md.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('Markdown extractor', () => {
  it('extracts headings as section symbols', () => {
    const source = readFileSync(join(FIXTURES, 'md-project', 'docs', 'guide.md'), 'utf-8');
    const result = extractMarkdown(source, 'docs/guide.md');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('Project Guide');
    expect(names).toContain('Getting Started');
    expect(names).toContain('Architecture');
    expect(names).toContain('Models');
    expect(names).toContain('Authentication');
    expect(names).toContain('API Reference');
    expect(names).toContain('Endpoints');
    expect(names).toContain('Error Codes');
    expect(names).toContain('Contributing');

    // All should be section kind
    for (const sym of result.symbols) {
      expect(sym.kind).toBe('section');
      expect(sym.exported).toBe(true);
    }
  });

  it('skips headings inside fenced code blocks', () => {
    const source = readFileSync(join(FIXTURES, 'md-project', 'docs', 'guide.md'), 'utf-8');
    const result = extractMarkdown(source, 'docs/guide.md');

    const names = result.symbols.map(s => s.name);
    expect(names).not.toContain('This is not a real heading');
  });

  it('sets correct parent-child relationships', () => {
    const source = '# A\n\n## B\n\n### C\n\n## D\n';
    const result = extractMarkdown(source, 'test.md');

    expect(result.symbols).toHaveLength(4);
    const [a, b, c, d] = result.symbols;

    expect(a.parentId).toBeUndefined();      // A is top-level
    expect(b.parentId).toBe(a.id);            // B is child of A
    expect(c.parentId).toBe(b.id);            // C is child of B
    expect(d.parentId).toBe(a.id);            // D is child of A (not C)
  });

  it('calculates heading endLines correctly', () => {
    const source = '# A\nline\n## B\nline\n## C\nline\n';
    const result = extractMarkdown(source, 'test.md');

    expect(result.symbols).toHaveLength(3);
    const [a, b, c] = result.symbols;

    expect(a).toMatchObject({ name: 'A', startLine: 1, endLine: 6 });
    expect(b).toMatchObject({ name: 'B', startLine: 3, endLine: 4 });
    expect(c).toMatchObject({ name: 'C', startLine: 5, endLine: 6 });
  });

  it('extracts local file links as imports', () => {
    const source = readFileSync(join(FIXTURES, 'md-project', 'docs', 'guide.md'), 'utf-8');
    const result = extractMarkdown(source, 'docs/guide.md');

    const paths = result.imports.map(i => i.modulePath);

    // Local file references
    expect(paths).toContain('../ts-project/src/models.ts');
    expect(paths).toContain('../ts-project/src/auth.ts');
    expect(paths).toContain('./CONTRIBUTING.md');

    // Should NOT include external URLs
    expect(paths).not.toContain('https://example.com/errors');
  });

  it('ignores external URLs and anchors', () => {
    const source = '# Links\n\n[ext](https://example.com) [anchor](#section) [local](./file.md)\n';
    const result = extractMarkdown(source, 'test.md');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].modulePath).toBe('./file.md');
  });

  it('handles empty markdown', () => {
    const result = extractMarkdown('', 'empty.md');
    expect(result.symbols).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
  });

  it('handles markdown with no headings', () => {
    const source = 'Just some text.\n\nAnother paragraph.\n';
    const result = extractMarkdown(source, 'text.md');
    expect(result.symbols).toHaveLength(0);
  });

  it('strips trailing hashes from ATX headings', () => {
    const source = '## Section Title ##\n';
    const result = extractMarkdown(source, 'test.md');

    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('Section Title');
  });

  it('handles all heading levels', () => {
    const source = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n';
    const result = extractMarkdown(source, 'test.md');

    expect(result.symbols).toHaveLength(6);
    expect(result.symbols.map(s => s.name)).toEqual(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  });

  it('generates correct symbol IDs', () => {
    const source = '# Title\n## Section\n';
    const result = extractMarkdown(source, 'docs/guide.md');

    expect(result.symbols[0].id).toBe('docs/guide.md#section:Title:1');
    expect(result.symbols[1].id).toBe('docs/guide.md#section:Section:2');
  });

  it('does not extract links inside code blocks', () => {
    const source = '# Title\n\n```\n[not a link](./file.md)\n```\n\n[real link](./other.md)\n';
    const result = extractMarkdown(source, 'test.md');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].modulePath).toBe('./other.md');
  });
});
