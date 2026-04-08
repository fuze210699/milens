import type { GraphNode, GraphRelationship, NodeLabel, RelationshipType } from '../../types/graph.js';

export class KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private relationships = new Map<string, GraphRelationship>();

  // Adjacency indexes
  private outgoing = new Map<string, Set<string>>();  // nodeId → Set<relId>
  private incoming = new Map<string, Set<string>>();   // nodeId → Set<relId>

  // ─── Node Operations ────────────────────────────────────

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  getNodesByLabel(label: NodeLabel): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.label === label) result.push(node);
    }
    return result;
  }

  getNodesByFile(filePath: string): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.filePath === filePath) result.push(node);
    }
    return result;
  }

  getAllNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  // ─── Relationship Operations ─────────────────────────────

  addRelationship(rel: GraphRelationship): void {
    this.relationships.set(rel.id, rel);

    if (!this.outgoing.has(rel.sourceId)) {
      this.outgoing.set(rel.sourceId, new Set());
    }
    this.outgoing.get(rel.sourceId)!.add(rel.id);

    if (!this.incoming.has(rel.targetId)) {
      this.incoming.set(rel.targetId, new Set());
    }
    this.incoming.get(rel.targetId)!.add(rel.id);
  }

  getRelationship(id: string): GraphRelationship | undefined {
    return this.relationships.get(id);
  }

  removeRelationship(id: string): boolean {
    const rel = this.relationships.get(id);
    if (!rel) return false;
    this.relationships.delete(id);
    this.outgoing.get(rel.sourceId)?.delete(id);
    this.incoming.get(rel.targetId)?.delete(id);
    return true;
  }

  getAllRelationships(): GraphRelationship[] {
    return [...this.relationships.values()];
  }

  get relationshipCount(): number {
    return this.relationships.size;
  }

  // ─── Traversal ───────────────────────────────────────────

  getOutgoing(nodeId: string, types?: RelationshipType[]): GraphRelationship[] {
    const relIds = this.outgoing.get(nodeId);
    if (!relIds) return [];
    const result: GraphRelationship[] = [];
    for (const relId of relIds) {
      const rel = this.relationships.get(relId)!;
      if (!types || types.includes(rel.type)) {
        result.push(rel);
      }
    }
    return result;
  }

  getIncoming(nodeId: string, types?: RelationshipType[]): GraphRelationship[] {
    const relIds = this.incoming.get(nodeId);
    if (!relIds) return [];
    const result: GraphRelationship[] = [];
    for (const relId of relIds) {
      const rel = this.relationships.get(relId)!;
      if (!types || types.includes(rel.type)) {
        result.push(rel);
      }
    }
    return result;
  }

  getNeighbors(nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): GraphNode[] {
    const neighborIds = new Set<string>();

    if (direction === 'outgoing' || direction === 'both') {
      for (const rel of this.getOutgoing(nodeId)) {
        neighborIds.add(rel.targetId);
      }
    }
    if (direction === 'incoming' || direction === 'both') {
      for (const rel of this.getIncoming(nodeId)) {
        neighborIds.add(rel.sourceId);
      }
    }

    return [...neighborIds]
      .map(id => this.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);
  }

  // ─── Utilities ───────────────────────────────────────────

  clear(): void {
    this.nodes.clear();
    this.relationships.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }
}
