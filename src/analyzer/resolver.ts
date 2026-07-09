import { dirname } from 'node:path';
import type { CodeSymbol, SymbolLink, RawImport, RawCall, RawHeritage, RawReExport, RawTypeBinding, RawAssignmentBinding, RawReturnType, RawCallResultBinding, LinkType } from '../types.js';

// Minimum confidence to create a link — below this, classify as unresolved
// "No link is better than a wrong link"
const MIN_LINK_CONFIDENCE = 0.5;

interface ResolutionInput {
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
  resolvedImportPaths: Map<string, string>; // raw module path → resolved file path
  perFileImportSemantics?: Map<string, 'named' | 'wildcard-leaf' | 'wildcard-transitive' | 'namespace'>; // per-file import semantics
  perFileMroStrategy?: Map<string, 'first-wins' | 'c3' | 'ruby-mixin' | 'none'>; // per-file MRO strategy
}

export interface ResolutionResult {
  links: SymbolLink[];
  unresolvedImports: number;
  unresolvedCalls: number;
  externalImports: number;
  externalCalls: number;
}

export function resolveLinks(input: ResolutionInput): SymbolLink[] {
  const result = resolveLinksWithStats(input);
  return result.links;
}

export function resolveLinksWithStats(input: ResolutionInput): ResolutionResult {
  const links: SymbolLink[] = [];
  const symbolByName = buildNameIndex(input.allSymbols);
  const symbolById = buildIdIndex(input.allSymbols);
  let unresolvedImports = 0;
  let unresolvedCalls = 0;
  let externalImports = 0;
  let externalCalls = 0;

  // Track names imported from external (non-local) modules per file
  const externalNamesPerFile = new Map<string, Set<string>>();

  // Build re-export map: file → (name → sourceFile)
  const reExportMap = buildReExportMap(input.reExports ?? [], input.resolvedImportPaths);

  // Build imported names per file: file → (name → targetFile)
  const importedNamesPerFile = new Map<string, Map<string, string>>();
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) continue;
    let fileImports = importedNamesPerFile.get(imp.filePath);
    if (!fileImports) {
      fileImports = new Map();
      importedNamesPerFile.set(imp.filePath, fileImports);
    }
    for (const { name } of imp.names) {
      fileImports.set(name, targetFile);
    }
    // Wildcard-leaf semantics: expand wildcard import to include all exported symbols
    const semantics = input.perFileImportSemantics?.get(imp.filePath);
    if (imp.isWildcard && (semantics === 'wildcard-leaf' || imp.isDynamic)) {
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

  // Build set of files directly imported by each file (for proximity scoring)
  const directImportsPerFile = new Map<string, Set<string>>();
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) continue;
    let s = directImportsPerFile.get(imp.filePath);
    if (!s) { s = new Set(); directImportsPerFile.set(imp.filePath, s); }
    s.add(targetFile);
  }

  // Build per-file type binding map: file → (varName → [{typeName, scope, line}])
  // Multiple entries per varName when same name used in different scopes
  const typeBindingsPerFile = new Map<string, Map<string, Array<{ typeName: string; scope?: string; line: number }>>>();
  if (input.typeBindings) {
    for (const tb of input.typeBindings) {
      let fileBindings = typeBindingsPerFile.get(tb.filePath);
      if (!fileBindings) {
        fileBindings = new Map();
        typeBindingsPerFile.set(tb.filePath, fileBindings);
      }
      let entries = fileBindings.get(tb.variableName);
      if (!entries) {
        entries = [];
        fileBindings.set(tb.variableName, entries);
      }
      entries.push({ typeName: tb.typeName, scope: tb.scope, line: tb.line });
    }
  }

  // Propagate assignment chains (1-level): const b = a → b gets type of a
  if (input.assignmentBindings) {
    for (const ab of input.assignmentBindings) {
      const fileBindings = typeBindingsPerFile.get(ab.filePath);
      if (!fileBindings) continue;

      const sourceEntries = fileBindings.get(ab.source);
      if (!sourceEntries || sourceEntries.length === 0) continue;

      // Find source entry matching the same scope (or module-level)
      const scopeMatch = ab.scope
        ? sourceEntries.find(e => e.scope === ab.scope)
        : sourceEntries.find(e => !e.scope);
      const sourceEntry = scopeMatch ?? sourceEntries[0];

      // Add propagated binding for target
      let targetEntries = fileBindings.get(ab.target);
      if (!targetEntries) {
        targetEntries = [];
        fileBindings.set(ab.target, targetEntries);
      }
      // Don't overwrite if target already has a direct type binding
      if (targetEntries.length === 0) {
        targetEntries.push({ typeName: sourceEntry.typeName, scope: ab.scope, line: ab.line });
      }
    }
  }

  // Propagate call-result bindings: const x = getUser() → x gets return type of getUser
  if (input.callResultBindings && input.returnTypes) {
    // Build return type map: functionName → returnType (scoped by parentName for methods)
    const returnTypeMap = new Map<string, string>(); // "functionName" or "ClassName.methodName" → returnType
    for (const rt of input.returnTypes) {
      if (rt.parentName) {
        returnTypeMap.set(`${rt.parentName}.${rt.functionName}`, rt.returnType);
      }
      returnTypeMap.set(rt.functionName, rt.returnType);
    }

    for (const crb of input.callResultBindings) {
      const fileBindings = typeBindingsPerFile.get(crb.filePath);

      let returnType: string | undefined;

      // Try receiver.method lookup first (e.g., service.getUser → UserService.getUser)
      if (crb.receiver && fileBindings) {
        const receiverEntries = fileBindings.get(crb.receiver);
        if (receiverEntries && receiverEntries.length > 0) {
          const receiverType = receiverEntries[0].typeName;
          returnType = returnTypeMap.get(`${receiverType}.${crb.calleeName}`);
        }
      }

      // Fall back to bare function name lookup
      if (!returnType) {
        returnType = returnTypeMap.get(crb.calleeName);
      }

      if (!returnType) continue;

      // Add type binding for the call result variable
      let fb = fileBindings;
      if (!fb) {
        fb = new Map();
        typeBindingsPerFile.set(crb.filePath, fb);
      }
      let entries = fb.get(crb.target);
      if (!entries) {
        entries = [];
        fb.set(crb.target, entries);
      }
      // Skip if target already has a type binding
      if (entries.length === 0) {
        entries.push({ typeName: returnType, scope: crb.scope, line: crb.line });
      }
    }
  }

  // Build heritage ancestor map for MRO-aware method resolution
  // childName → ordered ancestor type names (C3 linearization or ruby-mixin order)
  // Gather direct parent links per child
  const directParentsPerChild = new Map<string, string[]>();
  for (const h of input.heritage) {
    let parents = directParentsPerChild.get(h.childName);
    if (!parents) {
      parents = [];
      directParentsPerChild.set(h.childName, parents);
    }
    parents.push(h.parentName);
  }

  // Compute C3-ordered ancestor list for each class (topologically sorted, no duplicates)
  const heritageAncestors = new Map<string, string[]>();
  const classMroStrategy = new Map<string, 'first-wins' | 'c3' | 'ruby-mixin' | 'none'>();

  // Determine MRO strategy per child class (from file-level strategy)
  for (const [childName] of directParentsPerChild) {
    // Find the file containing this child's heritage declaration
    const heritageEntry = input.heritage.find(h => h.childName === childName);
    if (heritageEntry) {
      const strategy = input.perFileMroStrategy?.get(heritageEntry.filePath) ?? 'first-wins';
      classMroStrategy.set(childName, strategy);
    }
  }

  // Compute ordered ancestor lists per strategy
  for (const [childName, directParents] of directParentsPerChild) {
    const strategy = classMroStrategy.get(childName) ?? 'first-wins';
    const ancestors = computeC3Linearization(childName, directParents, directParentsPerChild, strategy);
    heritageAncestors.set(childName, ancestors);
  }

  // ── Resolve imports ──
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) {
      if (isExternalModule(imp.modulePath)) {
        externalImports++;
        // Track externally imported names for call classification
        let extNames = externalNamesPerFile.get(imp.filePath);
        if (!extNames) { extNames = new Set(); externalNamesPerFile.set(imp.filePath, extNames); }
        for (const { name } of imp.names) extNames.add(name);
        if (imp.isDefault || imp.isWildcard) {
          // For default/wildcard, track the module base name as a hint
          const base = imp.modulePath.split('/').pop()?.replace(/\.[^.]+$/, '');
          if (base) extNames.add(base);
        }
      } else {
        unresolvedImports++;
      }
      continue;
    }

    const targetSymbols = input.symbolsByFile.get(targetFile);
    if (!targetSymbols) { unresolvedImports++; continue; }

    const fromId = `${imp.filePath}#module:_top:0`;

    if (imp.isDefault) {
      // Default import — find default-exported symbol or single primary export
      const defaultTarget = findDefaultExport(targetSymbols);
      if (defaultTarget) {
        links.push(makeLink(fromId, defaultTarget.id, 'imports', 0.85, imp.line));
      } else {
        // Fallback: link to the module-level symbol (file still imports from target)
        const moduleTop = targetSymbols.find(s => s.kind === 'module');
        if (moduleTop) {
          links.push(makeLink(fromId, moduleTop.id, 'imports', 0.6, imp.line));
        } else {
          unresolvedImports++;
        }
      }
    } else if (imp.names.length > 0) {
      for (const { name } of imp.names) {
        // Direct match in target file
        let target = targetSymbols.find(s => s.name === name && s.exported);

        // Follow re-export chain if not found directly
        if (!target) {
          target = followReExportChain(name, targetFile, reExportMap, input.symbolsByFile);
        }

        if (target) {
          links.push(makeLink(fromId, target.id, 'imports', 0.95, imp.line));
        } else {
          unresolvedImports++;
        }
      }
    } else {
      // Wildcard import — link to ALL exported symbols
      const exported = targetSymbols.filter(s => s.exported);
      if (exported.length > 0) {
        for (const target of exported) {
          links.push(makeLink(fromId, target.id, 'imports', 0.65, imp.line));
        }
      } else {
        unresolvedImports++;
      }
    }
  }

  // ── Resolve calls (receiver-aware + proximity scoring) ──
  for (const call of input.calls) {
    const candidates = symbolByName.get(call.calleeName);
    if (!candidates || candidates.length === 0) {
      // No project symbol matches this callee name.
      // - Method calls (has receiver): must be external — the method doesn't exist in the project
      // - Bare calls: check built-in globals and external import names
      const extNames = externalNamesPerFile.get(call.filePath);
      if (call.receiver ||
          BUILTIN_GLOBALS.has(call.calleeName) ||
          extNames?.has(call.calleeName)) {
        externalCalls++;
      } else {
        unresolvedCalls++;
      }
      tryLinkReceiverReference(call, symbolByName, importedNamesPerFile, links);
      continue;
    }

    // Fast path: unique name globally.
    // Skip this shortcut when:
    // - the call has a receiver AND the name is a common built-in prototype method
    //   (`pattern.exec()`, `fileSet.add()`) — those must go through receiver-aware
    //   narrowing below instead of being linked by bare name to an unrelated project
    //   symbol that merely happens to share the name. Receiver calls to any other
    //   (non-built-in) method name still take the fast path, since that's what
    //   correctly resolves single-candidate methods like `self.save()` in
    //   Python/Go/Rust fixtures — narrowing isn't reliable for those receiver types.
    // - the identifier was captured from an argument position, not an actual
    //   invocation (`onMounted(handler)`, decorator args) — it may just be a plain
    //   local variable (e.g. `resolve(root, file)`), not a function reference. Let it
    //   fall through to same-file/imported/proximity-scored matching below instead of
    //   blindly linking to a same-named symbol anywhere in the repo.
    if (
      candidates.length === 1 &&
      !(call.receiver && BUILTIN_METHOD_NAMES.has(call.calleeName)) &&
      !call.isArgumentRef
    ) {
      // Check if the caller imported this name from an external module, or it's a builtin global
      const fileExtNames = externalNamesPerFile.get(call.filePath);
      if (BUILTIN_GLOBALS.has(call.calleeName) || fileExtNames?.has(call.calleeName)) {
        externalCalls++;
        continue;
      }
      links.push(makeLink(call.enclosingSymbolId, candidates[0].id, 'calls', 0.9, call.line));
      continue;
    }

    // ── Receiver-aware narrowing (highest priority for member calls) ──
    if (call.receiver) {
      const narrowed = narrowByReceiver(call, candidates, symbolById, symbolByName, importedNamesPerFile, input.symbolsByFile, typeBindingsPerFile, heritageAncestors);
      if (narrowed) {
        if (narrowed.confidence >= MIN_LINK_CONFIDENCE) {
          links.push(makeLink(call.enclosingSymbolId, narrowed.symbol.id, 'calls', narrowed.confidence, call.line));
        } else {
          unresolvedCalls++;
          tryLinkReceiverReference(call, symbolByName, importedNamesPerFile, links);
        }
        continue;
      }
      // Receiver didn't resolve to a known type — treat as external call
      // Don't fall through to name-only matching which would link to unrelated symbols
      const extNames = externalNamesPerFile.get(call.filePath);
      if (BUILTIN_GLOBALS.has(call.calleeName) || extNames?.has(call.calleeName)) {
        externalCalls++;
      } else {
        unresolvedCalls++;
      }
      tryLinkReceiverReference(call, symbolByName, importedNamesPerFile, links);
      continue;
    }

    // ── Same file match ──
    const sameFile = candidates.filter(s => s.filePath === call.filePath);
    if (sameFile.length > 0) {
      links.push(makeLink(call.enclosingSymbolId, sameFile[0].id, 'calls', 0.9, call.line));
      continue;
    }

    // ── Imported symbol match ──
    const fileImports = importedNamesPerFile.get(call.filePath);
    const importedFromFile = fileImports?.get(call.calleeName);
    if (importedFromFile) {
      const imported = candidates.find(s => s.filePath === importedFromFile);
      if (imported) {
        links.push(makeLink(call.enclosingSymbolId, imported.id, 'calls', 0.95, call.line));
        continue;
      }
    }

    // ── Proximity scoring fallback (replaces blind candidates[0]) ──
    const best = scoreCandidates(call, candidates, directImportsPerFile);
    if (best.confidence >= MIN_LINK_CONFIDENCE) {
      links.push(makeLink(call.enclosingSymbolId, best.symbol.id, 'calls', best.confidence, call.line));
    } else {
      // Below threshold — "no link is better than a wrong link"
      unresolvedCalls++;
    }
  }

  // ── Create reference links from type annotations → project type symbols ──
  // Prevents false dead-code reports for types/interfaces used only in annotations
  if (input.typeBindings) {
    for (const tb of input.typeBindings) {
      const candidates = symbolByName.get(tb.typeName);
      if (!candidates || candidates.length === 0) continue;
      // Skip types imported from external modules
      const extNames = externalNamesPerFile.get(tb.filePath);
      if (extNames?.has(tb.typeName)) continue;
      // Prefer imported file > same file > unique global match
      const importedFile = importedNamesPerFile.get(tb.filePath)?.get(tb.typeName);
      const target = importedFile
        ? candidates.find(s => s.filePath === importedFile)
        : candidates.find(s => s.filePath === tb.filePath)
          ?? (candidates.length === 1 ? candidates[0] : null);
      if (target) {
        const fromId = tb.scope ?? `${tb.filePath}#module:_top:0`;
        links.push(makeLink(fromId, target.id, 'calls', 0.7, tb.line));
      }
    }
  }

  // ── Create reference links from return type annotations → project type symbols ──
  if (input.returnTypes) {
    for (const rt of input.returnTypes) {
      const candidates = symbolByName.get(rt.returnType);
      if (!candidates || candidates.length === 0) continue;
      const extNames = externalNamesPerFile.get(rt.filePath);
      if (extNames?.has(rt.returnType)) continue;
      const importedFile = importedNamesPerFile.get(rt.filePath)?.get(rt.returnType);
      const target = importedFile
        ? candidates.find(s => s.filePath === importedFile)
        : candidates.find(s => s.filePath === rt.filePath)
          ?? (candidates.length === 1 ? candidates[0] : null);
      if (target) {
        const fileSyms = input.symbolsByFile.get(rt.filePath);
        const fromSym = fileSyms?.find(s =>
          s.name === rt.functionName &&
          (s.kind === 'function' || s.kind === 'method') &&
          s.startLine <= rt.line && s.endLine >= rt.line
        );
        const fromId = fromSym?.id ?? `${rt.filePath}#module:_top:0`;
        links.push(makeLink(fromId, target.id, 'calls', 0.7, rt.line));
      }
    }
  }

  // ── Resolve heritage (import-aware cross-file) ──
  for (const h of input.heritage) {
    const children = symbolByName.get(h.childName);
    const parents = symbolByName.get(h.parentName);
    if (!children || !parents) continue;

    const child = children.find(s => s.filePath === h.filePath) ?? children[0];

    // Prefer imported parent > same-file parent > first match
    const importedFile = importedNamesPerFile.get(h.filePath)?.get(h.parentName);
    const parent = (importedFile ? parents.find(s => s.filePath === importedFile) : undefined)
      ?? parents.find(s => s.filePath === h.filePath)
      ?? parents[0];

    if (child && parent) {
      links.push(makeLink(child.id, parent.id, h.type, 0.95, h.line));
    }
  }

  // ── Containment links (method → class) ──
  for (const sym of input.allSymbols) {
    if (sym.parentId) {
      links.push(makeLink(sym.parentId, sym.id, 'contains', 1.0));
    }
  }

  // ── Re-export links (barrel → source symbol) ──
  // A named re-export `export { X } from './source'` is a real reference to X.
  // Without this, X appears dead when all consumers import through the barrel.
  if (input.reExports) {
    for (const re of input.reExports) {
      const sourceFile = input.resolvedImportPaths.get(`${re.filePath}::${re.modulePath}`);
      if (!sourceFile) continue;
      const sourceSymbols = input.symbolsByFile.get(sourceFile);
      if (!sourceSymbols) continue;

      const fromId = `${re.filePath}#module:_top:0`;

      if (re.names.length > 0) {
        for (const name of re.names) {
          let target = sourceSymbols.find(s => s.name === name && s.exported);
          if (!target) {
            target = followReExportChain(name, sourceFile, reExportMap, input.symbolsByFile);
          }
          if (target) {
            links.push(makeLink(fromId, target.id, 'imports', 0.85, re.line));
          }
        }
      } else {
        // Wildcard: export * from './source' — link to all exported symbols
        for (const sym of sourceSymbols.filter(s => s.exported)) {
          links.push(makeLink(fromId, sym.id, 'imports', 0.6, re.line));
        }
      }
    }
  }

  return { links: deduplicateLinks(links), unresolvedImports, unresolvedCalls, externalImports, externalCalls };
}

