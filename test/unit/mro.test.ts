import { describe, it, expect } from 'vitest';
import { resolveLinksWithStats } from '../../src/analyzer/resolver.js';
import type { CodeSymbol, RawImport, RawCall, RawHeritage } from '../../src/types.js';

describe('MRO Resolution', () => {
  // Fixture: diamond inheritance
  // Base → method baseSave()
  // A extends Base → override save()
  // B extends Base
  // C extends A, B → should use A.save() (C3: C → A → B → Base)
  const baseSymbols: CodeSymbol[] = [
    { id: 'base.ts#class:Base:1', name: 'Base', kind: 'class', filePath: 'base.ts', startLine: 1, endLine: 5, exported: true },
    { id: 'base.ts#method:baseSave:3', name: 'baseSave', kind: 'method', filePath: 'base.ts', startLine: 3, endLine: 3, exported: false, parentId: 'base.ts#class:Base:1' },
  ];

  const aSymbols: CodeSymbol[] = [
    { id: 'a.ts#class:A:1', name: 'A', kind: 'class', filePath: 'a.ts', startLine: 1, endLine: 6, exported: true },
    { id: 'a.ts#method:save:3', name: 'save', kind: 'method', filePath: 'a.ts', startLine: 3, endLine: 3, exported: false, parentId: 'a.ts#class:A:1' },
  ];

  const bSymbols: CodeSymbol[] = [
    { id: 'b.ts#class:B:1', name: 'B', kind: 'class', filePath: 'b.ts', startLine: 1, endLine: 4, exported: true },
    { id: 'b.ts#method:save:3', name: 'save', kind: 'method', filePath: 'b.ts', startLine: 3, endLine: 3, exported: false, parentId: 'b.ts#class:B:1' },
  ];

  const cSymbols: CodeSymbol[] = [
    { id: 'c.ts#class:C:1', name: 'C', kind: 'class', filePath: 'c.ts', startLine: 1, endLine: 3, exported: true },
  ];

  const mainSymbols: CodeSymbol[] = [
    { id: 'main.ts#function:testMro:1', name: 'testMro', kind: 'function', filePath: 'main.ts', startLine: 1, endLine: 3, exported: false },
  ];

  const allSymbols = [...baseSymbols, ...aSymbols, ...bSymbols, ...cSymbols, ...mainSymbols];
  const symbolsByFile = new Map([
    ['base.ts', baseSymbols],
    ['a.ts', aSymbols],
    ['b.ts', bSymbols],
    ['c.ts', cSymbols],
    ['main.ts', mainSymbols],
  ]);

  it('resolves method using C3 order (diamond: C(A,B) → A.save not B.save)', () => {
    // Diamond: C extends A,B; A extends Base; B extends Base
    const heritage: RawHeritage[] = [
      { filePath: 'c.ts', childName: 'C', parentName: 'A', type: 'extends', line: 1 },
      { filePath: 'c.ts', childName: 'C', parentName: 'B', type: 'extends', line: 1 },
      { filePath: 'a.ts', childName: 'A', parentName: 'Base', type: 'extends', line: 1 },
      { filePath: 'b.ts', childName: 'B', parentName: 'Base', type: 'extends', line: 1 },
    ];

    // Create a variable `c` of type C, then call c.save()
    const typeBindings = [
      { filePath: 'main.ts', variableName: 'c', typeName: 'C', line: 1, scope: undefined },
    ];

    const calls: RawCall[] = [{
      filePath: 'main.ts',
      enclosingSymbolId: 'main.ts#function:testMro:1',
      calleeName: 'save',
      receiver: 'c',
      line: 2,
    }];

    const imports: RawImport[] = [
      { filePath: 'main.ts', modulePath: './c', names: [{ name: 'C' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'main.ts', modulePath: './a', names: [{ name: 'A' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'main.ts', modulePath: './b', names: [{ name: 'B' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'c.ts', modulePath: './a', names: [{ name: 'A' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'c.ts', modulePath: './b', names: [{ name: 'B' }], isDefault: false, isWildcard: false, line: 1 },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile,
      allSymbols,
      imports,
      calls,
      heritage,
      resolvedImportPaths: new Map([
        ['main.ts::./c', 'c.ts'],
        ['main.ts::./a', 'a.ts'],
        ['main.ts::./b', 'b.ts'],
        ['c.ts::./a', 'a.ts'],
        ['c.ts::./b', 'b.ts'],
      ]),
      typeBindings,
      perFileMroStrategy: new Map([
        ['main.ts', 'c3'],
        ['c.ts', 'c3'],
        ['a.ts', 'c3'],
        ['b.ts', 'c3'],
      ]),
    });

    // The call `c.save()` should resolve to A.save() (C3: C→A→B→Base)
    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBeGreaterThan(0);

    const saveLink = callLinks.find(l => l.toId.includes('method:save'));
    expect(saveLink).toBeDefined();

    // Should resolve to A.save(), not B.save()
    expect(saveLink!.toId).toContain('a.ts#method:save');
    expect(saveLink!.toId).not.toContain('b.ts#method:save');
    // Confidence should be high
    expect(saveLink!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('first-wins resolves first parent method', () => {
    const heritage: RawHeritage[] = [
      { filePath: 'c.ts', childName: 'C', parentName: 'B', type: 'extends', line: 1 },
      { filePath: 'c.ts', childName: 'C', parentName: 'A', type: 'extends', line: 1 },
      { filePath: 'a.ts', childName: 'A', parentName: 'Base', type: 'extends', line: 1 },
      { filePath: 'b.ts', childName: 'B', parentName: 'Base', type: 'extends', line: 1 },
    ];

    const typeBindings = [
      { filePath: 'main.ts', variableName: 'c', typeName: 'C', line: 1, scope: undefined },
    ];

    const calls: RawCall[] = [{
      filePath: 'main.ts',
      enclosingSymbolId: 'main.ts#function:testMro:1',
      calleeName: 'save',
      receiver: 'c',
      line: 2,
    }];

    const imports: RawImport[] = [
      { filePath: 'main.ts', modulePath: './c', names: [{ name: 'C' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'c.ts', modulePath: './a', names: [{ name: 'A' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'c.ts', modulePath: './b', names: [{ name: 'B' }], isDefault: false, isWildcard: false, line: 1 },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile,
      allSymbols,
      imports,
      calls,
      heritage,
      resolvedImportPaths: new Map([
        ['main.ts::./c', 'c.ts'],
        ['c.ts::./a', 'a.ts'],
        ['c.ts::./b', 'b.ts'],
      ]),
      typeBindings,
      perFileMroStrategy: new Map([
        ['main.ts', 'first-wins'],
        ['c.ts', 'first-wins'],
      ]),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    const saveLink = callLinks.find(l => l.toId.includes('method:save'));
    expect(saveLink).toBeDefined();

    // first-wins: B declared first as parent of C → B.save() wins
    expect(saveLink!.toId).toContain('b.ts#method:save');
  });

  it('none strategy ignores inheritance (only proximity fallback at 0.6)', () => {
    const heritage: RawHeritage[] = [
      { filePath: 'c.ts', childName: 'C', parentName: 'A', type: 'extends', line: 1 },
      { filePath: 'a.ts', childName: 'A', parentName: 'Base', type: 'extends', line: 1 },
    ];

    const typeBindings = [
      { filePath: 'main.ts', variableName: 'c', typeName: 'C', line: 1, scope: undefined },
    ];

    const calls: RawCall[] = [{
      filePath: 'main.ts',
      enclosingSymbolId: 'main.ts#function:testMro:1',
      calleeName: 'save',  // C has no save() method
      receiver: 'c',
      line: 2,
    }];

    const imports: RawImport[] = [
      { filePath: 'main.ts', modulePath: './c', names: [{ name: 'C' }], isDefault: false, isWildcard: false, line: 1 },
      { filePath: 'c.ts', modulePath: './a', names: [{ name: 'A' }], isDefault: false, isWildcard: false, line: 1 },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile,
      allSymbols,
      imports,
      calls,
      heritage,
      resolvedImportPaths: new Map([
        ['main.ts::./c', 'c.ts'],
        ['c.ts::./a', 'a.ts'],
      ]),
      typeBindings,
      perFileMroStrategy: new Map([
        ['main.ts', 'none'],
        ['c.ts', 'none'],
      ]),
    });

    // With 'none' strategy, NO MRO-based resolution (high confidence 0.93).
    // Proximity fallback may still return a link at low confidence (0.6).
    const callLinks = result.links.filter(l => l.type === 'calls');
    const saveLink = callLinks.find(l => l.toId.includes('method:save'));

    if (saveLink) {
      // Should only match via proximity (confidence ≤ 0.6), not via MRO (0.93)
      expect(saveLink.confidence).toBeLessThanOrEqual(0.6);
    }
    // Either no link or low-confidence link is acceptable for 'none' strategy
  });
});
