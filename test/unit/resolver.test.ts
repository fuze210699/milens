import { describe, it, expect } from 'vitest';
import { resolveLinks } from '../../src/analyzer/resolver.js';
import type { CodeSymbol, RawImport, RawCall, RawHeritage } from '../../src/types.js';

describe('Resolver', () => {
  const modelSymbols: CodeSymbol[] = [
    { id: 'models.ts#function:createUser:10', name: 'createUser', kind: 'function', filePath: 'models.ts', startLine: 10, endLine: 12, exported: true },
    { id: 'models.ts#interface:User:1', name: 'User', kind: 'interface', filePath: 'models.ts', startLine: 1, endLine: 5, exported: true },
  ];

  const authSymbols: CodeSymbol[] = [
    { id: 'auth.ts#class:AuthService:3', name: 'AuthService', kind: 'class', filePath: 'auth.ts', startLine: 3, endLine: 20, exported: true },
    { id: 'auth.ts#method:register:5', name: 'register', kind: 'method', filePath: 'auth.ts', startLine: 5, endLine: 10, exported: false, parentId: 'auth.ts#class:AuthService:3' },
  ];

  const allSymbols = [...modelSymbols, ...authSymbols];
  const symbolsByFile = new Map([
    ['models.ts', modelSymbols],
    ['auth.ts', authSymbols],
  ]);

  it('resolves import links', () => {
    const imports: RawImport[] = [{
      filePath: 'auth.ts',
      modulePath: './models',
      names: [{ name: 'createUser' }],
      isDefault: false,
      isWildcard: false,
      line: 1,
    }];

    const links = resolveLinks({
      symbolsByFile,
      allSymbols,
      imports,
      calls: [],
      heritage: [],
      resolvedImportPaths: new Map([['auth.ts::./models', 'models.ts']]),
    });

    const importLinks = links.filter(l => l.type === 'imports');
    expect(importLinks.length).toBeGreaterThan(0);
  });

  it('resolves call links', () => {
    const calls: RawCall[] = [{
      filePath: 'auth.ts',
      enclosingSymbolId: 'auth.ts#method:register:5',
      calleeName: 'createUser',
      line: 7,
    }];

    const links = resolveLinks({
      symbolsByFile,
      allSymbols,
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const callLinks = links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(1);
    expect(callLinks[0].toId).toContain('createUser');
  });

  it('resolves containment links for methods', () => {
    const links = resolveLinks({
      symbolsByFile,
      allSymbols,
      imports: [],
      calls: [],
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const containsLinks = links.filter(l => l.type === 'contains');
    expect(containsLinks.length).toBe(1);
    expect(containsLinks[0].fromId).toContain('AuthService');
    expect(containsLinks[0].toId).toContain('register');
  });

  it('resolves heritage links', () => {
    const heritage: RawHeritage[] = [{
      filePath: 'auth.ts',
      childName: 'AuthService',
      parentName: 'User',
      type: 'extends',
      line: 3,
    }];

    const links = resolveLinks({
      symbolsByFile,
      allSymbols,
      imports: [],
      calls: [],
      heritage,
      resolvedImportPaths: new Map(),
    });

    const extendsLinks = links.filter(l => l.type === 'extends');
    expect(extendsLinks.length).toBe(1);
  });
});