// ── Receiver-aware call narrowing ──

function narrowByReceiver(
  call: RawCall,
  candidates: CodeSymbol[],
  symbolById: Map<string, CodeSymbol>,
  symbolByName: Map<string, CodeSymbol[]>,
  importedNamesPerFile: Map<string, Map<string, string>>,
  symbolsByFile: Map<string, CodeSymbol[]>,
  typeBindingsPerFile: Map<string, Map<string, Array<{ typeName: string; scope?: string; line: number }>>>,
  heritageAncestors?: Map<string, string[]>,
): { symbol: CodeSymbol; confidence: number } | null {
  const receiver = call.receiver!;

  // Strategy 1: this/self → method of enclosing class
  if (receiver === 'this' || receiver === 'self') {
    const enclosing = symbolById.get(call.enclosingSymbolId);
    const parentId = enclosing?.parentId;
    if (parentId) {
      const method = candidates.find(c => c.parentId === parentId);
      if (method) return { symbol: method, confidence: 0.95 };
    }
  }

  // Strategy 1b: this.field.method() → look up field's type from type bindings
  if (receiver.startsWith('this.') || receiver.startsWith('self.')) {
    const fieldName = receiver.slice(receiver.indexOf('.') + 1);
    const match = narrowByTypeBinding(fieldName, call.filePath, candidates, symbolById, typeBindingsPerFile, call.enclosingSymbolId, heritageAncestors);
    if (match) return match;
  }

  // Strategy 2: receiver is an imported type name (static call or PascalCase)
  const importedFile = importedNamesPerFile.get(call.filePath)?.get(receiver);
  if (importedFile) {
    const method = candidates.find(c => {
      if (c.filePath !== importedFile) return false;
      const parent = c.parentId ? symbolById.get(c.parentId) : null;
      return parent?.name === receiver;
    });
    if (method) return { symbol: method, confidence: 0.92 };
    // Fallback: any candidate from the imported file
    const fromFile = candidates.find(c => c.filePath === importedFile);
    if (fromFile) return { symbol: fromFile, confidence: 0.85 };
  }

  // Strategy 2b: receiver is a variable with a known type binding (e.g. const db = new Database())
  {
    const match = narrowByTypeBinding(receiver, call.filePath, candidates, symbolById, typeBindingsPerFile, call.enclosingSymbolId, heritageAncestors);
    if (match) return match;
  }

  // Strategy 3: receiver → PascalCase naming convention (userService → UserService)
  // Low confidence: heuristic frequently wrong (repo→Repo but actual class is UserRepository)
  const pascal = receiver.charAt(0).toUpperCase() + receiver.slice(1);
  const byConvention = candidates.find(c => {
    const parent = c.parentId ? symbolById.get(c.parentId) : null;
    return parent?.name === pascal;
  });
  if (byConvention) return { symbol: byConvention, confidence: 0.55 };

  // Strategy 4: receiver matches a class in the same file
  const localSymbols = symbolsByFile.get(call.filePath);
  if (localSymbols) {
    const localClass = localSymbols.find(s =>
      (s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait') &&
      (s.name === receiver || s.name === pascal)
    );
    if (localClass) {
      const method = candidates.find(c => c.parentId === localClass.id);
      if (method) return { symbol: method, confidence: 0.90 };
    }
  }

  return null;
}

// ── Type binding lookup: variable → type → method candidate (scope-aware) ──

function narrowByTypeBinding(
  varName: string,
  filePath: string,
  candidates: CodeSymbol[],
  symbolById: Map<string, CodeSymbol>,
  typeBindingsPerFile: Map<string, Map<string, Array<{ typeName: string; scope?: string; line: number }>>>,
  callEnclosingId?: string,
  heritageAncestors?: Map<string, string[]>,
): { symbol: CodeSymbol; confidence: number } | null {
  const fileBindings = typeBindingsPerFile.get(filePath);
  if (!fileBindings) return null;

  const entries = fileBindings.get(varName);
  if (!entries || entries.length === 0) return null;

  // Scope-aware: prefer binding from same enclosing scope as the call
  let typeName: string | undefined;
  if (callEnclosingId && entries.length > 1) {
    // First try exact scope match
    const scopedEntry = entries.find(e => e.scope === callEnclosingId);
    if (scopedEntry) {
      typeName = scopedEntry.typeName;
    } else {
      // Try parent scope (e.g., call is in method, binding in class)
      const enclosing = symbolById.get(callEnclosingId);
      if (enclosing?.parentId) {
        const parentEntry = entries.find(e => e.scope === enclosing.parentId);
        if (parentEntry) typeName = parentEntry.typeName;
      }
    }
  }

  // Fallback: if only one entry or no scope match, use first (module-level or single)
  if (!typeName) {
    // Prefer module-level binding (scope undefined) when no scope match
    const moduleLevelEntry = entries.find(e => !e.scope);
    typeName = moduleLevelEntry?.typeName ?? entries[0].typeName;
  }

  // Find candidate whose parent class name matches the resolved type,
  // including ancestors via MRO (heritage chain)
  const method = resolveMethodByType(candidates, typeName, symbolById, heritageAncestors);
  if (method) return { symbol: method, confidence: 0.93 };

  return null;
}

// ── C3 Linearization Algorithm ──
// Computes the ordered method resolution chain for a class.
// Python uses proper C3 merge; Ruby uses prepend → include → superclass order.

function computeC3Linearization(
  childName: string,
  directParents: string[],
  parentMap: Map<string, string[]>,
  strategy: 'first-wins' | 'c3' | 'ruby-mixin' | 'none',
): string[] {
  if (strategy === 'none') return [];

  // Build full graph of all ancestors (BFS to gather all nodes)
  const allNodes = new Set<string>();
  const queue = [...directParents];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (allNodes.has(node)) continue;
    allNodes.add(node);
    const nodeParents = parentMap.get(node);
    if (nodeParents) queue.push(...nodeParents);
  }

  // C3 linearization: L(C) = [C] + merge(L(B1), L(B2), ..., [B1, B2, ...])
  if (strategy === 'c3') {
    return computeC3Order(directParents, parentMap, allNodes);
  }

  // Ruby mixin: prepend (by convention: heritage type=implements) → include (extends) → superclass
  // For simplicity: reverse direct parents order → first parent is highest priority
  if (strategy === 'ruby-mixin') {
    // In Ruby, modules included later override earlier; prepend reverses order
    // Direct parents are in declaration order; reverse for mixin semantics
    const ordered = computeC3Order(directParents, parentMap, allNodes);
    return ordered.reverse();
  }

  // first-wins: DFS pre-order, retain first occurrence
  if (strategy === 'first-wins') {
    return computeFirstWinsOrder(directParents, parentMap);
  }

  return [];
}

