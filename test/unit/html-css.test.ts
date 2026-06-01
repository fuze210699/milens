import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getParser, loadLanguage } from '../../src/parser/loader.js';
import { extractFromTree } from '../../src/parser/extract.js';
import { extractHtmlScripts, extractHtmlRefs, extractHtmlLinks } from '../../src/parser/lang-html.js';
import htmlSpec from '../../src/parser/lang-html.js';
import jsSpec from '../../src/parser/lang-js.js';
import cssSpec from '../../src/parser/lang-css.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('HTML extractor', () => {
  const htmlSource = readFileSync(join(FIXTURES, 'html-project', 'index.html'), 'utf-8');

  it('extracts inline <script> blocks', () => {
    const scripts = extractHtmlScripts(htmlSource);
    expect(scripts.length).toBe(1);
    expect(scripts[0].content).toContain('initApp');
    expect(scripts[0].content).toContain('renderList');
    expect(scripts[0].lineOffset).toBeGreaterThan(0);
  });

  it('does not extract <script src="..."> as inline', () => {
    const scripts = extractHtmlScripts(htmlSource);
    // Only inline scripts, not src-referenced ones
    for (const s of scripts) {
      expect(s.content).not.toContain('src=');
    }
  });

  it('extracts <script src> and <link href> as imports', () => {
    const refs = extractHtmlRefs(htmlSource, 'index.html');
    const paths = refs.map(r => r.modulePath);

    expect(paths).toContain('./js/utils.js');
    expect(paths).toContain('./js/analytics.js');
    expect(paths).toContain('./css/main.css');
    expect(refs.length).toBe(3);
  });

  it('parses inline script content as JavaScript', async () => {
    const scripts = extractHtmlScripts(htmlSource);
    const parser = await getParser(jsSpec.wasmName);
    const lang = await loadLanguage(jsSpec.wasmName);
    const tree = parser.parse(scripts[0].content);
    const result = extractFromTree(tree, lang, jsSpec, 'index.html');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('initApp');
    expect(names).toContain('renderList');

    // Verify calls are extracted
    expect(result.calls.some(c => c.calleeName === 'fetchData')).toBe(true);
    expect(result.calls.some(c => c.calleeName === 'renderList')).toBe(true);
    expect(result.calls.some(c => c.calleeName === 'initApp')).toBe(true);
  });

  it('computes correct line offsets for inline scripts', () => {
    const scripts = extractHtmlScripts(htmlSource);
    // The inline script starts after <script> tag on line 11 (1-indexed)
    // Line offset = 10 (0-indexed count of lines before content)
    expect(scripts[0].lineOffset).toBe(10);
  });

  it('extracts form action as import', () => {
    const source = '<form action="/submit" method="post"></form>';
    const links = extractHtmlLinks(source, 'form.html');
    expect(links.some(l => l.modulePath === '/submit')).toBe(true);
  });

  it('extracts anchor href as import', () => {
    const source = '<a href="/page">Link</a>';
    const links = extractHtmlLinks(source, 'links.html');
    expect(links.some(l => l.modulePath === '/page')).toBe(true);
  });

  it('extracts img src as import', () => {
    const source = '<img src="logo.png" alt="Logo">';
    const links = extractHtmlLinks(source, 'img.html');
    expect(links.some(l => l.modulePath === 'logo.png')).toBe(true);
  });

  it('skips anchor fragments and javascript: URLs', () => {
    const source = '<a href="#section">Jump</a><a href="javascript:void(0)">Click</a>';
    const links = extractHtmlLinks(source, 'skip.html');
    expect(links.length).toBe(0);
  });

  it('extracts link icon href as import', () => {
    const source = '<link rel="icon" href="/favicon.ico">';
    const links = extractHtmlLinks(source, 'icon.html');
    expect(links.some(l => l.modulePath === '/favicon.ico')).toBe(true);
  });
});

describe('CSS extractor', () => {
  it('extracts @import statements', async () => {
    const source = readFileSync(join(FIXTURES, 'html-project', 'css', 'main.css'), 'utf-8');
    const parser = await getParser(cssSpec.wasmName);
    const lang = await loadLanguage(cssSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, cssSpec, 'css/main.css');

    expect(result.imports.length).toBeGreaterThanOrEqual(1);
    // @import source includes quotes from tree-sitter-css string_value
    const importPaths = result.imports.map(i => i.modulePath);
    expect(importPaths.some(p => p.includes('reset.css'))).toBe(true);
  });

  it('extracts CSS custom properties as variables', async () => {
    const source = readFileSync(join(FIXTURES, 'html-project', 'css', 'main.css'), 'utf-8');
    const parser = await getParser(cssSpec.wasmName);
    const lang = await loadLanguage(cssSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, cssSpec, 'css/main.css');

    const varNames = result.symbols.filter(s => s.kind === 'variable').map(s => s.name);
    expect(varNames).toContain('--primary-color');
    expect(varNames).toContain('--font-size-base');
  });

  it('resolves relative CSS imports', () => {
    const resolved = cssSpec.resolveImport(
      '"./reset.css"',
      'css/main.css',
      join(FIXTURES, 'html-project'),
      {},
    );
    expect(resolved).toBe('css/reset.css');
  });

  it('extracts CSS class selectors as variables', async () => {
    const source = '.container { color: red; }\n.sidebar { width: 200px; }';
    const parser = await getParser(cssSpec.wasmName);
    const lang = await loadLanguage(cssSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, cssSpec, 'test.css');

    const varNames = result.symbols.filter(s => s.kind === 'variable').map(s => s.name);
    expect(varNames).toContain('container');
    expect(varNames).toContain('sidebar');
  });

  it('extracts CSS id selectors as variables', async () => {
    const source = '#main-header { font-size: 20px; }';
    const parser = await getParser(cssSpec.wasmName);
    const lang = await loadLanguage(cssSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, cssSpec, 'test.css');

    const varNames = result.symbols.filter(s => s.kind === 'variable').map(s => s.name);
    expect(varNames).toContain('main-header');
  });

  it('extracts CSS keyframe names as variables', async () => {
    const source = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }';
    const parser = await getParser(cssSpec.wasmName);
    const lang = await loadLanguage(cssSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, cssSpec, 'test.css');

    const varNames = result.symbols.filter(s => s.kind === 'variable').map(s => s.name);
    expect(varNames).toContain('fadeIn');
  });
});

describe('HTML resolveImport', () => {
  it('resolves relative JS paths', () => {
    const resolved = htmlSpec.resolveImport(
      './js/utils.js',
      'index.html',
      join(FIXTURES, 'html-project'),
      {},
    );
    expect(resolved).toBe('js/utils.js');
  });

  it('resolves relative CSS paths', () => {
    const resolved = htmlSpec.resolveImport(
      './css/main.css',
      'index.html',
      join(FIXTURES, 'html-project'),
      {},
    );
    expect(resolved).toBe('css/main.css');
  });

  it('returns null for external URLs', () => {
    const resolved = htmlSpec.resolveImport(
      'https://cdn.example.com/lib.js',
      'index.html',
      join(FIXTURES, 'html-project'),
      {},
    );
    expect(resolved).toBeNull();
  });
});
