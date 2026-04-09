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

  for (const link of links) {
    if (link.type === 'contains') continue;
    inCount.set(link.toId, (inCount.get(link.toId) ?? 0) + 1);
    outCount.set(link.fromId, (outCount.get(link.fromId) ?? 0) + 1);
  }

  // ── Assign roles ──
  for (const sym of symbols) {
    sym.role = classifyRole(sym, inCount.get(sym.id) ?? 0, outCount.get(sym.id) ?? 0);
    sym.heat = computeHeat(sym, inCount.get(sym.id) ?? 0, outCount.get(sym.id) ?? 0);
  }

  // ── Compute zones (directory-based clustering) ──
  const zones = computeZones(symbols);

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

function computeZones(symbols: CodeSymbol[]): Map<string, string> {
  // Group files by their directory → zone name is the directory
  const zones = new Map<string, string>();
  const seen = new Set<string>();

  for (const sym of symbols) {
    if (seen.has(sym.filePath)) continue;
    seen.add(sym.filePath);

    const dir = dirname(sym.filePath);
    // Use the last meaningful directory segment as zone name
    const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
    const zone = parts.length > 0 ? parts[parts.length - 1] : 'root';
    zones.set(sym.filePath, zone);
  }

  return zones;
}