/** Proper C3 merge algorithm: merge linearizations preserving order */
function computeC3Order(
  directParents: string[],
  parentMap: Map<string, string[]>,
  allNodes: Set<string>,
  visitedParents: Set<string> = new Set(),
): string[] {
  // Build linearization for each parent recursively
  const linearizations: string[][] = [];
  for (const p of directParents) {
    if (visitedParents.has(p)) continue;
    visitedParents.add(p);

    const pParents = parentMap.get(p) ?? [];
    const pAllNodes = new Set<string>();
    const q = [...pParents];
    while (q.length > 0) {
      const n = q.shift()!;
      if (pAllNodes.has(n)) continue;
      pAllNodes.add(n);
      const np = parentMap.get(n);
      if (np) q.push(...np);
    }
    // Recursively compute parent's C3 order
    if (pParents.length > 0) {
      linearizations.push(computeC3Order(pParents, parentMap, pAllNodes, visitedParents));
    }
  }

  // L = merge(L1, L2, ..., Lk, [B1, B2, ..., Bk])
  const lists = [...linearizations, [...directParents]];
  return c3Merge(lists);
}

/** C3 merge: pick a head that appears in no tail, recurse */
function c3Merge(lists: string[][]): string[] {
  const result: string[] = [];

  while (lists.some(l => l.length > 0)) {
    let picked: string | null = null;
    let pickedIdx = -1;

    for (let i = 0; i < lists.length; i++) {
      const head = lists[i][0];
      if (head === undefined) continue;

      // Check: does head appear in any tail (position > 0) of any list?
      let isGood = true;
      for (let j = 0; j < lists.length; j++) {
        if (lists[j].slice(1).includes(head)) {
          isGood = false;
          break;
        }
      }

      if (isGood) {
        picked = head;
        pickedIdx = i;
        break;
      }
    }

    if (picked === null) break; // Cannot resolve (should not happen in practice)

    result.push(picked);

    // Remove head from all lists
    for (let i = 0; i < lists.length; i++) {
      lists[i] = lists[i].filter(h => h !== picked);
    }
  }

  return result;
}

