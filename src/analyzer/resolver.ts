import type { CodeSymbol, SymbolLink, RawImport, RawCall, RawHeritage, LinkType } from '../types.js';

interface ResolutionInput {
  symbolsByFile: Map<string, CodeSymbol[]>;
  allSymbols: CodeSymbol[];
  imports: RawImport[];
  calls: RawCall[];
  heritage: RawHeritage[];
  resolvedImportPaths: Map<string, string>; // raw module path → resolved file path
}

export function resolveLinks(input: ResolutionInput): SymbolLink[] {
  const links: SymbolLink[] = [];
  const symbolByName = buildNameIndex(input.allSymbols);

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

  // ── Resolve imports ──
  for (const imp of input.imports) {
    const targetFile = input.resolvedImportPaths.get(`${imp.filePath}::${imp.modulePath}`);
    if (!targetFile) continue;

    const targetSymbols = input.symbolsByFile.get(targetFile);
    if (!targetSymbols) continue;

    // Find the importing symbol (file-level or specific)
    const fromId = `${imp.filePath}#module:_top:0`;

    if (imp.names.length > 0) {
      for (const { name } of imp.names) {
        const target = targetSymbols.find(s => s.name === name && s.exported);
        if (target) {
          links.push(makeLink(fromId, target.id, 'imports', 0.95, imp.line));
        }
      }
    } else {
      // Wildcard or default import — link to file module
      const target = targetSymbols.find(s => s.exported);
      if (target) {
        links.push(makeLink(fromId, target.id, 'imports', 0.7, imp.line));
      }
    }
  }

  // ── Resolve calls (import-aware) ──
  for (const call of input.calls) {
    const candidates = symbolByName.get(call.calleeName);
    if (!candidates || candidates.length === 0) continue;

    // Priority: same file > imported symbol > unique global > ambiguous
    const sameFile = candidates.filter(s => s.filePath === call.filePath);
    if (sameFile.length > 0) {
      links.push(makeLink(call.enclosingSymbolId, sameFile[0].id, 'calls', 0.9, call.line));
      continue;
    }

    // Check if callee was imported into this file
    const fileImports = importedNamesPerFile.get(call.filePath);
    const importedFromFile = fileImports?.get(call.calleeName);
    if (importedFromFile) {
      const imported = candidates.find(s => s.filePath === importedFromFile);
      if (imported) {
        links.push(makeLink(call.enclosingSymbolId, imported.id, 'calls', 0.95, call.line));
        continue;
      }
    }

    const match = candidates[0];
    const confidence = candidates.length === 1 ? 0.8 : 0.5;
    links.push(makeLink(call.enclosingSymbolId, match.id, 'calls', confidence, call.line));
  }

  // ── Resolve heritage (extends/implements) ──
  for (const h of input.heritage) {
    const children = symbolByName.get(h.childName);
    const parents = symbolByName.get(h.parentName);
    if (!children || !parents) continue;

    const child = children.find(s => s.filePath === h.filePath) ?? children[0];
    const parent = parents[0];
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

  return deduplicateLinks(links);
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
