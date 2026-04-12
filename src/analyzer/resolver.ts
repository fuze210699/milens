import { dirname } from 'node:path';
import type { CodeSymbol, SymbolLink, RawImport, RawCall, RawHeritage, RawReExport, RawTypeBinding, LinkType } from '../types.js';

interface ResolutionInput {
  symbolsByFile: Map<string, CodeSymbol[]>;
  allSymbols: CodeSymbol[];
  imports: RawImport[];
  calls: RawCall[];
  heritage: RawHeritage[];
  reExports?: RawReExport[];
  typeBindings?: RawTypeBinding[];
  resolvedImportPaths: Map<string, string>; // raw module path → resolved file path
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

  // Build per-file type binding map: file → (varName → typeName)
  const typeBindingsPerFile = new Map<string, Map<string, string>>();
  if (input.typeBindings) {
    for (const tb of input.typeBindings) {
      let fileBindings = typeBindingsPerFile.get(tb.filePath);
      if (!fileBindings) {
        fileBindings = new Map();
        typeBindingsPerFile.set(tb.filePath, fileBindings);
      }
      fileBindings.set(tb.variableName, tb.typeName);
    }
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

    if (imp.names.length > 0) {
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
    } else if (imp.isDefault) {
      // Default import — find default-exported symbol or single primary export
      const defaultTarget = findDefaultExport(targetSymbols);
      if (defaultTarget) {
        links.push(makeLink(fromId, defaultTarget.id, 'imports', 0.85, imp.line));
      } else {
        unresolvedImports++;
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
      // Classify: external (built-in/imported from external pkg) vs truly unresolved
      const extNames = externalNamesPerFile.get(call.filePath);
      if (BUILTIN_GLOBALS.has(call.calleeName) ||
          BUILTIN_GLOBALS.has(call.receiver ?? '') ||
          extNames?.has(call.calleeName) ||
          (call.receiver && extNames?.has(call.receiver))) {
        externalCalls++;
      } else {
        unresolvedCalls++;
      }
      continue;
    }

    // Fast path: unique name globally
    if (candidates.length === 1) {
      links.push(makeLink(call.enclosingSymbolId, candidates[0].id, 'calls', 0.9, call.line));
      continue;
    }

    // ── Receiver-aware narrowing (highest priority for member calls) ──
    if (call.receiver) {
      const narrowed = narrowByReceiver(call, candidates, symbolById, symbolByName, importedNamesPerFile, input.symbolsByFile, typeBindingsPerFile);
      if (narrowed) {
        links.push(makeLink(call.enclosingSymbolId, narrowed.symbol.id, 'calls', narrowed.confidence, call.line));
        continue;
      }
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
    links.push(makeLink(call.enclosingSymbolId, best.symbol.id, 'calls', best.confidence, call.line));
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
  typeBindingsPerFile: Map<string, Map<string, string>>,
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
    const match = narrowByTypeBinding(fieldName, call.filePath, candidates, symbolById, typeBindingsPerFile);
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
    const match = narrowByTypeBinding(receiver, call.filePath, candidates, symbolById, typeBindingsPerFile);
    if (match) return match;
  }

  // Strategy 3: receiver → PascalCase naming convention (userService → UserService)
  const pascal = receiver.charAt(0).toUpperCase() + receiver.slice(1);
  const byConvention = candidates.find(c => {
    const parent = c.parentId ? symbolById.get(c.parentId) : null;
    return parent?.name === pascal;
  });
  if (byConvention) return { symbol: byConvention, confidence: 0.82 };

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

// ── Type binding lookup: variable → type → method candidate ──

function narrowByTypeBinding(
  varName: string,
  filePath: string,
  candidates: CodeSymbol[],
  symbolById: Map<string, CodeSymbol>,
  typeBindingsPerFile: Map<string, Map<string, string>>,
): { symbol: CodeSymbol; confidence: number } | null {
  const fileBindings = typeBindingsPerFile.get(filePath);
  if (!fileBindings) return null;

  const typeName = fileBindings.get(varName);
  if (!typeName) return null;

  // Find candidate whose parent class name matches the resolved type
  const method = candidates.find(c => {
    const parent = c.parentId ? symbolById.get(c.parentId) : null;
    return parent?.name === typeName;
  });
  if (method) return { symbol: method, confidence: 0.93 };

  return null;
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
