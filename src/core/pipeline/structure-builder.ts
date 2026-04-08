import { dirname } from 'node:path';
import { KnowledgeGraph } from '../graph/graph.js';
import type { GraphNode, GraphRelationship } from '../../types/graph.js';
import type { FileInfo } from '../../types/pipeline.js';

export function buildStructure(files: FileInfo[], graph: KnowledgeGraph): void {
  const folders = new Set<string>();

  // Collect all unique folder paths
  for (const file of files) {
    let dir = dirname(file.path);
    while (dir && dir !== '.') {
      folders.add(dir);
      dir = dirname(dir);
    }
  }

  // Create Folder nodes
  for (const folderPath of folders) {
    const name = folderPath.split('/').pop() || folderPath;
    const node: GraphNode = {
      id: `Folder:${folderPath}`,
      label: 'Folder',
      name,
      filePath: folderPath,
    };
    graph.addNode(node);
  }

  // Create File nodes
  for (const file of files) {
    const name = file.path.split('/').pop() || file.path;
    const node: GraphNode = {
      id: `File:${file.path}`,
      label: 'File',
      name,
      filePath: file.path,
      properties: {
        language: file.language,
        size: file.size,
        lastModified: file.lastModified,
      },
    };
    graph.addNode(node);
  }

  // Create CONTAINS edges: Folder → Folder
  for (const folderPath of folders) {
    const parent = dirname(folderPath);
    if (parent && parent !== '.' && folders.has(parent)) {
      const rel: GraphRelationship = {
        id: `CONTAINS:Folder:${parent}->Folder:${folderPath}`,
        sourceId: `Folder:${parent}`,
        targetId: `Folder:${folderPath}`,
        type: 'CONTAINS',
        confidence: 1.0,
      };
      graph.addRelationship(rel);
    }
  }

  // Create CONTAINS edges: Folder → File
  for (const file of files) {
    const parent = dirname(file.path);
    if (parent && parent !== '.') {
      const rel: GraphRelationship = {
        id: `CONTAINS:Folder:${parent}->File:${file.path}`,
        sourceId: `Folder:${parent}`,
        targetId: `File:${file.path}`,
        type: 'CONTAINS',
        confidence: 1.0,
      };
      graph.addRelationship(rel);
    }
  }
}