/** First-wins: DFS pre-order, retain first occurrence of each node */
function computeFirstWinsOrder(
  directParents: string[],
  parentMap: Map<string, string[]>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  function visit(name: string) {
    if (seen.has(name)) return;
    seen.add(name);
    result.push(name);
    const parents = parentMap.get(name);
    if (parents) {
      for (const p of parents) visit(p);
    }
  }

  for (const p of directParents) visit(p);
  return result;
}

// ── MRO-aware method resolution via type hierarchy ──

function resolveMethodByType(
  candidates: CodeSymbol[],
  typeName: string,
  symbolById: Map<string, CodeSymbol>,
  heritageAncestors?: Map<string, string[]>,
): CodeSymbol | undefined {
  // Direct match: method's parent class name matches the type
  let method = candidates.find(c => {
    const parent = c.parentId ? symbolById.get(c.parentId) : null;
    return parent?.name === typeName;
  });
  if (method) return method;

  // Walk ancestor chain via heritage map
  if (heritageAncestors && heritageAncestors.has(typeName)) {
    const ancestors = heritageAncestors.get(typeName)!;
    for (const ancestorName of ancestors) {
      method = candidates.find(c => {
        const parent = c.parentId ? symbolById.get(c.parentId) : null;
        return parent?.name === ancestorName;
      });
      if (method) return method;
    }
  }

  return undefined;
}

