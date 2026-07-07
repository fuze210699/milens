import type { CodeSymbol, SymbolLink, RawImport, RawCall, RawHeritage, RawReExport, RawTypeBinding, RawAssignmentBinding, RawReturnType, RawCallResultBinding, LinkType } from '../types.js';
import type { ResolutionResult } from './resolver.js';
import type Parser from 'web-tree-sitter';
import { dirname } from 'node:path';

const MIN_LINK_CONFIDENCE = 0.5;

const BUILTIN_GLOBALS = new Set([
  'console', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Map', 'Set',
  'Promise', 'JSON', 'Date', 'Error', 'parseInt', 'parseFloat', 'isNaN',
  'Buffer', 'process', 'require', 'fetch', 'global', 'globalThis',
  'ref', 'reactive', 'computed', 'watch', 'onMounted', 'onUnmounted', 'h', 'createApp',
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer',
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'tuple', 'set', 'type',
  'fmt', 'log', 'panic', 'make', 'append', 'new', 'delete', 'close',
  'println', 'vec', 'format', 'assert',
  'System', 'var_dump', 'echo', 'isset', 'empty', 'count', 'strlen', 'substr',
]);

interface ScopeNode {
  id: string;
  filePath: string;
  parentScopeId: string | null;
  children: ScopeNode[];
  symbols: CodeSymbol[];          // declared in this scope
  visibleNames: Map<string, CodeSymbol[]>; // name → symbols visible (local + imports + ancestors)
  startLine: number;
  endLine: number;
}

interface ScopeResolverInput {
  symbolsByFile: Map<string, CodeSymbol[]>;
  allSymbols: CodeSymbol[];
  imports: RawImport[];
  calls: RawCall[];
  heritage: RawHeritage[];
  reExports?: RawReExport[];
  typeBindings?: RawTypeBinding[];
  assignmentBindings?: RawAssignmentBinding[];
  returnTypes?: RawReturnType[];
  callResultBindings?: RawCallResultBinding[];
  resolvedImportPaths: Map<string, string>;
  perFileImportSemantics?: Map<string, 'named' | 'wildcard-leaf' | 'wildcard-transitive' | 'namespace'>;
  perFileMroStrategy?: Map<string, 'first-wins' | 'c3' | 'ruby-mixin' | 'none'>;
  treeCache?: Map<string, Parser.Tree>; // Cross-phase tree cache from engine
}

