import { describe, it, expect } from 'vitest';
import { buildStructure } from '../../src/core/pipeline/structure-builder.js';
import { KnowledgeGraph } from '../../src/core/graph/graph.js';
import type { FileInfo } from '../../src/types/pipeline.js';

describe('Structure Builder', () => {
  it('should create File and Folder nodes with CONTAINS edges', () => {
    const files: FileInfo[] = [
      { path: 'src/utils/format.ts', absolutePath: '/p/src/utils/format.ts', language: 'typescript', size: 100, lastModified: 0 },
      { path: 'src/utils/parse.ts', absolutePath: '/p/src/utils/parse.ts', language: 'typescript', size: 200, lastModified: 0 },
      { path: 'src/app.ts', absolutePath: '/p/src/app.ts', language: 'typescript', size: 50, lastModified: 0 },
    ];

    const graph = new KnowledgeGraph();
    buildStructure(files, graph);

    // 3 files + 2 folders (src, src/utils)
    expect(graph.nodeCount).toBe(5);

    // Folder nodes
    expect(graph.getNode('Folder:src')).toBeDefined();
    expect(graph.getNode('Folder:src/utils')).toBeDefined();

    // File nodes
    expect(graph.getNode('File:src/app.ts')).toBeDefined();

    // CONTAINS: src → src/utils
    const srcOutgoing = graph.getOutgoing('Folder:src', ['CONTAINS']);
    const targets = srcOutgoing.map(r => r.targetId);
    expect(targets).toContain('Folder:src/utils');
    expect(targets).toContain('File:src/app.ts');

    // CONTAINS: src/utils → files
    const utilsOutgoing = graph.getOutgoing('Folder:src/utils', ['CONTAINS']);
    expect(utilsOutgoing).toHaveLength(2);
  });
});
