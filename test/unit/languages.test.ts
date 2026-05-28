import { describe, it, expect } from 'vitest';
import { langForFile, supportedExtensions, ALL_LANGS } from '../../src/parser/languages.js';

describe('langForFile', () => {
  it('returns typescript for .ts files', () => {
    const result = langForFile('src/index.ts');
    expect(result).toBeDefined();
    expect(result!.id).toBe('typescript');
  });

  it('returns typescript for .tsx files', () => {
    const result = langForFile('Component.tsx');
    expect(result).toBeDefined();
    expect(result!.id).toBe('typescript');
  });

  it('returns javascript for .js files', () => {
    const result = langForFile('lib/utils.js');
    expect(result).toBeDefined();
    expect(result!.id).toBe('javascript');
  });

  it('returns javascript for .jsx files', () => {
    const result = langForFile('App.jsx');
    expect(result).toBeDefined();
    expect(result!.id).toBe('javascript');
  });

  it('returns python for .py files', () => {
    const result = langForFile('main.py');
    expect(result).toBeDefined();
    expect(result!.id).toBe('python');
  });

  it('returns java for .java files', () => {
    const result = langForFile('Main.java');
    expect(result).toBeDefined();
    expect(result!.id).toBe('java');
  });

  it('returns go for .go files', () => {
    const result = langForFile('main.go');
    expect(result).toBeDefined();
    expect(result!.id).toBe('go');
  });

  it('returns rust for .rs files', () => {
    const result = langForFile('lib.rs');
    expect(result).toBeDefined();
    expect(result!.id).toBe('rust');
  });

  it('returns php for .php files', () => {
    const result = langForFile('index.php');
    expect(result).toBeDefined();
    expect(result!.id).toBe('php');
  });

  it('returns ruby for .rb files', () => {
    const result = langForFile('app.rb');
    expect(result).toBeDefined();
    expect(result!.id).toBe('ruby');
  });

  it('returns vue for .vue files', () => {
    const result = langForFile('App.vue');
    expect(result).toBeDefined();
    expect(result!.id).toBe('vue');
  });

  it('returns html for .html files', () => {
    const result = langForFile('index.html');
    expect(result).toBeDefined();
    expect(result!.id).toBe('html');
  });

  it('returns css for .css files', () => {
    const result = langForFile('styles.css');
    expect(result).toBeDefined();
    expect(result!.id).toBe('css');
  });

  it('returns markdown for .md files', () => {
    const result = langForFile('README.md');
    expect(result).toBeDefined();
    expect(result!.id).toBe('markdown');
  });

  it('returns undefined for unknown .txt extension', () => {
    const result = langForFile('notes.txt');
    expect(result).toBeUndefined();
  });

  it('returns undefined for unknown .xml extension', () => {
    const result = langForFile('config.xml');
    expect(result).toBeUndefined();
  });

  it('returns undefined for unknown .xyz extension', () => {
    const result = langForFile('data.xyz');
    expect(result).toBeUndefined();
  });

  it('is case-insensitive for .TS extension', () => {
    const result = langForFile('test.TS');
    expect(result).toBeDefined();
    expect(result!.id).toBe('typescript');
  });

  it('is case-insensitive for .Ts extension', () => {
    const result = langForFile('test.Ts');
    expect(result).toBeDefined();
    expect(result!.id).toBe('typescript');
  });

  it('is case-insensitive for .JS extension', () => {
    const result = langForFile('test.JS');
    expect(result).toBeDefined();
    expect(result!.id).toBe('javascript');
  });
});

describe('supportedExtensions', () => {
  it('returns a non-empty array', () => {
    const exts = supportedExtensions();
    expect(Array.isArray(exts)).toBe(true);
    expect(exts.length).toBeGreaterThan(0);
  });

  it('includes known extensions', () => {
    const exts = supportedExtensions();
    expect(exts).toContain('.ts');
    expect(exts).toContain('.py');
    expect(exts).toContain('.go');
    expect(exts).toContain('.vue');
    expect(exts).toContain('.md');
  });
});

describe('ALL_LANGS', () => {
  it('has exactly 12 entries', () => {
    expect(ALL_LANGS).toHaveLength(12);
  });

  it('each entry has a unique id', () => {
    const ids = ALL_LANGS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each entry has a non-empty extensions array', () => {
    for (const lang of ALL_LANGS) {
      expect(lang.extensions.length).toBeGreaterThan(0);
    }
  });

  it('each entry has a wasmName property', () => {
    for (const lang of ALL_LANGS) {
      expect(typeof lang.wasmName).toBe('string');
    }
  });
});