export function resolveWithScopes(input: ScopeResolverInput): ResolutionResult {
  const t0 = Date.now();
  const links: SymbolLink[] = [];
  let unresolvedImports = 0;
  let unresolvedCalls = 0;
  let externalImports = 0;
  let externalCalls = 0;

  const symbolById = buildIdIndex(input.allSymbols);

  // Phase 1: Build scope graphs per file (AST-based preferred, symbol-based fallback)
  let t = Date.now();
  const scopeForest = input.treeCache
    ? buildScopeGraphFromAST(input.treeCache, input.symbolsByFile)
    : buildScopeGraph(input.symbolsByFile);
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Phase 1 (scope graph): ${scopeForest.size} scopes in ${Date.now() - t}ms`);

  // Phase 2: Resolve imports → add visible symbols to file scopes
  t = Date.now();
  const importedNamesPerFile = resolveImportsInScopes(input, scopeForest);
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Phase 2 (imports in scopes): ${importedNamesPerFile.size} files in ${Date.now() - t}ms`);

  // Phase 3: Build name index for call resolution
  t = Date.now();
  const symbolByName = buildNameIndex(input.allSymbols);
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Phase 3 (name index): ${symbolByName.size} names in ${Date.now() - t}ms`);

  // Phase 4: Collect visible symbols per scope (local + imports + ancestors)
  t = Date.now();
  collectVisibleSymbols(scopeForest, input.symbolsByFile, importedNamesPerFile, symbolById, input);
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Phase 4 (visible symbols): ${Date.now() - t}ms`);

  // F7: Track external imports per file to classify external vs unresolved calls
  t = Date.now();
  const externalNamesPerFile = new Map<string, Set<string>>();
  for (const imp of input.imports) {
    const key = `${imp.filePath}::${imp.modulePath}`;
    if (!input.resolvedImportPaths.has(key) && isExternalModule(imp.modulePath)) {
      let extNames = externalNamesPerFile.get(imp.filePath);
      if (!extNames) { extNames = new Set(); externalNamesPerFile.set(imp.filePath, extNames); }
      for (const { name } of imp.names) extNames.add(name);
    }
  }

  // Build direct imports per file for proximity scoring
  const directImportsPerFile = new Map<string, Set<string>>();
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) continue;
    let s = directImportsPerFile.get(imp.filePath);
    if (!s) { s = new Set(); directImportsPerFile.set(imp.filePath, s); }
    s.add(targetFile);
  }

  // Phase 5: Resolve calls via scope chain
  const totalCalls = input.calls.length;
  let callProgress = 0;
  for (const call of input.calls) {
    callProgress++;
    if (process.env.MILENS_DEBUG && callProgress % 5000 === 0) console.log(`[dual:perf] Phase 5 (calls): ${callProgress}/${totalCalls} (${Date.now() - t}ms)`);

    const scope = findScopeForCall(call, scopeForest, input.symbolsByFile);
    if (!scope) { unresolvedCalls++; continue; }

    // Walk scope chain to find callee
    let resolved = resolveCallInScope(call.calleeName, scope, scopeForest, symbolById);
    if (!resolved && call.receiver) {
      resolved = resolveReceiverCall(call, scope, scopeForest, symbolById, input, symbolByName);
    }

    // F1: Proximity fallback when scope chain exhausted
    if (!resolved) {
      const candidates = symbolByName.get(call.calleeName);
      if (candidates && candidates.length > 0) {
        resolved = scoreCandidates(call, candidates, directImportsPerFile);
      }
    }

    if (resolved && resolved.confidence >= MIN_LINK_CONFIDENCE) {
      links.push(makeLink(call.enclosingSymbolId, resolved.symbol.id, 'calls', resolved.confidence, call.line));
    } else {
      // F7: Classify as external or unresolved
      const extNames = externalNamesPerFile.get(call.filePath);
      if (BUILTIN_GLOBALS.has(call.calleeName) || extNames?.has(call.calleeName)) {
        externalCalls++;
      } else {
        unresolvedCalls++;
      }
    }
  }
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Phase 5 (calls done): ${totalCalls} calls in ${Date.now() - t}ms`);

  // Phase 6: Resolve imports (cross-file links)
  t = Date.now();
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) {
      if (isExternalModule(imp.modulePath)) {
        externalImports++;
      } else {
        unresolvedImports++;
      }
      continue;
    }
    const targetSymbols = input.symbolsByFile.get(targetFile);
    if (!targetSymbols) { unresolvedImports++; continue; }

    const fromId = `${imp.filePath}#module:_top:0`;
    for (const { name } of imp.names) {
      const target = targetSymbols.find(s => s.name === name && s.exported);
      if (target) {
        links.push(makeLink(fromId, target.id, 'imports', 0.95, imp.line));
      } else {
        unresolvedImports++;
      }
    }
  }
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Phase 6 (imports): ${input.imports.length} imports in ${Date.now() - t}ms`);

  // Phase 7: Heritage + containment
  t = Date.now();
  for (const sym of input.allSymbols) {
    if (sym.parentId) {
      links.push(makeLink(sym.parentId, sym.id, 'contains', 1.0));
    }
  }
  for (const h of input.heritage) {
    const children = symbolByName.get(h.childName);
    const parents = symbolByName.get(h.parentName);
    if (!children || !parents) continue;
    const child = children.find(s => s.filePath === h.filePath) ?? children[0];
    const parent = parents.find(s => s.filePath === h.filePath) ?? parents[0];
    if (child && parent) {
      links.push(makeLink(child.id, parent.id, h.type, 0.95, h.line));
    }
  }

  const result = { links: deduplicateLinks(links), unresolvedImports, unresolvedCalls, externalImports, externalCalls };
  if (process.env.MILENS_DEBUG) console.log(`[dual:perf] Total: ${Date.now() - t0}ms, ${result.links.length} links`);
  return result;
}

// ── Scope Graph from AST (tree-sitter) ──

// Node types that introduce a new scope
const SCOPE_NODE_TYPES = new Set([
  'program', 'module',
  'function_declaration', 'method_definition', 'arrow_function',
  'class_declaration', 'class', 'struct_item', 'trait_item', 'interface_declaration',
  'function_definition', 'function_item', 'method_declaration',
  'impl_item', 'module',
  'statement_block', 'block',
  'constructor_declaration',
]);

function buildScopeGraphFromAST(
  treeCache: Map<string, Parser.Tree>,
  symbolsByFile: Map<string, CodeSymbol[]>,
): Map<string, ScopeNode> {
  const allScopes = new Map<string, ScopeNode>();

  for (const [filePath, symbols] of symbolsByFile) {
    const tree = treeCache.get(filePath);
    if (!tree) {
      // Fallback: no cached tree → build from symbols
      const fallback = buildScopesFromSymbols(filePath, symbols, allScopes);
      if (fallback) allScopes.set(fallback.id, fallback);
      continue;
    }

    // Walk tree-sitter AST and extract scopes
    const symbolByLine = new Map<number, CodeSymbol[]>();
    for (const sym of symbols) {
      const arr = symbolByLine.get(sym.startLine) ?? [];
      arr.push(sym);
      symbolByLine.set(sym.startLine, arr);
    }

    const rootNode = tree.rootNode;
    const fileScopeId = `${filePath}#scope:file`;
    const fileScope: ScopeNode = {
      id: fileScopeId,
      filePath,
      parentScopeId: null,
      children: [],
      symbols: [],
      visibleNames: new Map(),
      startLine: 0,
      endLine: rootNode.endPosition.row + 1,
    };

    walkASTNode(rootNode, fileScope, filePath, symbols, allScopes, fileScopeId);
    allScopes.set(fileScopeId, fileScope);
  }

  return allScopes;
}

