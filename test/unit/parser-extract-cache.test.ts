import { describe, it, expect, beforeAll } from 'vitest';
import { initTreeSitter, loadLanguage, getParser } from '../../src/parser/loader.js';
import { clearQueryCache, extractFromTree } from '../../src/parser/extract.js';
import tsSpec from '../../src/parser/lang-ts.js';
import type Parser from 'web-tree-sitter';

let wasmAvailable = false;
let lang: Parser.Language;
let parser: Parser;

beforeAll(async () => {
  try {
    await initTreeSitter();
    lang = await loadLanguage(tsSpec.wasmName);
    parser = await getParser(tsSpec.wasmName);
    wasmAvailable = true;
  } catch {
    wasmAvailable = false;
  }
});

describe('clearQueryCache', () => {
  it('does not throw when called', () => {
    expect(() => clearQueryCache()).not.toThrow();
  });

  it('extraction continues to work after clearing cache', () => {
    if (!wasmAvailable) return;
    const source = 'function hello() {}';
    const tree = parser.parse(source);

    clearQueryCache();

    const result = extractFromTree(tree, lang, tsSpec, 'test.ts');
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.symbols.some(s => s.name === 'hello')).toBe(true);
  });
});

describe('extractFromTree', () => {
  it('extracts a function from simple typescript source', () => {
    if (!wasmAvailable) return;
    const source = 'function greet() { return "hi"; }';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'greet.ts');

    expect(result.symbols.length).toBeGreaterThan(0);
    const func = result.symbols.find(s => s.name === 'greet');
    expect(func).toBeDefined();
    expect(func!.kind).toBe('function');
    expect(func!.filePath).toBe('greet.ts');
  });

  it('extracts a class with exported keyword', () => {
    if (!wasmAvailable) return;
    const source = 'export class Foo {}';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'foo.ts');

    const cls = result.symbols.find(s => s.name === 'Foo');
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe('class');
    expect(cls!.exported).toBe(true);
  });

  it('extracts an interface definition', () => {
    if (!wasmAvailable) return;
    const source = 'interface User { name: string; }';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'user.ts');

    const iface = result.symbols.find(s => s.name === 'User');
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe('interface');
  });

  it('returns an ExtractionResult with all expected arrays', () => {
    if (!wasmAvailable) return;
    const source = `
import { join } from 'node:path';
export function foo() { bar(); }
function bar() {}
`;
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'sample.ts');

    expect(Array.isArray(result.symbols)).toBe(true);
    expect(Array.isArray(result.imports)).toBe(true);
    expect(Array.isArray(result.calls)).toBe(true);
    expect(Array.isArray(result.heritage)).toBe(true);
    expect(Array.isArray(result.reExports)).toBe(true);
    expect(Array.isArray(result.typeBindings)).toBe(true);
    expect(Array.isArray(result.assignmentBindings)).toBe(true);
    expect(Array.isArray(result.returnTypes)).toBe(true);
    expect(Array.isArray(result.callResultBindings)).toBe(true);
    expect(result.exportedNames instanceof Set).toBe(true);
  });

  it('extracts imports from source', () => {
    if (!wasmAvailable) return;
    const source = 'import { join } from "node:path";';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'imports.ts');

    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.imports[0].modulePath).toBe('node:path');
    expect(result.imports[0].names.some(n => n.name === 'join')).toBe(true);
  });

  it('extracts function calls', () => {
    if (!wasmAvailable) return;
    const source = 'function foo() { bar(); }';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'calls.ts');

    expect(result.calls.some(c => c.calleeName === 'bar')).toBe(true);
  });

  it('creates unique id for each symbol', () => {
    if (!wasmAvailable) return;
    const source = `
function a() {}
function b() {}
`;
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'ids.ts');

    expect(result.symbols.length).toBe(2);
    expect(result.symbols[0].id).not.toBe(result.symbols[1].id);
    expect(result.symbols[0].id).toContain('ids.ts');
  });
});
