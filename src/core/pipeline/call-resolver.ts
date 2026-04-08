import { KnowledgeGraph } from '../graph/graph.js';
import { SymbolTable } from '../symbols/symbol-table.js';
import type { RawCall } from '../parsers/provider.js';
import type { RawImport } from '../parsers/provider.js';
import type { GraphRelationship } from '../../types/graph.js';
import type { ImportMap, ImportBinding, ProjectConfig, FileInfo } from '../../types/pipeline.js';

export interface CallResolverResult {
  callEdges: number;
  heritageResolved: number;
  rendersResolved: number;
}

/**
 * Phase 5: Resolve call expressions into CALLS edges,
 * and resolve placeholder EXTENDS/IMPLEMENTS/RENDERS targets.
 */
export function resolveCalls(
  fileCalls: Map<string, RawCall[]>,
  fileImports: Map<string, RawImport[]>,
  files: FileInfo[],
  graph: KnowledgeGraph,
  symbolTable: SymbolTable,
  config: ProjectConfig,
): CallResolverResult {
  // ── Build import maps per file ──────────────────────────
  const importMaps = buildImportMaps(fileImports, files, graph, config);

  // ── Resolve call expressions ────────────────────────────
  let callEdges = 0;
  const seenCalls = new Set<string>();

  for (const [filePath, calls] of fileCalls) {
    const importMap = importMaps.get(filePath);

    for (const call of calls) {
      const resolved = resolveCallTarget(call, filePath, symbolTable, importMap, graph);
      if (!resolved) continue;

      const relId = `CALLS:${call.containerId}->${resolved.targetId}`;
      if (seenCalls.has(relId)) continue;
      seenCalls.add(relId);

      // Verify both nodes exist
      if (!graph.hasNode(call.containerId) && !call.containerId.startsWith('File:')) continue;
      if (!graph.hasNode(resolved.targetId)) continue;

      const rel: GraphRelationship = {
        id: relId,
        sourceId: call.containerId,
        targetId: resolved.targetId,
        type: 'CALLS',
        confidence: resolved.confidence,
        properties: {
          callee: call.callee,
          kind: call.kind,
          line: call.line,
        },
      };
      graph.addRelationship(rel);
      callEdges++;
    }
  }

  // ── Resolve heritage (EXTENDS/IMPLEMENTS) placeholders ──
  const heritageResolved = resolveHeritagePlaceholders(graph, symbolTable);

  // ── Resolve RENDERS placeholders ────────────────────────
  const rendersResolved = resolveRendersPlaceholders(graph, symbolTable);

  return { callEdges, heritageResolved, rendersResolved };
}

// ─── Import Map Builder ─────────────────────────────────────

function buildImportMaps(
  fileImports: Map<string, RawImport[]>,
  files: FileInfo[],
  graph: KnowledgeGraph,
  config: ProjectConfig,
): Map<string, ImportMap> {
  const result = new Map<string, ImportMap>();

  for (const [filePath, imports] of fileImports) {
    const importMap: ImportMap = new Map();

    for (const imp of imports) {
      // Find the resolved target file via IMPORTS edges in graph
      const sourceNodeId = `File:${filePath}`;
      const importEdges = graph.getOutgoing(sourceNodeId, ['IMPORTS']);

      // Find matching edge by import path
      let resolvedFile: string | null = null;
      for (const edge of importEdges) {
        const props = edge.properties as Record<string, unknown> | undefined;
        if (props?.importPath === imp.source) {
          // Extract file path from target node ID: "File:path/to/file.ts"
          resolvedFile = edge.targetId.replace(/^File:/, '');
          break;
        }
      }

      if (!resolvedFile) continue;

      for (const binding of imp.bindings) {
        const importBinding: ImportBinding = {
          localName: binding.local,
          sourceName: binding.imported,
          sourceFile: resolvedFile,
          isNamespace: imp.isNamespace,
        };
        importMap.set(binding.local, importBinding);
      }
    }

    result.set(filePath, importMap);
  }

  return result;
}

// ─── Call Target Resolution ─────────────────────────────────

