import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from '../../src/core/graph/graph.js';

describe('KnowledgeGraph', () => {
  it('should add and retrieve nodes', () => {
    const g = new KnowledgeGraph();
    g.addNode({ id: 'File:src/app.ts', label: 'File', name: 'app.ts', filePath: 'src/app.ts' });
    g.addNode({ id: 'Function:src/app.ts:main', label: 'Function', name: 'main', filePath: 'src/app.ts' });

    expect(g.nodeCount).toBe(2);
    expect(g.getNode('File:src/app.ts')?.name).toBe('app.ts');
    expect(g.getNodesByLabel('Function')).toHaveLength(1);
  });

  it('should add and traverse relationships', () => {
    const g = new KnowledgeGraph();
    g.addNode({ id: 'File:a.ts', label: 'File', name: 'a.ts' });
    g.addNode({ id: 'Function:a.ts:foo', label: 'Function', name: 'foo' });
    g.addNode({ id: 'Function:a.ts:bar', label: 'Function', name: 'bar' });

    g.addRelationship({
      id: 'DEFINES:File:a.ts->Function:a.ts:foo',
      sourceId: 'File:a.ts',
      targetId: 'Function:a.ts:foo',
      type: 'DEFINES',
      confidence: 1.0,
    });
    g.addRelationship({
      id: 'CALLS:Function:a.ts:foo->Function:a.ts:bar',
      sourceId: 'Function:a.ts:foo',
      targetId: 'Function:a.ts:bar',
      type: 'CALLS',
      confidence: 0.9,
    });

    expect(g.relationshipCount).toBe(2);
    expect(g.getOutgoing('Function:a.ts:foo', ['CALLS'])).toHaveLength(1);
    expect(g.getIncoming('Function:a.ts:bar', ['CALLS'])).toHaveLength(1);
    expect(g.getNeighbors('Function:a.ts:foo')).toHaveLength(2); // File:a.ts (incoming DEFINES) + bar (outgoing CALLS)
  });
});
