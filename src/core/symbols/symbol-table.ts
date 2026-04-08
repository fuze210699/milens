import type { NodeLabel } from '../../types/graph.js';
import type { SymbolDef, ImportMap, ImportBinding } from '../../types/pipeline.js';

export class SymbolTable {
  /** filePath → name → SymbolDef[] */
  private fileIndex = new Map<string, Map<string, SymbolDef[]>>();
  /** name → SymbolDef[] */
  private globalIndex = new Map<string, SymbolDef[]>();
  /** "ownerNodeId\0methodName" → SymbolDef[] */
  private methodByOwner = new Map<string, SymbolDef[]>();
  /** "ownerNodeId\0fieldName" → SymbolDef */
  private fieldByOwner = new Map<string, SymbolDef>();

  // ─── Register ────────────────────────────────────────────

  add(def: SymbolDef): void {
    // File index
    if (!this.fileIndex.has(def.filePath)) {
      this.fileIndex.set(def.filePath, new Map());
    }
    const nameMap = this.fileIndex.get(def.filePath)!;
    if (!nameMap.has(def.name)) {
      nameMap.set(def.name, []);
    }
    nameMap.get(def.name)!.push(def);

    // Global index
    if (!this.globalIndex.has(def.name)) {
      this.globalIndex.set(def.name, []);
    }
    this.globalIndex.get(def.name)!.push(def);
  }

  addMethod(ownerNodeId: string, def: SymbolDef): void {
    this.add(def);
    const key = `${ownerNodeId}\0${def.name}`;
    if (!this.methodByOwner.has(key)) {
      this.methodByOwner.set(key, []);
    }
    this.methodByOwner.get(key)!.push(def);
  }

  addField(ownerNodeId: string, def: SymbolDef): void {
    this.add(def);
    const key = `${ownerNodeId}\0${def.name}`;
    this.fieldByOwner.set(key, def);
  }

  // ─── Tier 1: Same-file lookup (confidence 0.95) ─────────

  lookupExact(filePath: string, name: string): SymbolDef | null {
    const nameMap = this.fileIndex.get(filePath);
    if (!nameMap) return null;
    const defs = nameMap.get(name);
    return defs?.[0] ?? null;
  }

  // ─── Tier 2: Import-scoped lookup (confidence 0.90) ──────

  lookupImported(filePath: string, name: string, importMap: ImportMap): SymbolDef | null {
    const binding = importMap.get(name);
    if (!binding) return null;

    const sourceFileMap = this.fileIndex.get(binding.sourceFile);
    if (!sourceFileMap) return null;

    // Match by exported name
    const targetName = binding.sourceName === 'default' ? name : binding.sourceName;
    const defs = sourceFileMap.get(targetName);
    if (defs && defs.length > 0) return defs[0];

    // If namespace import, try the name directly in source file
    if (binding.isNamespace) {
      // name might be `utils.formatDate` → we only have `formatDate`
      return null;
    }

    return null;
  }

  // ─── Tier 3: Global lookup (confidence 0.50) ─────────────

  lookupGlobal(name: string): SymbolDef[] {
    return this.globalIndex.get(name) ?? [];
  }

  // ─── Specialized Lookups ─────────────────────────────────

  lookupMethodByOwner(ownerNodeId: string, methodName: string): SymbolDef | null {
    const key = `${ownerNodeId}\0${methodName}`;
    const defs = this.methodByOwner.get(key);
    return defs?.[0] ?? null;
  }

  lookupFieldByOwner(ownerNodeId: string, fieldName: string): SymbolDef | null {
    const key = `${ownerNodeId}\0${fieldName}`;
    return this.fieldByOwner.get(key) ?? null;
  }

  lookupClassByName(name: string): SymbolDef[] {
    const all = this.globalIndex.get(name) ?? [];
    return all.filter(d => d.label === 'Class');
  }

  // ─── Resolution (3-tier cascade) ────────────────────────

  resolve(filePath: string, name: string, importMap?: ImportMap): { def: SymbolDef; confidence: number } | null {
    // Tier 1: same-file
    const tier1 = this.lookupExact(filePath, name);
    if (tier1) return { def: tier1, confidence: 0.95 };

    // Tier 2: import-scoped
    if (importMap) {
      const tier2 = this.lookupImported(filePath, name, importMap);
      if (tier2) return { def: tier2, confidence: 0.90 };
    }

    // Tier 3: global
    const tier3 = this.lookupGlobal(name);
    if (tier3.length === 1) return { def: tier3[0], confidence: 0.50 };
    if (tier3.length > 1) {
      // Prefer exported symbols
      const exported = tier3.filter(d => d.isExported);
      if (exported.length === 1) return { def: exported[0], confidence: 0.50 };
    }

    return null;
  }

  // ─── Stats ───────────────────────────────────────────────

  get size(): number {
    let count = 0;
    for (const nameMap of this.fileIndex.values()) {
      for (const defs of nameMap.values()) {
        count += defs.length;
      }
    }
    return count;
  }

  clear(): void {
    this.fileIndex.clear();
    this.globalIndex.clear();
    this.methodByOwner.clear();
    this.fieldByOwner.clear();
  }
}