function resolveCallTarget(
  call: RawCall,
  filePath: string,
  symbolTable: SymbolTable,
  importMap: ImportMap | undefined,
  graph: KnowledgeGraph,
): { targetId: string; confidence: number } | null {
  switch (call.kind) {
    case 'direct': {
      // Direct call: formatDate(...) → resolve function name
      const resolved = symbolTable.resolve(filePath, call.callee, importMap);
      if (resolved) {
        return { targetId: resolved.def.nodeId, confidence: resolved.confidence };
      }
      return null;
    }

    case 'construct': {
      // Constructor: new UserService(...) → resolve to class
      const resolved = symbolTable.resolve(filePath, call.callee, importMap);
      if (resolved) {
        return { targetId: resolved.def.nodeId, confidence: resolved.confidence };
      }
      return null;
    }

    case 'member': {
      if (!call.receiver || !call.method) return null;

      // Try to resolve the receiver type
      // 1. Check if receiver is a known class name (static-like call on instance variable)
      const receiverResolved = symbolTable.resolve(filePath, call.receiver, importMap);
      if (receiverResolved) {
        const ownerNodeId = receiverResolved.def.nodeId;
        // If receiver resolved to a class, look up the method on it
        if (receiverResolved.def.label === 'Class') {
          const methodDef = symbolTable.lookupMethodByOwner(ownerNodeId, call.method);
          if (methodDef) {
            return { targetId: methodDef.nodeId, confidence: receiverResolved.confidence * 0.9 };
          }
        }
      }

      // 2. Fuzzy match: look for any method with this name globally
      const globalMethods = symbolTable.lookupGlobal(call.method);
      const methods = globalMethods.filter(d => d.label === 'Method');
      if (methods.length === 1) {
        return { targetId: methods[0].nodeId, confidence: 0.40 };
      }

      return null;
    }

    case 'static': {
      if (!call.receiver || !call.method) return null;

      // Static call: User::find() or User.staticMethod()
      // Resolve the class
      const classDefs = symbolTable.lookupClassByName(call.receiver);
      if (classDefs.length === 1) {
        const methodDef = symbolTable.lookupMethodByOwner(classDefs[0].nodeId, call.method);
        if (methodDef) {
          return { targetId: methodDef.nodeId, confidence: 0.85 };
        }
        // Fallback to class itself
        return { targetId: classDefs[0].nodeId, confidence: 0.50 };
      }

      return null;
    }

    default:
      return null;
  }
}

// ─── Heritage Placeholder Resolution ────────────────────────

function resolveHeritagePlaceholders(
  graph: KnowledgeGraph,
  symbolTable: SymbolTable,
): number {
  let resolved = 0;
  const allRels = graph.getAllRelationships();

  for (const rel of allRels) {
    if ((rel.type !== 'EXTENDS' && rel.type !== 'IMPLEMENTS')) continue;

    // Check for placeholder target: "Class:?:SuperName" or "Interface:?:Name"
    const match = rel.targetId.match(/^(Class|Interface):\?:(.+)$/);
    if (!match) continue;

    const [, expectedLabel, targetName] = match;
    const cleanName = targetName.split('<')[0]; // Strip generics: BaseRepo<T> → BaseRepo

    // Try to find the actual target node
    let found: string | null = null;

    if (expectedLabel === 'Class') {
      const classDefs = symbolTable.lookupClassByName(cleanName);
      if (classDefs.length === 1) {
        found = classDefs[0].nodeId;
      } else if (classDefs.length > 1) {
        // Pick exported one
        const exported = classDefs.filter(d => d.isExported);
        if (exported.length === 1) found = exported[0].nodeId;
      }
    } else {
      // Interface
      const defs = symbolTable.lookupGlobal(cleanName);
      const ifaces = defs.filter(d => d.label === 'Interface');
      if (ifaces.length === 1) {
        found = ifaces[0].nodeId;
      }
    }

    if (found && graph.hasNode(found)) {
      // Create a new resolved relationship (we can't mutate the existing one's key,
      // but we can add a new correct one — the old placeholder stays but won't cause issues
      // since its targetId doesn't match any node)
      const newRel: GraphRelationship = {
        id: `${rel.type}:${rel.sourceId}->${found}`,
        sourceId: rel.sourceId,
        targetId: found,
        type: rel.type,
        confidence: rel.confidence,
        properties: { resolvedFrom: rel.targetId },
      };
      graph.addRelationship(newRel);
      resolved++;
    }
  }

  return resolved;
}

// ─── RENDERS Placeholder Resolution ─────────────────────────

function resolveRendersPlaceholders(
  graph: KnowledgeGraph,
  symbolTable: SymbolTable,
): number {
  let resolved = 0;
  const allRels = graph.getAllRelationships();

  for (const rel of allRels) {
    if (rel.type !== 'RENDERS') continue;

    // Check for placeholder: "Component:?:UserCard"
    const match = rel.targetId.match(/^Component:\?:(.+)$/);
    if (!match) continue;

    const targetName = match[1];

    // Look up the component in the symbol table
    const defs = symbolTable.lookupGlobal(targetName);
    const components = defs.filter(d => d.label === 'Component');

    let found: string | null = null;
    if (components.length === 1) {
      found = components[0].nodeId;
    } else if (components.length > 1) {
      const exported = components.filter(d => d.isExported);
      if (exported.length === 1) found = exported[0].nodeId;
    }

    if (found && graph.hasNode(found)) {
      const newRel: GraphRelationship = {
        id: `RENDERS:${rel.sourceId}->${found}`,
        sourceId: rel.sourceId,
        targetId: found,
        type: 'RENDERS',
        confidence: 0.85,
        properties: { resolvedFrom: rel.targetId },
      };
      graph.addRelationship(newRel);
      resolved++;
    }
  }

  return resolved;
}
