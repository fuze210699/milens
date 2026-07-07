import { dirname } from 'node:path';
import type { CodeSymbol, SymbolLink, SymbolRole } from '../types.js';

/**
 * Phase 6 "Enrich" — compute role, heat, and zone metadata from the resolved graph.
 * Zero new dependencies: pure computation over symbols + links arrays.
 */

interface EnrichInput {
  symbols: CodeSymbol[];
  links: SymbolLink[];
}

interface EnrichOutput {
  /** symbols with role + heat assigned */
  symbols: CodeSymbol[];
  /** file path → zone name */
  zones: Map<string, string>;
}

export function enrichMetadata(input: EnrichInput): EnrichOutput {
  const { symbols, links } = input;

  // ── Build adjacency counts ──
  const inCount = new Map<string, number>();  // incoming refs (excluding 'contains')
  const outCount = new Map<string, number>(); // outgoing refs (excluding 'contains')
  const symToFile = new Map<string, string>();
  for (const sym of symbols) symToFile.set(sym.id, sym.filePath);
  // Dedupe by (caller_file, callee_id): imports + calls from same file = 1 signal
  const seenPairs = new Set<string>();

  for (const link of links) {
    if (link.type === 'contains') continue;
    const fromFile = symToFile.get(link.fromId);
    if (fromFile) {
      const pairKey = `${fromFile}::${link.toId}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
    }
    // If fromFile is unknown (e.g. link from unresolvable symbol), count as-is
    inCount.set(link.toId, (inCount.get(link.toId) ?? 0) + 1);
    outCount.set(link.fromId, (outCount.get(link.fromId) ?? 0) + 1);
  }

  // ── Assign roles ──
  for (const sym of symbols) {
    sym.role = classifyRole(sym, inCount.get(sym.id) ?? 0, outCount.get(sym.id) ?? 0);
    sym.heat = computeHeat(sym, inCount.get(sym.id) ?? 0, outCount.get(sym.id) ?? 0);
  }

  // ── Compute domains (graph-based clustering via link weights) ──
  const zones = computeDomains(symbols, links);

  return { symbols, zones };
}

function classifyRole(sym: CodeSymbol, inDeg: number, outDeg: number): SymbolRole {
  // Datatypes: classes/interfaces/types/structs/enums with no outgoing calls
  if (['interface', 'type', 'enum', 'struct'].includes(sym.kind)) {
    return 'datatype';
  }

  // Entrypoints: exported symbols with 0 incoming refs (nobody calls them from code)
  if (sym.exported && inDeg === 0 && outDeg > 0) {
    return 'entrypoint';
  }

  // Hubs: high fan-in AND high fan-out (connectors)
  if (inDeg >= 3 && outDeg >= 3) {
    return 'hub';
  }

  // Leaves: called by others but call nothing (pure logic)
  if (inDeg > 0 && outDeg === 0) {
    return 'leaf';
  }

  // Utility: exported but low fan-in (helper functions)
  if (sym.exported && inDeg >= 1 && inDeg <= 2) {
    return 'utility';
  }

  // Default: leaf for non-exported, utility for exported
  return sym.exported ? 'utility' : 'leaf';
}

function computeHeat(sym: CodeSymbol, inDeg: number, outDeg: number): number {
  // Heat = weighted combination of fan-in + fan-out + export status
  // Scale: 0-100
  const fanInScore = Math.min(inDeg * 15, 50);
  const fanOutScore = Math.min(outDeg * 5, 25);
  const exportBonus = sym.exported ? 10 : 0;
  const kindBonus = ['function', 'class', 'method'].includes(sym.kind) ? 5 : 0;
  return Math.min(fanInScore + fanOutScore + exportBonus + kindBonus, 100);
}

function computeDomains(symbols: CodeSymbol[], links: SymbolLink[]): Map<string, string> {
  // Graph-based domain clustering: files connected by 2+ cross-file links = same domain
  const allFiles = new Set<string>();
  const symToFile = new Map<string, string>();
  for (const sym of symbols) {
    allFiles.add(sym.filePath);
    symToFile.set(sym.id, sym.filePath);
  }

  // Count cross-file link weights
  const edgeWeights = new Map<string, number>();
  for (const link of links) {
    if (link.type === 'contains') continue;
    const fromFile = symToFile.get(link.fromId);
    const toFile = symToFile.get(link.toId);
    if (fromFile && toFile && fromFile !== toFile) {
      const key = fromFile < toFile ? `${fromFile}::${toFile}` : `${toFile}::${fromFile}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
    }
  }

  // Union-Find: merge files with 2+ mutual links
  const parent = new Map<string, string>();
  const ufRank = new Map<string, number>();

  function find(x: string): string {
    if (!parent.has(x)) { parent.set(x, x); ufRank.set(x, 0); }
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const rankA = ufRank.get(ra)!, rankB = ufRank.get(rb)!;
    if (rankA < rankB) parent.set(ra, rb);
    else if (rankA > rankB) parent.set(rb, ra);
    else { parent.set(rb, ra); ufRank.set(ra, rankA + 1); }
  }

  for (const [key, weight] of edgeWeights) {
    if (weight >= 2) {
      const [a, b] = key.split('::');
      union(a, b);
    }
  }

  // Group files by cluster root
  const clusters = new Map<string, string[]>();
  for (const file of allFiles) {
    const root = find(file);
    const arr = clusters.get(root) ?? [];
    arr.push(file);
    clusters.set(root, arr);
  }

  // Name each cluster by most common directory segment
  const zones = new Map<string, string>();
  for (const [, clusterFiles] of clusters) {
    const dirCounts = new Map<string, number>();
    for (const f of clusterFiles) {
      const dir = dirname(f).replace(/\\/g, '/');
      const parts = dir.split('/').filter(Boolean);
      const segment = parts.length > 0 ? parts[parts.length - 1] : 'root';
      dirCounts.set(segment, (dirCounts.get(segment) ?? 0) + 1);
    }
    let bestName = 'root';
    let bestCount = 0;
    for (const [name, count] of dirCounts) {
      if (count > bestCount) { bestName = name; bestCount = count; }
    }
    for (const f of clusterFiles) {
      zones.set(f, bestName);
    }
  }

  return zones;
}
