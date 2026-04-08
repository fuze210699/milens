// ─── Node Labels ─────────────────────────────────────────
export type NodeLabel =
  | 'File'
  | 'Folder'
  | 'Function'
  | 'Class'
  | 'Method'
  | 'Interface'
  | 'Property'
  | 'Component'
  | 'Route'
  | 'Module';

// ─── Relationship Types ──────────────────────────────────
export type RelationshipType =
  | 'CONTAINS'
  | 'DEFINES'
  | 'IMPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'HAS_METHOD'
  | 'HAS_PROPERTY'
  | 'RENDERS'
  | 'HANDLES_ROUTE';

// ─── Graph Node ──────────────────────────────────────────
export interface GraphNode {
  id: string;            // e.g. "Function:src/utils.ts:formatDate"
  label: NodeLabel;
  name: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  isExported?: boolean;
  properties?: Record<string, unknown>;
}

// ─── Graph Relationship ──────────────────────────────────
export interface GraphRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  confidence: number;
  reason?: string;
  properties?: Record<string, unknown>;
}

// ─── Query Results ───────────────────────────────────────
export interface QueryResult {
  node: GraphNode;
  score: number;
}

export interface ContextResult {
  symbol: GraphNode;
  callers: GraphRelationship[];
  callees: GraphRelationship[];
  importedBy: GraphRelationship[];
  imports: GraphRelationship[];
  extends: GraphRelationship[];
  implementedBy: GraphRelationship[];
  methods: GraphRelationship[];
  properties: GraphRelationship[];
  renderedBy: GraphRelationship[];
}

export interface ImpactAffected {
  node: GraphNode;
  depth: number;
  paths: string[][];
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ImpactResult {
  target: GraphNode;
  riskLevel: RiskLevel;
  affected: Map<number, ImpactAffected[]>;  // depth → affected nodes
  totalAffected: number;
}

// ─── Detect Changes ──────────────────────────────────────
export interface ChangedSymbol {
  node: GraphNode;
  changeType: 'modified' | 'added' | 'deleted';
  filePath: string;
}

export interface DetectChangesResult {
  changedFiles: string[];
  changedSymbols: ChangedSymbol[];
  affectedSymbols: GraphNode[];   // symbols impacted by the changes (upstream)
}
