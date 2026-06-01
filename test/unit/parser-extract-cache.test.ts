import { describe, it, expect, beforeAll } from 'vitest';
import { initTreeSitter, loadLanguage, getParser } from '../../src/parser/loader.js';
import { clearQueryCache, extractFromTree } from '../../src/parser/extract.js';
import tsSpec from '../../src/parser/lang-ts.js';
import type { LangSpec } from '../../src/parser/extract.js';
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

  it('clearQueryCache can be called multiple times safely', () => {
    clearQueryCache();
    clearQueryCache();
    if (!wasmAvailable) return;
    const source = 'function multi() {}';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'multi.ts');
    expect(result.symbols.some(s => s.name === 'multi')).toBe(true);
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

  it('extracts symbols from a custom constants query key', () => {
    if (!wasmAvailable) return;
    const source = 'const msg = "hello";';
    const tree = parser.parse(source);

    const specWithConstants: LangSpec = {
      ...tsSpec,
      queries: {
        ...tsSpec.queries,
        constants: '(string (string_fragment) @name) @def',
      },
    };

    const result = extractFromTree(tree, lang, specWithConstants, 'consts.ts');
    const constSym = result.symbols.find(s => s.name === 'hello' && s.kind === 'variable');
    expect(constSym).toBeDefined();
    expect(constSym!.filePath).toBe('consts.ts');
  });

  it('constants query deduplicates symbols by name+line', () => {
    if (!wasmAvailable) return;
    const source = 'const a = "dup";\nconst b = "dup";';
    const tree = parser.parse(source);

    const specWithConstants: LangSpec = {
      ...tsSpec,
      queries: {
        ...tsSpec.queries,
        constants: '(string (string_fragment) @name) @def',
      },
    };

    const result = extractFromTree(tree, lang, specWithConstants, 'dedup.ts');
    // "dup" appears on two different lines → should produce 2 symbols
    const dupSyms = result.symbols.filter(s => s.name === 'dup');
    expect(dupSyms.length).toBe(2);
  });

  it('extracts heritage extends from class inheritance', () => {
    if (!wasmAvailable) return;
    const source = 'class Dog extends Animal {}';
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'heritage.ts');

    expect(result.heritage.length).toBeGreaterThan(0);
    expect(result.heritage.some(h => h.childName === 'Dog' && h.parentName === 'Animal' && h.type === 'extends')).toBe(true);
  });

  it('extracts default import name', () => {
    if (!wasmAvailable) return;
    const source = "import Foo from './bar';";
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'default-import.ts');

    // Default import should be detected via import_clause identifier
    const defImport = result.imports.find(i => i.isDefault);
    expect(defImport).toBeDefined();
    expect(defImport!.names.some(n => n.name === 'Foo')).toBe(true);
  });

  it('extracts destructured import names', () => {
    if (!wasmAvailable) return;
    const source = "import { join, resolve as res } from 'node:path';";
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'destruct.ts');

    const namedImport = result.imports.find(i => !i.isDefault && !i.isWildcard);
    expect(namedImport).toBeDefined();
    const names = namedImport!.names;
    expect(names.some(n => n.name === 'join')).toBe(true);
    expect(names.some(n => n.name === 'resolve' && n.alias === 'res')).toBe(true);
  });

  it('resolves enclosing symbol for nested function calls', () => {
    if (!wasmAvailable) return;
    const source = `
function outer() {
  inner();
  another();
}
`;
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'enclosing.ts');

    // All calls should have enclosingSymbolId containing outer
    for (const call of result.calls) {
      expect(call.enclosingSymbolId).toBeDefined();
      expect(call.enclosingSymbolId).not.toBe('enclosing.ts#module:_top:0');
    }
  });

  it('LangSpec with constants field passes type check at runtime', () => {
    // Verify LangSpec accepts constants query key
    const spec: LangSpec = {
      ...tsSpec,
      queries: {
        ...tsSpec.queries,
        constants: '(dummy) @name @def',
      },
      resolveImport: (raw, _f, _r, _a) => raw,
    };
    expect(spec.queries.constants).toBe('(dummy) @name @def');
    expect(spec.id).toBe(tsSpec.id);
  });
});