function walkASTNode(
  node: Parser.SyntaxNode,
  parentScope: ScopeNode,
  filePath: string,
  allSymbols: CodeSymbol[],
  allScopes: Map<string, ScopeNode>,
  _fileScopeId: string,
): void {
  const nodeType = node.type;

  // Check if this node creates a scope
  if (SCOPE_NODE_TYPES.has(nodeType) && nodeType !== 'program' && nodeType !== 'module') {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const scopeName = extractScopeName(node, nodeType);
    const scopeId = `${filePath}#scope:${scopeName}:${startLine}`;

    const scope: ScopeNode = {
      id: scopeId,
      filePath,
      parentScopeId: parentScope.id,
      children: [],
      symbols: [],
      visibleNames: new Map(),
      startLine,
      endLine,
    };

    // Assign symbols that fall within this scope's line range
    for (const sym of allSymbols) {
      if (sym.startLine >= startLine && sym.endLine <= endLine && sym.kind !== 'module') {
        // Only add if not already in a deeper scope
        if (!parentScope.symbols.includes(sym) || sym.kind === 'method') {
          scope.symbols.push(sym);
        }
      }
    }

    // Deduplicate: remove symbols from parent that belong to child scope
    parentScope.symbols = parentScope.symbols.filter(s =>
      !(s.startLine >= startLine && s.endLine <= endLine)
    );

    parentScope.children.push(scope);
    allScopes.set(scopeId, scope);

    // Walk children into the new scope
    const namedChildren = node.namedChildren;
    for (let i = 0; i < namedChildren.length; i++) {
      walkASTNode(namedChildren[i], scope, filePath, allSymbols, allScopes, _fileScopeId);
    }
  } else {
    // Not a scope node — walk children into same parent scope
    const namedChildren = node.namedChildren;
    for (let i = 0; i < namedChildren.length; i++) {
      walkASTNode(namedChildren[i], parentScope, filePath, allSymbols, allScopes, _fileScopeId);
    }
  }
}

