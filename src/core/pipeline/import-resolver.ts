import { KnowledgeGraph } from '../graph/graph.js';
import { javascriptProvider, typescriptProvider, vueProvider, phpProvider } from '../parsers/index.js';
import type { LanguageProvider, RawImport } from '../parsers/provider.js';
import type { FileInfo, ProjectConfig, SupportedLanguage } from '../../types/pipeline.js';
import type { GraphRelationship } from '../../types/graph.js';

const PROVIDERS: Record<SupportedLanguage, LanguageProvider> = {
  javascript: javascriptProvider,
  typescript: typescriptProvider,
  vue: vueProvider,
  php: phpProvider,
};

export function resolveImports(
  fileImports: Map<string, RawImport[]>,
  files: FileInfo[],
  graph: KnowledgeGraph,
  config: ProjectConfig,
): number {
  const fileLanguageMap = new Map<string, SupportedLanguage>();
  for (const f of files) {
    fileLanguageMap.set(f.path, f.language);
  }

  // Set of known file paths in the project
  const knownFiles = new Set(files.map(f => f.path));

  let importCount = 0;

  for (const [filePath, imports] of fileImports) {
    const language = fileLanguageMap.get(filePath);
    if (!language) continue;
    const provider = PROVIDERS[language];

    for (const imp of imports) {
      const resolvedPath = provider.resolveImport(imp.source, filePath, config);
      if (!resolvedPath) continue;

      // Normalize path
      const normalizedPath = resolvedPath.replace(/\\/g, '/');
      if (!knownFiles.has(normalizedPath)) continue;

      const sourceNodeId = `File:${filePath}`;
      const targetNodeId = `File:${normalizedPath}`;

      // Skip self-imports
      if (sourceNodeId === targetNodeId) continue;

      // Check both nodes exist
      if (!graph.hasNode(sourceNodeId) || !graph.hasNode(targetNodeId)) continue;

      const relId = `IMPORTS:${sourceNodeId}->${targetNodeId}`;

      // Avoid duplicate edges
      const existing = graph.getRelationship(relId);
      if (existing) continue;

      const rel: GraphRelationship = {
        id: relId,
        sourceId: sourceNodeId,
        targetId: targetNodeId,
        type: 'IMPORTS',
        confidence: 0.95,
        properties: {
          importPath: imp.source,
          bindings: imp.bindings.map(b => `${b.local}:${b.imported}`),
        },
      };
      graph.addRelationship(rel);
      importCount++;
    }
  }

  return importCount;
}
