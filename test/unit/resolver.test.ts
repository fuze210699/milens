import { describe, it, expect } from 'vitest';
import { resolveLinks, resolveLinksWithStats } from '../../src/analyzer/resolver.js';
import type { CodeSymbol, RawImport, RawCall, RawHeritage, RawTypeBinding, RawAssignmentBinding, RawReturnType, RawCallResultBinding } from '../../src/types.js';

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

  // ── Bug 1: Scope-aware type bindings ──

  it('resolves type bindings per scope (same var name in different functions)', () => {
    // Two classes each with a "run" method — forces disambiguation
    const dbSymbols: CodeSymbol[] = [
      { id: 'db.ts#class:AuthDatabase:1', name: 'AuthDatabase', kind: 'class', filePath: 'db.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'db.ts#method:run:3', name: 'run', kind: 'method', filePath: 'db.ts', startLine: 3, endLine: 5, exported: false, parentId: 'db.ts#class:AuthDatabase:1' },
      { id: 'db.ts#class:RedisCache:12', name: 'RedisCache', kind: 'class', filePath: 'db.ts', startLine: 12, endLine: 20, exported: true },
      { id: 'db.ts#method:run:14', name: 'run', kind: 'method', filePath: 'db.ts', startLine: 14, endLine: 16, exported: false, parentId: 'db.ts#class:RedisCache:12' },
    ];
    const appSymbols: CodeSymbol[] = [
      { id: 'app.ts#function:setupAuth:1', name: 'setupAuth', kind: 'function', filePath: 'app.ts', startLine: 1, endLine: 5, exported: true },
      { id: 'app.ts#function:setupCache:7', name: 'setupCache', kind: 'function', filePath: 'app.ts', startLine: 7, endLine: 11, exported: true },
    ];
    const allSyms = [...dbSymbols, ...appSymbols];

    // Type bindings: same variable "db" in different scopes
    const typeBindings: RawTypeBinding[] = [
      { filePath: 'app.ts', variableName: 'db', typeName: 'AuthDatabase', line: 2, scope: 'app.ts#function:setupAuth:1' },
      { filePath: 'app.ts', variableName: 'db', typeName: 'RedisCache', line: 8, scope: 'app.ts#function:setupCache:7' },
    ];

    // Call db.run() inside setupAuth → should resolve to AuthDatabase.run (not RedisCache.run)
    const calls: RawCall[] = [
      {
        filePath: 'app.ts',
        enclosingSymbolId: 'app.ts#function:setupAuth:1',
        calleeName: 'run',
        receiver: 'db',
        line: 3,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['db.ts', dbSymbols], ['app.ts', appSymbols]]),
      allSymbols: allSyms,
      imports: [],
      calls,
      heritage: [],
      typeBindings,
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(1);
    // Should resolve to AuthDatabase.run (NOT RedisCache.run)
    expect(callLinks[0].toId).toBe('db.ts#method:run:3');
    expect(callLinks[0].confidence).toBe(0.93);
  });

  // ── Bug 3: Proximity threshold ──

  it('does not create links below confidence threshold (proximity fallback)', () => {
    // Two "process" functions in different unrelated files
    const symbols: CodeSymbol[] = [
      { id: 'caller.ts#function:main:1', name: 'main', kind: 'function', filePath: 'caller.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'far/a.ts#function:process:1', name: 'process', kind: 'function', filePath: 'far/a.ts', startLine: 1, endLine: 5, exported: true },
      { id: 'far/b.ts#function:process:1', name: 'process', kind: 'function', filePath: 'far/b.ts', startLine: 1, endLine: 5, exported: true },
    ];

    // Call to "process" from caller.ts — neither candidate is imported or in same dir
    const calls: RawCall[] = [
      {
        filePath: 'caller.ts',
        enclosingSymbolId: 'caller.ts#function:main:1',
        calleeName: 'process',
        line: 5,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([
        ['caller.ts', [symbols[0]]],
        ['far/a.ts', [symbols[1]]],
        ['far/b.ts', [symbols[2]]],
      ]),
      allSymbols: symbols,
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    // Both candidates in far/ dirs → proximity score 0.35 < threshold 0.5
    // Should NOT create a link — classify as unresolved instead
    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(0);
    expect(result.unresolvedCalls).toBe(1);
  });

  it('creates links when proximity score meets threshold (same directory)', () => {
    const symbols: CodeSymbol[] = [
      { id: 'src/caller.ts#function:main:1', name: 'main', kind: 'function', filePath: 'src/caller.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'src/helper.ts#function:process:1', name: 'process', kind: 'function', filePath: 'src/helper.ts', startLine: 1, endLine: 5, exported: true },
      { id: 'far/other.ts#function:process:1', name: 'process', kind: 'function', filePath: 'far/other.ts', startLine: 1, endLine: 5, exported: true },
    ];

    const calls: RawCall[] = [
      {
        filePath: 'src/caller.ts',
        enclosingSymbolId: 'src/caller.ts#function:main:1',
        calleeName: 'process',
        line: 5,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([
        ['src/caller.ts', [symbols[0]]],
        ['src/helper.ts', [symbols[1]]],
        ['far/other.ts', [symbols[2]]],
      ]),
      allSymbols: symbols,
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    // src/helper.ts is same dir → proximity score 0.60 >= threshold 0.5
    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(1);
    expect(callLinks[0].toId).toBe('src/helper.ts#function:process:1');
    expect(callLinks[0].confidence).toBe(0.60);
  });

  // ── Assignment chain propagation ──

  it('propagates type via assignment chain (const b = a)', () => {
    // Two classes each with "query" method — forces disambiguation
    const dbSymbols: CodeSymbol[] = [
      { id: 'db.ts#class:Database:1', name: 'Database', kind: 'class', filePath: 'db.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'db.ts#method:query:3', name: 'query', kind: 'method', filePath: 'db.ts', startLine: 3, endLine: 5, exported: false, parentId: 'db.ts#class:Database:1' },
      { id: 'db.ts#class:Cache:12', name: 'Cache', kind: 'class', filePath: 'db.ts', startLine: 12, endLine: 20, exported: true },
      { id: 'db.ts#method:query:14', name: 'query', kind: 'method', filePath: 'db.ts', startLine: 14, endLine: 16, exported: false, parentId: 'db.ts#class:Cache:12' },
    ];
    const appSymbols: CodeSymbol[] = [
      { id: 'app.ts#function:main:1', name: 'main', kind: 'function', filePath: 'app.ts', startLine: 1, endLine: 10, exported: true },
    ];
    const allSyms = [...dbSymbols, ...appSymbols];

    // Type binding: db: Database
    const typeBindings: RawTypeBinding[] = [
      { filePath: 'app.ts', variableName: 'db', typeName: 'Database', line: 2, scope: 'app.ts#function:main:1' },
    ];

    // Assignment chain: const conn = db
    const assignmentBindings: RawAssignmentBinding[] = [
      { filePath: 'app.ts', target: 'conn', source: 'db', line: 3, scope: 'app.ts#function:main:1' },
    ];

    // Call conn.query() → should resolve to Database.query via chain propagation
    const calls: RawCall[] = [
      {
        filePath: 'app.ts',
        enclosingSymbolId: 'app.ts#function:main:1',
        calleeName: 'query',
        receiver: 'conn',
        line: 4,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['db.ts', dbSymbols], ['app.ts', appSymbols]]),
      allSymbols: allSyms,
      imports: [],
      calls,
      heritage: [],
      typeBindings,
      assignmentBindings,
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(1);
    expect(callLinks[0].toId).toBe('db.ts#method:query:3');
    expect(callLinks[0].confidence).toBe(0.93);
  });

  // ── Call-result type binding ──

  it('binds variable to function return type (const user = getUser())', () => {
    // Two classes each with "save" method — forces disambiguation
    const serviceSymbols: CodeSymbol[] = [
      { id: 'service.ts#class:UserService:1', name: 'UserService', kind: 'class', filePath: 'service.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'service.ts#method:save:3', name: 'save', kind: 'method', filePath: 'service.ts', startLine: 3, endLine: 5, exported: false, parentId: 'service.ts#class:UserService:1' },
      { id: 'service.ts#class:OrderService:12', name: 'OrderService', kind: 'class', filePath: 'service.ts', startLine: 12, endLine: 20, exported: true },
      { id: 'service.ts#method:save:14', name: 'save', kind: 'method', filePath: 'service.ts', startLine: 14, endLine: 16, exported: false, parentId: 'service.ts#class:OrderService:12' },
    ];
    // Function with return type annotation
    const factorySymbols: CodeSymbol[] = [
      { id: 'factory.ts#function:createService:1', name: 'createService', kind: 'function', filePath: 'factory.ts', startLine: 1, endLine: 5, exported: true },
    ];
    const appSymbols: CodeSymbol[] = [
      { id: 'app.ts#function:main:1', name: 'main', kind: 'function', filePath: 'app.ts', startLine: 1, endLine: 10, exported: true },
    ];
    const allSyms = [...serviceSymbols, ...factorySymbols, ...appSymbols];

    // Return type: createService returns UserService
    const returnTypes: RawReturnType[] = [
      { filePath: 'factory.ts', functionName: 'createService', returnType: 'UserService', line: 1 },
    ];

    // Call result: const svc = createService()
    const callResultBindings: RawCallResultBinding[] = [
      { filePath: 'app.ts', target: 'svc', calleeName: 'createService', line: 3, scope: 'app.ts#function:main:1' },
    ];

    // Call svc.save() → should resolve to UserService.save via return type
    const calls: RawCall[] = [
      {
        filePath: 'app.ts',
        enclosingSymbolId: 'app.ts#function:main:1',
        calleeName: 'save',
        receiver: 'svc',
        line: 4,
      },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['service.ts', serviceSymbols], ['factory.ts', factorySymbols], ['app.ts', appSymbols]]),
      allSymbols: allSyms,
      imports: [],
      calls,
      heritage: [],
      returnTypes,
      callResultBindings,
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(1);
    expect(callLinks[0].toId).toBe('service.ts#method:save:3');
    expect(callLinks[0].confidence).toBe(0.93);
  });
});
