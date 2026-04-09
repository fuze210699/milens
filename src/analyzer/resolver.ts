import { dirname } from 'node:path';
import type { CodeSymbol, SymbolLink, RawImport, RawCall, RawHeritage, RawReExport, LinkType } from '../types.js';

interface ResolutionInput {
  symbolsByFile: Map<string, CodeSymbol[]>;
  allSymbols: CodeSymbol[];
  imports: RawImport[];
  calls: RawCall[];
  heritage: RawHeritage[];
  reExports?: RawReExport[];
  resolvedImportPaths: Map<string, string>; // raw module path → resolved file path
}

export interface ResolutionResult {
  links: SymbolLink[];
  unresolvedImports: number;
  unresolvedCalls: number;
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

  // ── Resolve imports ──
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) { unresolvedImports++; continue; }

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
    if (!candidates || candidates.length === 0) { unresolvedCalls++; continue; }

    // Fast path: unique name globally
    if (candidates.length === 1) {
      links.push(makeLink(call.enclosingSymbolId, candidates[0].id, 'calls', 0.9, call.line));
      continue;
    }

    // ── Receiver-aware narrowing (highest priority for member calls) ──
    if (call.receiver) {
      const narrowed = narrowByReceiver(call, candidates, symbolById, symbolByName, importedNamesPerFile, input.symbolsByFile);
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

  return { links: deduplicateLinks(links), unresolvedImports, unresolvedCalls };
}

// ── Receiver-aware call narrowing ──

function narrowByReceiver(
  call: RawCall,
  candidates: CodeSymbol[],
  symbolById: Map<string, CodeSymbol>,
  symbolByName: Map<string, CodeSymbol[]>,
  importedNamesPerFile: Map<string, Map<string, string>>,
  symbolsByFile: Map<string, CodeSymbol[]>,
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