function extractScopeName(node: Parser.SyntaxNode, nodeType: string): string {
  // Try to find a name child
  for (const child of node.namedChildren) {
    if (child.type === 'identifier' || child.type === 'property_identifier' || child.type === 'name' || child.type === 'type_identifier' || child.type === 'field_identifier') {
      return child.text;
    }
  }
  return nodeType.replace('_declaration', '').replace('_definition', '').replace('_item', '');
}

function buildScopesFromSymbols(
  filePath: string,
  symbols: CodeSymbol[],
  allScopes: Map<string, ScopeNode>,
): ScopeNode | null {
  // Simplified fallback from original buildScopeGraph
  const fileScopeId = `${filePath}#scope:file`;
  const fileScope: ScopeNode = {
    id: fileScopeId,
    filePath,
    parentScopeId: null,
    children: [],
    symbols: [],
    visibleNames: new Map(),
    startLine: 0,
    endLine: Infinity,
  };

  const containerSymbols = symbols.filter(s =>
    s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait' || s.kind === 'interface'
  );

  for (const container of containerSymbols) {
    const scopeId = `${filePath}#scope:${container.name}:${container.startLine}`;
    const scope: ScopeNode = {
      id: scopeId,
      filePath,
      parentScopeId: fileScopeId,
      children: [],
      symbols: [container],
      visibleNames: new Map(),
      startLine: container.startLine,
      endLine: container.endLine,
    };
    fileScope.children.push(scope);
    allScopes.set(scopeId, scope);

    const methodSymbols = symbols.filter(s =>
      s.kind === 'method' && s.parentId === container.id
    );
    scope.symbols.push(...methodSymbols);
  }

  for (const sym of symbols) {
    if (sym.kind === 'module' || sym.kind === 'method') continue;
    if (containerSymbols.includes(sym)) continue;
    fileScope.symbols.push(sym);
  }

  return fileScope;
}

// ── Symbol-based Scope Graph (fallback) ──

function buildScopeGraph(symbolsByFile: Map<string, CodeSymbol[]>): Map<string, ScopeNode> {
  const allScopes = new Map<string, ScopeNode>();

  for (const [filePath, symbols] of symbolsByFile) {
    // Create file-level scope
    const fileScopeId = `${filePath}#scope:file`;
    const fileScope: ScopeNode = {
      id: fileScopeId,
      filePath,
      parentScopeId: null,
      children: [],
      symbols: [],
      visibleNames: new Map(),
      startLine: 0,
      endLine: Infinity,
    };
    allScopes.set(fileScopeId, fileScope);

    // Nest scopes: top-level symbols in file scope, methods in class scopes
    const containerSymbols = symbols.filter(s =>
      s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait' || s.kind === 'interface'
    );

    for (const container of containerSymbols) {
      const scopeId = `${filePath}#scope:${container.name}:${container.startLine}`;
      const scope: ScopeNode = {
        id: scopeId,
        filePath,
        parentScopeId: fileScopeId,
        children: [],
        symbols: [container],
        visibleNames: new Map(),
        startLine: container.startLine,
        endLine: container.endLine,
      };
      fileScope.children.push(scope);
      allScopes.set(scopeId, scope);

      // Place methods inside their container scope
      const methodSymbols = symbols.filter(s =>
        s.kind === 'method' && s.parentId === container.id
      );
      scope.symbols.push(...methodSymbols);
    }

    // Top-level non-method symbols go to file scope
    for (const sym of symbols) {
      if (sym.kind === 'module') continue;
      if (sym.kind === 'method') continue; // already placed
      if (containerSymbols.includes(sym)) continue;
      fileScope.symbols.push(sym);
    }
  }

  return allScopes;
}

