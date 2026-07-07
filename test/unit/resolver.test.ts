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
    // 1 scope-resolved call + 2 type annotation refs (AuthDatabase, RedisCache)
    expect(callLinks.length).toBe(3);
    // Should resolve to AuthDatabase.run (NOT RedisCache.run)
    const runLink = callLinks.find(l => l.toId === 'db.ts#method:run:3');
    expect(runLink).toBeDefined();
    expect(runLink!.confidence).toBe(0.93);
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
    // 1 chain-resolved call + 1 type annotation ref (Database)
    expect(callLinks.length).toBe(2);
    const queryLink = callLinks.find(l => l.toId === 'db.ts#method:query:3');
    expect(queryLink).toBeDefined();
    expect(queryLink!.confidence).toBe(0.93);
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
    // 1 return-type-resolved call + 1 return type annotation ref (UserService)
    expect(callLinks.length).toBe(2);
    const saveLink = callLinks.find(l => l.toId === 'service.ts#method:save:3');
    expect(saveLink).toBeDefined();
    expect(saveLink!.confidence).toBe(0.93);
  });

  // ── Type annotation reference links (prevents false dead-code) ──

  it('creates reference links from type annotations to type symbols', () => {
    const dtoSymbols: CodeSymbol[] = [
      { id: 'dto.ts#class:LoginDto:1', name: 'LoginDto', kind: 'class', filePath: 'dto.ts', startLine: 1, endLine: 5, exported: true },
    ];
    const controllerSymbols: CodeSymbol[] = [
      { id: 'ctrl.ts#class:AuthController:1', name: 'AuthController', kind: 'class', filePath: 'ctrl.ts', startLine: 1, endLine: 20, exported: true },
      { id: 'ctrl.ts#method:login:5', name: 'login', kind: 'method', filePath: 'ctrl.ts', startLine: 5, endLine: 10, exported: false, parentId: 'ctrl.ts#class:AuthController:1' },
    ];
    const allSyms = [...dtoSymbols, ...controllerSymbols];

    // Type binding: parameter dto: LoginDto inside login method
    const typeBindings: RawTypeBinding[] = [
      { filePath: 'ctrl.ts', variableName: 'dto', typeName: 'LoginDto', line: 6, scope: 'ctrl.ts#method:login:5' },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['dto.ts', dtoSymbols], ['ctrl.ts', controllerSymbols]]),
      allSymbols: allSyms,
      imports: [],
      calls: [],
      heritage: [],
      typeBindings,
      resolvedImportPaths: new Map(),
    });

    // Should create a reference link from login method → LoginDto
    const refLinks = result.links.filter(l => l.toId === 'dto.ts#class:LoginDto:1' && l.type === 'calls');
    expect(refLinks.length).toBe(1);
    expect(refLinks[0].confidence).toBe(0.7);
  });

  it('creates reference links from return type annotations to type symbols', () => {
    const modelSyms: CodeSymbol[] = [
      { id: 'model.ts#interface:User:1', name: 'User', kind: 'interface', filePath: 'model.ts', startLine: 1, endLine: 5, exported: true },
    ];
    const serviceSyms: CodeSymbol[] = [
      { id: 'svc.ts#class:UserService:1', name: 'UserService', kind: 'class', filePath: 'svc.ts', startLine: 1, endLine: 20, exported: true },
      { id: 'svc.ts#method:getUser:5', name: 'getUser', kind: 'method', filePath: 'svc.ts', startLine: 5, endLine: 10, exported: false, parentId: 'svc.ts#class:UserService:1' },
    ];
    const allSyms = [...modelSyms, ...serviceSyms];

    // Return type: getUser(): User
    const returnTypes: RawReturnType[] = [
      { filePath: 'svc.ts', functionName: 'getUser', returnType: 'User', line: 5, parentName: 'UserService' },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['model.ts', modelSyms], ['svc.ts', serviceSyms]]),
      allSymbols: allSyms,
      imports: [],
      calls: [],
      heritage: [],
      returnTypes,
      resolvedImportPaths: new Map(),
    });

    // Should create a reference link from getUser → User
    const refLinks = result.links.filter(l => l.toId === 'model.ts#interface:User:1' && l.type === 'calls');
    expect(refLinks.length).toBe(1);
    expect(refLinks[0].fromId).toBe('svc.ts#method:getUser:5');
    expect(refLinks[0].confidence).toBe(0.7);
  });

  it('does not create type ref links for external module types', () => {
    const controllerSymbols: CodeSymbol[] = [
      { id: 'ctrl.ts#class:MyCtrl:1', name: 'MyCtrl', kind: 'class', filePath: 'ctrl.ts', startLine: 1, endLine: 20, exported: true },
      { id: 'ctrl.ts#method:handle:5', name: 'handle', kind: 'method', filePath: 'ctrl.ts', startLine: 5, endLine: 10, exported: false, parentId: 'ctrl.ts#class:MyCtrl:1' },
    ];

    // Import Response from external module (express)
    const imports: RawImport[] = [
      { filePath: 'ctrl.ts', modulePath: 'express', names: [{ name: 'Response' }], isDefault: false, isWildcard: false, line: 1 },
    ];

    // Type binding: res: Response (from express, external)
    const typeBindings: RawTypeBinding[] = [
      { filePath: 'ctrl.ts', variableName: 'res', typeName: 'Response', line: 6, scope: 'ctrl.ts#method:handle:5' },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['ctrl.ts', controllerSymbols]]),
      allSymbols: controllerSymbols,
      imports,
      calls: [],
      heritage: [],
      typeBindings,
      resolvedImportPaths: new Map(),
    });

    // Should NOT create a link for Response (external type)
    const refLinks = result.links.filter(l => l.type === 'calls');
    expect(refLinks.length).toBe(0);
  });

  // ── Re-export barrel links ──

  it('creates import links from barrel re-exports to source symbols', () => {
    const sourceSymbols: CodeSymbol[] = [
      { id: 'impl.ts#class:UserService:1', name: 'UserService', kind: 'class', filePath: 'impl.ts', startLine: 1, endLine: 10, exported: true },
      { id: 'impl.ts#function:createUser:12', name: 'createUser', kind: 'function', filePath: 'impl.ts', startLine: 12, endLine: 15, exported: true },
    ];
    const barrelSymbols: CodeSymbol[] = [];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['impl.ts', sourceSymbols], ['index.ts', barrelSymbols]]),
      allSymbols: [...sourceSymbols, ...barrelSymbols],
      imports: [],
      calls: [],
      heritage: [],
      reExports: [
        { filePath: 'index.ts', modulePath: './impl', names: ['UserService', 'createUser'], line: 1 },
      ],
      resolvedImportPaths: new Map([['index.ts::./impl', 'impl.ts']]),
    });

    // Barrel should create import links to both source symbols
    const importLinks = result.links.filter(l => l.type === 'imports');
    expect(importLinks.length).toBe(2);
    expect(importLinks.some(l => l.toId === 'impl.ts#class:UserService:1')).toBe(true);
    expect(importLinks.some(l => l.toId === 'impl.ts#function:createUser:12')).toBe(true);
  });

  it('creates import links from wildcard barrel re-exports to all exported symbols', () => {
    const sourceSymbols: CodeSymbol[] = [
      { id: 'models.ts#interface:User:1', name: 'User', kind: 'interface', filePath: 'models.ts', startLine: 1, endLine: 5, exported: true },
      { id: 'models.ts#type:UserRole:7', name: 'UserRole', kind: 'type', filePath: 'models.ts', startLine: 7, endLine: 7, exported: true },
      { id: 'models.ts#function:internal:10', name: 'internal', kind: 'function', filePath: 'models.ts', startLine: 10, endLine: 12, exported: false },
    ];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['models.ts', sourceSymbols], ['index.ts', []]]),
      allSymbols: sourceSymbols,
      imports: [],
      calls: [],
      heritage: [],
      reExports: [
        { filePath: 'index.ts', modulePath: './models', names: [], line: 1 },
      ],
      resolvedImportPaths: new Map([['index.ts::./models', 'models.ts']]),
    });

    // Should link to 2 exported symbols, not the internal one
    const importLinks = result.links.filter(l => l.type === 'imports');
    expect(importLinks.length).toBe(2);
    expect(importLinks.some(l => l.toId === 'models.ts#interface:User:1')).toBe(true);
    expect(importLinks.some(l => l.toId === 'models.ts#type:UserRole:7')).toBe(true);
  });

  it('resolves destructured dynamic import links', () => {
    const callerSymbols: CodeSymbol[] = [
      { id: 'caller.ts#function:main:10', name: 'main', kind: 'function', filePath: 'caller.ts', startLine: 10, endLine: 15, exported: true },
      { id: 'caller.ts#module:_top:0', name: '_top', kind: 'module', filePath: 'caller.ts', startLine: 0, endLine: 20, exported: true },
    ];
    const targetSymbols: CodeSymbol[] = [
      { id: 'foo.ts#function:foo:1', name: 'foo', kind: 'function', filePath: 'foo.ts', startLine: 1, endLine: 3, exported: true },
      { id: 'foo.ts#function:bar:5', name: 'bar', kind: 'function', filePath: 'foo.ts', startLine: 5, endLine: 7, exported: true },
      { id: 'foo.ts#module:_top:0', name: '_top', kind: 'module', filePath: 'foo.ts', startLine: 0, endLine: 10, exported: true },
    ];

    const imports: RawImport[] = [{
      filePath: 'caller.ts',
      modulePath: './foo',
      names: [{ name: 'foo' }],
      isDefault: false,
      isWildcard: false,
      isDynamic: true,
      line: 1,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['caller.ts', callerSymbols], ['foo.ts', targetSymbols]]),
      allSymbols: [...callerSymbols, ...targetSymbols],
      imports,
      calls: [],
      heritage: [],
      resolvedImportPaths: new Map([['caller.ts::./foo', 'foo.ts']]),
    });

    const importLinks = result.links.filter(l => l.type === 'imports');
    // Should create one import link: caller.ts → foo
    expect(importLinks.length).toBe(1);
    expect(importLinks[0].toId).toBe('foo.ts#function:foo:1');
    expect(importLinks[0].fromId).toBe('caller.ts#module:_top:0');
  });

  it('resolves namespace-style dynamic import as wildcard', () => {
    const callerSymbols: CodeSymbol[] = [
      { id: 'caller.ts#module:_top:0', name: '_top', kind: 'module', filePath: 'caller.ts', startLine: 0, endLine: 20, exported: true },
    ];
    const targetSymbols: CodeSymbol[] = [
      { id: 'lib.ts#function:foo:1', name: 'foo', kind: 'function', filePath: 'lib.ts', startLine: 1, endLine: 3, exported: true },
      { id: 'lib.ts#function:bar:5', name: 'bar', kind: 'function', filePath: 'lib.ts', startLine: 5, endLine: 7, exported: true },
    ];

    const imports: RawImport[] = [{
      filePath: 'caller.ts',
      modulePath: './lib',
      names: [],
      isDefault: false,
      isWildcard: true,
      isDynamic: true,
      line: 1,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['caller.ts', callerSymbols], ['lib.ts', targetSymbols]]),
      allSymbols: [...callerSymbols, ...targetSymbols],
      imports,
      calls: [],
      heritage: [],
      resolvedImportPaths: new Map([['caller.ts::./lib', 'lib.ts']]),
    });

    const importLinks = result.links.filter(l => l.type === 'imports');
    expect(importLinks.length).toBe(targetSymbols.filter(s => s.exported && s.kind !== 'module').length);
  });

  it('does not link receiver calls to unrelated same-name symbols', () => {
    const fileASymbols: CodeSymbol[] = [
      { id: 'a.ts#function:exec:1', name: 'exec', kind: 'function', filePath: 'a.ts', startLine: 1, endLine: 3, exported: true },
    ];
    const fileBSymbols: CodeSymbol[] = [
      { id: 'b.ts#function:exec:1', name: 'exec', kind: 'function', filePath: 'b.ts', startLine: 1, endLine: 3, exported: true },
    ];
    const callerSymbols: CodeSymbol[] = [
      { id: 'caller.ts#method:scan:5', name: 'scan', kind: 'function', filePath: 'caller.ts', startLine: 5, endLine: 10, exported: false },
    ];

    const calls: RawCall[] = [{
      filePath: 'caller.ts',
      enclosingSymbolId: 'caller.ts#method:scan:5',
      calleeName: 'exec',
      receiver: 'pattern',
      line: 7,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['a.ts', fileASymbols], ['b.ts', fileBSymbols], ['caller.ts', callerSymbols]]),
      allSymbols: [...fileASymbols, ...fileBSymbols, ...callerSymbols],
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(0);
    expect(result.unresolvedCalls).toBe(1);
  });

  it('does not link external imports to unrelated same-name project symbols', () => {
    const projectSymbols: CodeSymbol[] = [
      { id: 'src/engine.ts#method:resolve:61', name: 'resolve', kind: 'method', filePath: 'src/engine.ts', startLine: 61, endLine: 63, exported: true },
    ];
    const callerSymbols: CodeSymbol[] = [
      { id: 'caller.ts#function:doStuff:10', name: 'doStuff', kind: 'function', filePath: 'caller.ts', startLine: 10, endLine: 20, exported: false },
    ];

    const imports: RawImport[] = [{
      filePath: 'caller.ts',
      modulePath: 'node:path',
      names: [{ name: 'resolve' }],
      isDefault: false,
      isWildcard: false,
      line: 1,
    }];

    const calls: RawCall[] = [{
      filePath: 'caller.ts',
      enclosingSymbolId: 'caller.ts#function:doStuff:10',
      calleeName: 'resolve',
      line: 12,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['src/engine.ts', projectSymbols], ['caller.ts', callerSymbols]]),
      allSymbols: [...projectSymbols, ...callerSymbols],
      imports,
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(0);
    expect(result.externalCalls).toBe(1);
  });

  it('does not link Set.add() to unrelated project add functions', () => {
    const addFileA: CodeSymbol[] = [
      { id: 'math.ts#function:add:1', name: 'add', kind: 'function', filePath: 'math.ts', startLine: 1, endLine: 3, exported: true },
    ];
    const addFileB: CodeSymbol[] = [
      { id: 'calc.ts#method:add:5', name: 'add', kind: 'method', filePath: 'calc.ts', startLine: 5, endLine: 7, exported: true },
    ];
    const callerSymbols: CodeSymbol[] = [
      { id: 'main.ts#function:init:1', name: 'init', kind: 'function', filePath: 'main.ts', startLine: 1, endLine: 5, exported: false },
    ];

    const calls: RawCall[] = [{
      filePath: 'main.ts',
      enclosingSymbolId: 'main.ts#function:init:1',
      calleeName: 'add',
      receiver: 'mySet',
      line: 3,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['math.ts', addFileA], ['calc.ts', addFileB], ['main.ts', callerSymbols]]),
      allSymbols: [...addFileA, ...addFileB, ...callerSymbols],
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(0);
    expect(result.unresolvedCalls).toBe(1);
  });

  it('does not link a receiver call to a globally-unique same-name project symbol (fast-path gap)', () => {
    // Regression for the gap the earlier `add`/`resolve`/`exec` tests didn't cover:
    // those all used 2+ candidates across files, which routes through the
    // receiver-aware-narrowing branch. Here `exec` matches exactly ONE project
    // symbol, so it must not take the "unique name globally" fast path just
    // because it's a receiver call (e.g. `pattern.exec(content)` — RegExp.prototype.exec).
    const uniqueExecFile: CodeSymbol[] = [
      { id: 'scripts/create-pr.cjs#function:exec:56', name: 'exec', kind: 'function', filePath: 'scripts/create-pr.cjs', startLine: 56, endLine: 60, exported: true },
    ];
    const callerSymbols: CodeSymbol[] = [
      { id: 'security.ts#function:scan:9', name: 'scan', kind: 'function', filePath: 'security.ts', startLine: 9, endLine: 90, exported: true },
    ];

    const calls: RawCall[] = [{
      filePath: 'security.ts',
      enclosingSymbolId: 'security.ts#function:scan:9',
      calleeName: 'exec',
      receiver: 'pattern',
      line: 92,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['scripts/create-pr.cjs', uniqueExecFile], ['security.ts', callerSymbols]]),
      allSymbols: [...uniqueExecFile, ...callerSymbols],
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(0);
    expect(result.unresolvedCalls).toBe(1);
  });

  it('does not link a bare argument-position identifier to an unrelated globally-unique symbol', () => {
    // Regression for `resolve(root, file)` / `pattern.exec(content)`-shaped false edges:
    // `root` here is a plain local variable passed as an argument, not a call — it must
    // not be linked just because it happens to be the only symbol named "root" in the repo.
    const unrelatedRootFile: CodeSymbol[] = [
      { id: 'scripts/update-docs.js#variable:root:14', name: 'root', kind: 'variable', filePath: 'scripts/update-docs.js', startLine: 14, endLine: 14, exported: true },
    ];
    const callerSymbols: CodeSymbol[] = [
      { id: 'security.ts#function:scan:9', name: 'scan', kind: 'function', filePath: 'security.ts', startLine: 9, endLine: 90, exported: true },
    ];

    const calls: RawCall[] = [{
      filePath: 'security.ts',
      enclosingSymbolId: 'security.ts#function:scan:9',
      calleeName: 'root',
      line: 53,
      isArgumentRef: true,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['scripts/update-docs.js', unrelatedRootFile], ['security.ts', callerSymbols]]),
      allSymbols: [...unrelatedRootFile, ...callerSymbols],
      imports: [],
      calls,
      heritage: [],
      resolvedImportPaths: new Map(),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(0);
    expect(result.unresolvedCalls).toBe(1);
  });

  it('still links an argument-position identifier when it is imported into the caller file', () => {
    // The legitimate case this pattern exists for: passing an imported handler/callback
    // reference, e.g. `onMounted(handleMount)` where `handleMount` was imported.
    const handlerFile: CodeSymbol[] = [
      { id: 'handlers.ts#function:handleMount:1', name: 'handleMount', kind: 'function', filePath: 'handlers.ts', startLine: 1, endLine: 3, exported: true },
    ];
    const callerSymbols: CodeSymbol[] = [
      { id: 'view.ts#function:setup:1', name: 'setup', kind: 'function', filePath: 'view.ts', startLine: 1, endLine: 10, exported: true },
    ];

    const imports: RawImport[] = [{
      filePath: 'view.ts',
      modulePath: './handlers',
      names: [{ name: 'handleMount' }],
      isDefault: false,
      isWildcard: false,
      line: 1,
    }];

    const calls: RawCall[] = [{
      filePath: 'view.ts',
      enclosingSymbolId: 'view.ts#function:setup:1',
      calleeName: 'handleMount',
      line: 3,
      isArgumentRef: true,
    }];

    const result = resolveLinksWithStats({
      symbolsByFile: new Map([['handlers.ts', handlerFile], ['view.ts', callerSymbols]]),
      allSymbols: [...handlerFile, ...callerSymbols],
      imports,
      calls,
      heritage: [],
      resolvedImportPaths: new Map([['view.ts::./handlers', 'handlers.ts']]),
    });

    const callLinks = result.links.filter(l => l.type === 'calls');
    expect(callLinks.length).toBe(1);
    expect(callLinks[0].toId).toBe('handlers.ts#function:handleMount:1');
  });
});
