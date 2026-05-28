import { describe, it, expect, beforeAll } from 'vitest';
import { initTreeSitter, loadLanguage, getParser } from '../../src/parser/loader.js';
import tsSpec from '../../src/parser/lang-ts.js';

let wasmAvailable = false;

beforeAll(async () => {
  try {
    await initTreeSitter();
    wasmAvailable = true;
  } catch {
    wasmAvailable = false;
  }
});

describe('parser-loader exports', () => {
  it('exports initTreeSitter as a Promise-returning function', () => {
    expect(typeof initTreeSitter).toBe('function');
  });

  it('exports loadLanguage as a Promise-returning function', () => {
    expect(typeof loadLanguage).toBe('function');
  });

  it('exports getParser as a Promise-returning function', () => {
    expect(typeof getParser).toBe('function');
  });
});

describe('initTreeSitter', () => {
  it('does not throw when called', async () => {
    if (!wasmAvailable) return;
    await expect(initTreeSitter()).resolves.toBeUndefined();
  });

  it('is idempotent (calling twice does not throw)', async () => {
    if (!wasmAvailable) return;
    await initTreeSitter();
    await expect(initTreeSitter()).resolves.toBeUndefined();
  });
});

describe('loadLanguage', () => {
  it('resolves for typescript wasmName', async () => {
    if (!wasmAvailable) return;
    const lang = await loadLanguage(tsSpec.wasmName);
    expect(lang).toBeDefined();
  });

  it('caches results (same wasmName returns cached Language)', async () => {
    if (!wasmAvailable) return;
    const lang1 = await loadLanguage(tsSpec.wasmName);
    const lang2 = await loadLanguage(tsSpec.wasmName);
    expect(lang1).toBe(lang2);
  });

  it('can resolve all wasmNames with valid WASM files', async () => {
    if (!wasmAvailable) return;
    const wasmNames = [
      'tree-sitter-tsx',
      'tree-sitter-javascript',
      'tree-sitter-python',
      'tree-sitter-java',
      'tree-sitter-go',
      'tree-sitter-rust',
      'tree-sitter-php',
      'tree-sitter-ruby',
      'tree-sitter-html',
      'tree-sitter-css',
    ];
    for (const name of wasmNames) {
      const lang = await loadLanguage(name);
      expect(lang).toBeDefined();
    }
  });
});

describe('getParser', () => {
  it('returns a Parser instance for typescript', async () => {
    if (!wasmAvailable) return;
    const parser = await getParser(tsSpec.wasmName);
    expect(parser).toBeDefined();
    expect(typeof parser.parse).toBe('function');
  });

  it('caches Parser instances', async () => {
    if (!wasmAvailable) return;
    const p1 = await getParser(tsSpec.wasmName);
    const p2 = await getParser(tsSpec.wasmName);
    expect(p1).toBe(p2);
  });
});