function findScopeForFile(filePath: string, scopeForest: Map<string, ScopeNode>): ScopeNode | undefined {
  for (const [, scope] of scopeForest) {
    if (scope.parentScopeId === null && scope.filePath === filePath) return scope;
  }
}

function findScopeForCall(call: RawCall, scopeForest: Map<string, ScopeNode>, symbolsByFile: Map<string, CodeSymbol[]>): ScopeNode | undefined {
  // Find the deepest scope containing this call's line
  const fileScope = findScopeForFile(call.filePath, scopeForest);
  if (!fileScope) return undefined;

  // Walk down to deepest matching scope
  function findDeepest(scope: ScopeNode, line: number): ScopeNode {
    for (const child of scope.children) {
      if (child.startLine <= line && child.endLine >= line) {
        return findDeepest(child, line);
      }
    }
    return scope;
  }

  return findDeepest(fileScope, call.line);
}

// ── Import Resolution within Scopes ──

function resolveImportsInScopes(
  input: ScopeResolverInput,
  scopeForest: Map<string, ScopeNode>,
): Map<string, Map<string, string>> {
  const importedNamesPerFile = new Map<string, Map<string, string>>();

  // F4: Build re-export map (port from resolver.ts buildReExportMap)
  const reExportMap = new Map<string, Map<string, string>>();
  for (const re of input.reExports ?? []) {
    const sourceFile = input.resolvedImportPaths.get(`${re.filePath}::${re.modulePath}`);
    if (!sourceFile) continue;
    let fileMap = reExportMap.get(re.filePath);
    if (!fileMap) { fileMap = new Map(); reExportMap.set(re.filePath, fileMap); }
    if (re.names.length > 0) {
      for (const name of re.names) fileMap.set(name, sourceFile);
    } else {
      fileMap.set('*', sourceFile);
    }
  }

  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) continue;

    let fileImports = importedNamesPerFile.get(imp.filePath);
    if (!fileImports) { fileImports = new Map(); importedNamesPerFile.set(imp.filePath, fileImports); }

    for (const { name } of imp.names) {
      fileImports.set(name, targetFile);
    }

    // F8: Full wildcard import expansion
    const semantics = input.perFileImportSemantics?.get(imp.filePath);
    if (imp.isWildcard && (semantics === 'wildcard-leaf' || semantics === 'wildcard-transitive' || imp.isDynamic)) {
      const targetSymbols = input.symbolsByFile.get(targetFile);
      if (targetSymbols) {
        for (const sym of targetSymbols.filter(s => s.exported)) {
          if (!fileImports.has(sym.name)) {
            fileImports.set(sym.name, targetFile);
          }
        }
      }
    }
  }

  return importedNamesPerFile;
}

// ── Visible Symbol Collection ──

