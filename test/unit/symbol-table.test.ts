import { describe, it, expect } from 'vitest';
import { SymbolTable } from '../../src/core/symbols/symbol-table.js';
import type { SymbolDef, ImportBinding } from '../../src/types/pipeline.js';

describe('SymbolTable', () => {
  function makeDef(overrides: Partial<SymbolDef> = {}): SymbolDef {
    return {
      nodeId: 'Function:src/a.ts:foo',
      name: 'foo',
      filePath: 'src/a.ts',
      label: 'Function',
      isExported: true,
      ...overrides,
    };
  }

  it('Tier 1: lookupExact — finds same-file symbol', () => {
    const st = new SymbolTable();
    const def = makeDef();
    st.add(def);

    const result = st.lookupExact('src/a.ts', 'foo');
    expect(result).toBeDefined();
    expect(result!.nodeId).toBe('Function:src/a.ts:foo');
  });

  it('Tier 1: lookupExact — returns null for wrong file', () => {
    const st = new SymbolTable();
    st.add(makeDef());

    const result = st.lookupExact('src/b.ts', 'foo');
    expect(result).toBeNull();
  });

  it('Tier 2: lookupImported — finds symbol via import map', () => {
    const st = new SymbolTable();
    st.add(makeDef({ name: 'bar', nodeId: 'Function:src/utils.ts:bar', filePath: 'src/utils.ts' }));

    const importMap = new Map<string, ImportBinding>([
      ['bar', { localName: 'bar', sourceName: 'bar', sourceFile: 'src/utils.ts', isNamespace: false }],
    ]);

    const result = st.lookupImported('src/a.ts', 'bar', importMap);
    expect(result).toBeDefined();
    expect(result!.filePath).toBe('src/utils.ts');
  });

  it('Tier 3: lookupGlobal — finds symbol globally', () => {
    const st = new SymbolTable();
    st.add(makeDef({ name: 'uniqueFunc', nodeId: 'Function:src/z.ts:uniqueFunc', filePath: 'src/z.ts' }));

    const results = st.lookupGlobal('uniqueFunc');
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/z.ts');
  });

  it('resolve — cascades through 3 tiers', () => {
    const st = new SymbolTable();
    st.add(makeDef({ name: 'localFn', nodeId: 'Function:src/a.ts:localFn', filePath: 'src/a.ts' }));
    st.add(makeDef({ name: 'importedFn', nodeId: 'Function:src/b.ts:importedFn', filePath: 'src/b.ts' }));
    st.add(makeDef({ name: 'globalFn', nodeId: 'Function:src/c.ts:globalFn', filePath: 'src/c.ts' }));

    const importMap = new Map<string, ImportBinding>([
      ['importedFn', { localName: 'importedFn', sourceName: 'importedFn', sourceFile: 'src/b.ts', isNamespace: false }],
    ]);

    // Tier 1
    const r1 = st.resolve('src/a.ts', 'localFn', importMap);
    expect(r1).toBeDefined();
    expect(r1!.confidence).toBe(0.95);

    // Tier 2
    const r2 = st.resolve('src/a.ts', 'importedFn', importMap);
    expect(r2).toBeDefined();
    expect(r2!.confidence).toBe(0.90);

    // Tier 3
    const r3 = st.resolve('src/a.ts', 'globalFn', importMap);
    expect(r3).toBeDefined();
    expect(r3!.confidence).toBe(0.50);

    // No match
    const r4 = st.resolve('src/a.ts', 'doesNotExist', importMap);
    expect(r4).toBeNull();
  });

  it('lookupMethodByOwner — finds class method', () => {
    const st = new SymbolTable();
    const methodDef = makeDef({
      name: 'authenticate',
      nodeId: 'Method:src/user.ts:UserService.authenticate',
      filePath: 'src/user.ts',
      label: 'Method',
    });
    st.addMethod('Class:src/user.ts:UserService', methodDef);

    const result = st.lookupMethodByOwner('Class:src/user.ts:UserService', 'authenticate');
    expect(result).toBeDefined();
    expect(result!.name).toBe('authenticate');
  });
});
