import { KnowledgeGraph } from '../graph/graph.js';

export interface PostProcessResult {
  removedPlaceholders: number;
}

/**
 * Phase 6: Post-process the graph before persistence.
 * - Remove unresolved placeholder relationships (targets that don't exist as nodes)
 * - Future: compute metrics, mark unreachable nodes, etc.
 */
export function postProcess(graph: KnowledgeGraph): PostProcessResult {
  let removedPlaceholders = 0;

  // Remove relationships whose target doesn't exist as a real node
  // (e.g. "Class:?:SomeExternalClass", "Component:?:UnknownComponent")
  const allRels = graph.getAllRelationships();
  for (const rel of allRels) {
    if (rel.targetId.includes(':?:')) {
      graph.removeRelationship(rel.id);
      removedPlaceholders++;
    }
  }

  return { removedPlaceholders };
}