function collectVisibleSymbols(
  scopeForest: Map<string, ScopeNode>,
  symbolsByFile: Map<string, CodeSymbol[]>,
  importedNamesPerFile: Map<string, Map<string, string>>,
  symbolById: Map<string, CodeSymbol>,
  input: ScopeResolverInput,
): void {
  for (const [, scope] of scopeForest) {
    // Inherit from parent first
    if (scope.parentScopeId) {
      const parentScope = scopeForest.get(scope.parentScopeId);
      if (parentScope) {
        for (const [name, syms] of parentScope.visibleNames) {
          scope.visibleNames.set(name, syms);
        }
      }
    }

    // Add local declarations
    for (const sym of scope.symbols) {
      const arr = scope.visibleNames.get(sym.name) ?? [];
      arr.push(sym);
      scope.visibleNames.set(sym.name, arr);
    }

    // Add imported symbols (file scope only)
    if (scope.parentScopeId === null) {
      const fileImports = importedNamesPerFile.get(scope.filePath);
      if (fileImports) {
        for (const [importedName, targetFile] of fileImports) {
          const targetSymbols = symbolsByFile.get(targetFile);
          if (targetSymbols) {
            const arr = scope.visibleNames.get(importedName) ?? [];
            for (const ts of targetSymbols.filter(s => s.name === importedName && s.exported)) {
              if (!arr.find(s => s.id === ts.id)) arr.push(ts);
            }
            scope.visibleNames.set(importedName, arr);
          }
        }
      }
    }
  }

  // F5: Propagate assignment chains (port from resolver.ts)
  // const b = a → b inherits type of a
  if (input.assignmentBindings) {
    for (const ab of input.assignmentBindings) {
      const fileScope = findScopeForFile(ab.filePath, scopeForest);
      if (!fileScope) continue;
      const sourceSyms = fileScope.visibleNames.get(ab.source);
      if (!sourceSyms || sourceSyms.length === 0) continue;
      const targetSyms = fileScope.visibleNames.get(ab.target) ?? [];
      if (targetSyms.length === 0) {
        fileScope.visibleNames.set(ab.target, [...sourceSyms]);
      }
    }
  }

  // F6: Propagate call result bindings (port from resolver.ts)
  // const x = getUser() → x gets return type of getUser
  if (input.callResultBindings && input.returnTypes) {
    const returnTypeMap = new Map<string, string>();
    for (const rt of input.returnTypes) {
      returnTypeMap.set(
        rt.parentName ? `${rt.parentName}.${rt.functionName}` : rt.functionName,
        rt.returnType
      );
    }

    for (const crb of input.callResultBindings) {
      const fileScope = findScopeForFile(crb.filePath, scopeForest);
      if (!fileScope || fileScope.visibleNames.has(crb.target)) continue;

      let returnType: string | undefined;
      if (crb.receiver) {
        const receiverSyms = fileScope.visibleNames.get(crb.receiver);
        if (receiverSyms && receiverSyms.length > 0) {
          returnType = returnTypeMap.get(`${receiverSyms[0].name}.${crb.calleeName}`);
        }
      }
      if (!returnType) {
        returnType = returnTypeMap.get(crb.calleeName);
      }
      if (returnType) {
        const typeSymbols = input.allSymbols.filter(s => s.name === returnType);
        if (typeSymbols.length > 0) {
          fileScope.visibleNames.set(crb.target, typeSymbols);
        }
      }
    }
  }
}

// ── Call Resolution ──

function resolveCallInScope(
  calleeName: string,
  scope: ScopeNode,
  allScopes: Map<string, ScopeNode>,
  symbolById: Map<string, CodeSymbol>,
): { symbol: CodeSymbol; confidence: number } | null {
  let current: ScopeNode | undefined = scope;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) break; // cycle guard
    visited.add(current.id);
    const visible = current.visibleNames.get(calleeName);
    if (visible && visible.length > 0) {
      // Prefer symbol in same file
      const sameFile = visible.find(s => s.filePath === scope.filePath);
      if (sameFile) return { symbol: sameFile, confidence: 0.95 };
      return { symbol: visible[0], confidence: 0.85 };
    }
    if (!current.parentScopeId) break;
    current = allScopes.get(current.parentScopeId);
  }

  return null;
}

// ── Receiver-aware call resolution ──

