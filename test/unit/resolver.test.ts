import { describe, it, expect } from 'vitest';
import { resolveLinks, resolveLinksWithStats } from '../../src/analyzer/resolver.js';
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

  it('classifies external imports separately from unresolved', () => {
    const imports: RawImport[] = [
      {
        filePath: 'auth.ts',
        modulePath: '@modelcontextprotocol/sdk',
        names: [{ name: 'McpServer' }],
        isDefault: false,
        isWildcard: false,
        line: 1,
      },
      {
        filePath: 'auth.ts',
        modulePath: 'node:path',
        names: [{ name: 'resolve' }],
        isDefault: false,
        isWildcard: false,
        line: 2,
      },
      {
        filePath: 'auth.ts',
        modulePath: './missing-file',
        names: [{ name: 'Something' }],
        isDefault: false,
        isWildcard: false,
        line: 3,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile,
      allSymbols,
      imports,
      calls: [],
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    // @modelcontextprotocol/sdk and node:path → external (not relative paths)
    expect(result.externalImports).toBe(2);
    // ./missing-file → truly unresolved (relative path that didn't resolve)
    expect(result.unresolvedImports).toBe(1);
  });

  it('classifies calls to built-in globals as external', () => {
    const calls: RawCall[] = [
      {
        filePath: 'auth.ts',
        enclosingSymbolId: 'auth.ts#method:register:5',
        calleeName: 'log',
        receiver: 'console',
        line: 6,
      },
      {
        filePath: 'auth.ts',
        enclosingSymbolId: 'auth.ts#method:register:5',
        calleeName: 'stringify',
        receiver: 'JSON',
        line: 7,
      },
      {
        filePath: 'auth.ts',
        enclosingSymbolId: 'auth.ts#method:register:5',
        calleeName: 'unknownFunc',
        line: 8,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile,
      allSymbols,
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    // console.log and JSON.stringify → external (built-in globals)
    expect(result.externalCalls).toBe(2);
    // unknownFunc → truly unresolved
    expect(result.unresolvedCalls).toBe(1);
  });

  it('classifies calls to externally imported names as external', () => {
    const imports: RawImport[] = [
      {
        filePath: 'auth.ts',
        modulePath: 'better-sqlite3',
        names: [{ name: 'BetterSqlite3' }],
        isDefault: false,
        isWildcard: false,
        line: 1,
      },
    ];

    const calls: RawCall[] = [
      {
        filePath: 'auth.ts',
        enclosingSymbolId: 'auth.ts#method:register:5',
        calleeName: 'prepare',
        receiver: 'BetterSqlite3',
        line: 6,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile,
      allSymbols,
      imports,
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    // BetterSqlite3 was imported from external module → call to its method is external
    expect(result.externalCalls).toBe(1);
    expect(result.unresolvedCalls).toBe(0);
  });
});