// ── Proximity scoring for ambiguous calls ──

function scoreCandidates(
  call: RawCall,
  candidates: CodeSymbol[],
  directImportsPerFile: Map<string, Set<string>>,
): { symbol: CodeSymbol; confidence: number } {
  const callDir = dirname(call.filePath);
  const imports = directImportsPerFile.get(call.filePath);
  let best = candidates[0];
  let bestScore = 0;

  for (const c of candidates) {
    let score: number;
    if (c.filePath === call.filePath) {
      score = 0.90;
    } else if (imports?.has(c.filePath)) {
      score = 0.85;
    } else if (dirname(c.filePath) === callDir) {
      score = 0.60;
    } else {
      score = 0.35;
    }
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
  return {
    id: `${fromId}->${type}->${toId}`,
    fromId,
    toId,
    type,
    confidence,
    line,
  };
}

/**
 * Last resort when a receiver-based call's callee could not be resolved to a
 * project symbol (whether because no candidate shares its name at all, or
 * because receiver-type narrowing failed/scored too low). The callee itself
 * (e.g. `.join()`, `.has()`) may genuinely be external/builtin — but the
 * receiver it's invoked on can still be a real local symbol worth recording
 * as a dependency (e.g. `SAFETY_TOOLS.join('/')`: SAFETY_TOOLS is a project
 * const, `join` is Array.prototype.join and will never resolve). Without
 * this, the receiver reference is silently dropped from the graph entirely.
 * Only a bare-identifier receiver is considered — compound paths (`this.foo`,
 * `a.b`) are intentionally out of scope. Resolution prefers the file the
 * receiver was actually imported from (see the import-map lookup below);
 * otherwise falls back to a same-file match. This is a best-effort fallback,
 * not a scope-accurate resolution — it can miss renamed/aliased imports.
 */
function tryLinkReceiverReference(
  call: RawCall,
  symbolByName: Map<string, CodeSymbol[]>,
  importedNamesPerFile: Map<string, Map<string, string>>,
  links: SymbolLink[],
): void {
  if (
    !call.receiver ||
    call.receiver.includes('.') ||
    call.receiver === 'this' ||
    call.receiver === 'self' ||
    call.isArgumentRef
  ) {
    return;
  }
  const receiverCandidates = symbolByName.get(call.receiver);
  if (!receiverCandidates || receiverCandidates.length === 0) return;

  // Prefer the file the receiver name was actually imported from, if any —
  // this correctly disambiguates when another file coincidentally declares a
  // same-named symbol. Falls back to a same-file match otherwise. Like the
  // resolver's existing "imported type name" strategy, this assumes the local
  // import binding name matches the target symbol's own name — it will miss
  // renamed/aliased default imports (e.g. `import Foo from './registry'` where
  // the exported symbol is actually named something else); that is a known,
  // accepted limitation shared with the rest of the receiver-resolution logic.
  const importedFile = importedNamesPerFile.get(call.filePath)?.get(call.receiver);
  const target = importedFile
    ? receiverCandidates.find(s => s.filePath === importedFile)
    : receiverCandidates.find(s => s.filePath === call.filePath);

  if (target) {
    links.push(makeLink(call.enclosingSymbolId, target.id, 'references', 0.85, call.line));
  }
}

function deduplicateLinks(links: SymbolLink[]): SymbolLink[] {
  const seen = new Set<string>();
  return links.filter(l => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}

// ── Re-export chain resolution ──

/** Build a map: file → (exportedName → sourceFile) from re-export declarations */
function buildReExportMap(
  reExports: RawReExport[],
  resolvedPaths: Map<string, string>,
): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  for (const re of reExports) {
    const sourceFile = resolvedPaths.get(`${re.filePath}::${re.modulePath}`);
    if (!sourceFile) continue;

    let fileMap = map.get(re.filePath);
    if (!fileMap) { fileMap = new Map(); map.set(re.filePath, fileMap); }

    if (re.names.length > 0) {
      for (const name of re.names) {
        fileMap.set(name, sourceFile);
      }
    } else {
      // Wildcard re-export: export * from './x' — mark with '*'
      fileMap.set('*', sourceFile);
    }
  }
  return map;
}

/** Follow re-export chain: barrel file re-exports name from another file */
function followReExportChain(
  name: string,
  fromFile: string,
  reExportMap: Map<string, Map<string, string>>,
  symbolsByFile: Map<string, CodeSymbol[]>,
  depth = 0,
): CodeSymbol | undefined {
  if (depth > 5) return undefined; // prevent infinite loops

  const fileReExports = reExportMap.get(fromFile);
  if (!fileReExports) return undefined;

  // Check named re-export first
  let sourceFile = fileReExports.get(name);
  if (!sourceFile) {
    // Check wildcard re-export (export * from)
    sourceFile = fileReExports.get('*');
  }
  if (!sourceFile) return undefined;

  // Look for the symbol in the source file
  const sourceSymbols = symbolsByFile.get(sourceFile);
  if (sourceSymbols) {
    const found = sourceSymbols.find(s => s.name === name && s.exported);
    if (found) return found;
  }

  // Recurse: source file might also re-export
  return followReExportChain(name, sourceFile, reExportMap, symbolsByFile, depth + 1);
}

/** Find the best match for a default import */
function findDefaultExport(targetSymbols: CodeSymbol[]): CodeSymbol | undefined {
  const exported = targetSymbols.filter(s => s.exported);
  if (exported.length === 0) return undefined;

  // If only one exported symbol, it's likely the default
  if (exported.length === 1) return exported[0];

  // Prefer class > function in default export scenarios
  const cls = exported.find(s => s.kind === 'class');
  if (cls) return cls;
  const fn = exported.find(s => s.kind === 'function');
  if (fn) return fn;

  // Fallback to first
  return exported[0];
}

// ── External module detection ──

/** Returns true if the module path refers to an external package (not a relative local import) */
function isExternalModule(modulePath: string): boolean {
  // Relative imports are internal
  if (modulePath.startsWith('.') || modulePath.startsWith('/')) return false;
  // Everything else: node:*, @scope/pkg, bare specifiers → external
  return true;
}

/** Well-known built-in globals that are never in a project's symbol index */
const BUILTIN_GLOBALS = new Set([
  // JavaScript / TypeScript
  'console', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Date',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'JSON', 'RegExp', 'Proxy', 'Reflect', 'Intl', 'Atomics', 'SharedArrayBuffer',
  'ArrayBuffer', 'DataView', 'Float32Array', 'Float64Array',
  'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'structuredClone', 'atob', 'btoa', 'fetch',
  'Buffer', 'process', 'global', 'globalThis', 'require', '__dirname', '__filename',
  // Vue 3 composition API
  'ref', 'reactive', 'computed', 'watch', 'watchEffect', 'onMounted', 'onUnmounted',
  'onBeforeMount', 'onBeforeUnmount', 'onUpdated', 'onBeforeUpdate',
  'defineProps', 'defineEmits', 'defineExpose', 'defineComponent', 'defineSlots',
  'toRef', 'toRefs', 'unref', 'shallowRef', 'triggerRef',
  'provide', 'inject', 'nextTick', 'h', 'createApp',
  // React
  'useState', 'useEffect', 'useContext', 'useRef', 'useMemo', 'useCallback', 'useReducer',
  // Python
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'tuple', 'set', 'type',
  'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'delattr',
  'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'min', 'max', 'sum', 'abs',
  'open', 'input', 'super', 'property', 'staticmethod', 'classmethod',
  // Go
  'fmt', 'log', 'panic', 'make', 'append', 'cap', 'new', 'delete', 'close', 'copy',
  'recover', 'complex', 'real', 'imag',
  // Rust
  'println', 'eprintln', 'vec', 'format', 'todo', 'unimplemented',
  'assert', 'assert_eq', 'assert_ne', 'dbg', 'cfg',
  // Java / PHP
  'System', 'Arrays', 'Collections',
  'var_dump', 'echo', 'isset', 'unset', 'empty', 'die', 'exit',
  'array_map', 'array_filter', 'array_merge', 'array_keys', 'array_values',
  'count', 'strlen', 'substr', 'explode', 'implode', 'trim',
]);

/** Common built-in prototype/instance method names (Set/Map/Array/RegExp/String/Promise/...)
 *  that frequently collide by bare name with unrelated project symbols. Unlike
 *  BUILTIN_GLOBALS (free-standing functions), these only matter when called with
 *  a receiver (`x.exec()`, `x.add()`) — a bare `add(...)` call is not a built-in. */
const BUILTIN_METHOD_NAMES = new Set([
  'exec', 'test', 'add', 'delete', 'has', 'get', 'set', 'clear',
  'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join', 'reverse', 'sort',
  'map', 'filter', 'reduce', 'reduceRight', 'forEach', 'find', 'findIndex', 'includes',
  'indexOf', 'lastIndexOf', 'some', 'every', 'flat', 'flatMap', 'fill', 'keys', 'values', 'entries',
  'then', 'catch', 'finally',
  'toString', 'valueOf', 'hasOwnProperty', 'match', 'matchAll', 'replace', 'replaceAll',
  'split', 'trim', 'toLowerCase', 'toUpperCase', 'startsWith', 'endsWith', 'padStart', 'padEnd',
]);