function resolveReceiverCall(
  call: RawCall,
  scope: ScopeNode,
  allScopes: Map<string, ScopeNode>,
  symbolById: Map<string, CodeSymbol>,
  input: ScopeResolverInput,
  symbolByName: Map<string, CodeSymbol[]>,
): { symbol: CodeSymbol; confidence: number } | null {
  const receiver = call.receiver!;
  const nameMatches = symbolByName.get(call.calleeName);
  const candidateSymbols = nameMatches ? nameMatches.filter(s => s.kind === 'method') : [];

  // this/self → method of enclosing class
  if (receiver === 'this' || receiver === 'self') {
    let current: ScopeNode | undefined = scope;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current.id)) break; // cycle guard
      visited.add(current.id);
      const cls = current.symbols.find(s => s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait');
      if (cls) {
        const method = candidateSymbols.find(s => s.parentId === cls.id);
        if (method) return { symbol: method, confidence: 0.95 };
        break;
      }
      if (!current.parentScopeId) break;
      current = allScopes.get(current.parentScopeId);
    }
  }

  // Type binding lookup from scope chain
  let lookupScope: ScopeNode | undefined = scope;
  const visitedLookup = new Set<string>();
  while (lookupScope) {
    if (visitedLookup.has(lookupScope.id)) break; // cycle guard
    visitedLookup.add(lookupScope.id);
    const typeSymbols = lookupScope.visibleNames.get(receiver);
    if (typeSymbols && typeSymbols.length > 0) {
      const typeSym = typeSymbols[0];
      const method = candidateSymbols.find(s => s.parentId === typeSym.id);
      if (method) return { symbol: method, confidence: 0.93 };
    }
    if (!lookupScope.parentScopeId) break;
    lookupScope = allScopes.get(lookupScope.parentScopeId);
  }

  // F2: PascalCase heuristic (port from narrowByReceiver Strategy 3)
  const pascal = receiver.charAt(0).toUpperCase() + receiver.slice(1);
  const byConvention = candidateSymbols.find(c => {
    const parent = c.parentId ? symbolById.get(c.parentId) : null;
    return parent?.name === pascal;
  });
  if (byConvention) return { symbol: byConvention, confidence: 0.55 };

  // F3: Local class match (port from narrowByReceiver Strategy 4)
  const localSymbols = input.symbolsByFile.get(scope.filePath);
  if (localSymbols) {
    const localClass = localSymbols.find(s =>
      (s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait') &&
      (s.name === receiver || s.name === pascal)
    );
    if (localClass) {
      const method = candidateSymbols.find(c => c.parentId === localClass.id);
      if (method) return { symbol: method, confidence: 0.90 };
    }
  }

  return null;
}

// ── F1: Proximity scoring (port from resolver.ts) ──

function scoreCandidates(
  call: RawCall,
  candidates: CodeSymbol[],
  importsPerFile: Map<string, Set<string>>,
): { symbol: CodeSymbol; confidence: number } {
  if (candidates.length === 1) return { symbol: candidates[0], confidence: 0.9 };

  const importFiles = importsPerFile.get(call.filePath);
  let best = candidates[0];
  let bestScore = 0;

  for (const c of candidates) {
    let score: number;
    if (c.filePath === call.filePath) score = 0.90;
    else if (importFiles?.has(c.filePath)) score = 0.85;
    else if (dirname(c.filePath) === dirname(call.filePath)) score = 0.60;
    else score = 0.35;
    if (score > bestScore) { bestScore = score; best = c; }
  }

  return { symbol: best, confidence: bestScore };
}

// ── Helpers ──

function buildNameIndex(symbols: CodeSymbol[]): Map<string, CodeSymbol[]> {
  const index = new Map<string, CodeSymbol[]>();
  for (const s of symbols) {
    const arr = index.get(s.name) ?? [];
    arr.push(s);
    index.set(s.name, arr);
  }
  return index;
}

function buildIdIndex(symbols: CodeSymbol[]): Map<string, CodeSymbol> {
  const index = new Map<string, CodeSymbol>();
  for (const s of symbols) index.set(s.id, s);
  return index;
}

function makeLink(fromId: string, toId: string, type: LinkType, confidence: number, line?: number): SymbolLink {
  return { id: `${fromId}->${type}->${toId}`, fromId, toId, type, confidence, line };
}

function deduplicateLinks(links: SymbolLink[]): SymbolLink[] {
  const seen = new Set<string>();
  return links.filter(l => { if (seen.has(l.id)) return false; seen.add(l.id); return true; });
}

function isExternalModule(modulePath: string): boolean {
  if (modulePath.startsWith('.') || modulePath.startsWith('/')) return false;
  return true;
}

// Compare two resolution results
export interface DiffEntry { linkId: string; legacy: SymbolLink; scopeBased: SymbolLink | null; }
export interface DiffStats {
  addedInScope: number;
  missingFromScope: number;
  confidenceDiff: number;
  totalMatched: number;
  totalLegacy: number;
  totalScope: number;
}

function linkKey(link: SymbolLink): string {
  return `${link.fromId}::${link.type}::${link.toId}`;
}

export function diffResolutions(legacy: ResolutionResult, scopeBased: ResolutionResult): DiffEntry[] {
  // Build index by semantic key (fromId, type, toId) instead of link.id
  const scopeIndex = new Map<string, SymbolLink>();
  for (const link of scopeBased.links) {
    const key = linkKey(link);
    // If duplicate key, keep higher confidence
    const existing = scopeIndex.get(key);
    if (!existing || link.confidence > existing.confidence) {
      scopeIndex.set(key, link);
    }
  }

  const legacySeen = new Set<string>();
  const diffs: DiffEntry[] = [];

  for (const link of legacy.links) {
    const key = linkKey(link);
    legacySeen.add(key);
    const scopeLink = scopeIndex.get(key);
    if (!scopeLink) {
      // Legacy link not found in scope-based
      diffs.push({ linkId: key, legacy: link, scopeBased: null });
    } else if (Math.abs((scopeLink.confidence ?? 0) - (link.confidence ?? 0)) > 0.05) {
      // Same semantic link but different confidence
      diffs.push({ linkId: key, legacy: link, scopeBased: scopeLink });
    }
  }

  // Find links unique to scope-based (added)
  for (const [key, link] of scopeIndex) {
    if (!legacySeen.has(key)) {
      diffs.push({ linkId: key, legacy: link, scopeBased: null }); // legacy=null means added by scope
    }
  }

  return diffs;
}

export function computeDiffStats(legacy: ResolutionResult, scopeBased: ResolutionResult, diffs: DiffEntry[]): DiffStats {
  const scopeKeys = new Set(diffs.filter(d => !d.legacy).map(d => d.linkId));
  const legacyKeys = new Set(diffs.filter(d => !d.scopeBased).map(d => d.linkId));

  let addedInScope = 0;
  let missingFromScope = 0;
  let confidenceDiff = 0;

  for (const d of diffs) {
    if (!d.scopeBased) missingFromScope++;
    else if (scopeKeys.has(d.linkId)) addedInScope++;
    else confidenceDiff++;
  }

  const matchedKeys = new Set<string>();
  for (const link of legacy.links) {
    const key = linkKey(link);
    if (scopeIndex(diffs).has(key)) continue; // already counted as diff/missing
    matchedKeys.add(key);
  }

  return {
    addedInScope,
    missingFromScope,
    confidenceDiff,
    totalMatched: legacy.links.length - missingFromScope - confidenceDiff + addedInScope,
    totalLegacy: legacy.links.length,
    totalScope: scopeBased.links.length,
  };
}

function scopeIndex(diffs: DiffEntry[]): Map<string, DiffEntry> {
  const m = new Map<string, DiffEntry>();
  for (const d of diffs) m.set(d.linkId, d);
  return m;
}

export function checkParity(languageId: string, legacy: ResolutionResult, scopeBased: ResolutionResult): { reached: boolean; matchRate: number; stats: DiffStats } {
  const diffs = diffResolutions(legacy, scopeBased);
  const stats = computeDiffStats(legacy, scopeBased, diffs);
  const totalLinks = legacy.links.length;
  const matchRate = totalLinks > 0 ? (totalLinks - diffs.length) / totalLinks : 1;
  return { reached: matchRate >= 0.99, matchRate, stats };
}
