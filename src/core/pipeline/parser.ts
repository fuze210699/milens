import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KnowledgeGraph } from '../graph/graph.js';
import { SymbolTable } from '../symbols/symbol-table.js';
import { parseSource } from '../tree-sitter/loader.js';
import { javascriptProvider, typescriptProvider, vueProvider, phpProvider } from '../parsers/index.js';
import type { LanguageProvider, ParsedSymbols, RawImport, RawCall } from '../parsers/provider.js';
import type { FileInfo, SupportedLanguage } from '../../types/pipeline.js';

const PROVIDERS: Record<SupportedLanguage, LanguageProvider> = {
  javascript: javascriptProvider,
  typescript: typescriptProvider,
  vue: vueProvider,
  php: phpProvider,
};

// Map file extension to tree-sitter language id
function getTreeSitterLang(file: FileInfo): string {
  const ext = file.path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx': return 'tsx';
    case 'ts': return 'typescript';
    case 'jsx':
    case 'js':
    case 'mjs':
    case 'cjs': return 'javascript';
    case 'php': return 'php';
    case 'vue': return 'typescript'; // We parse the <script> block
    default: return 'javascript';
  }
}

export interface ParseResult {
  symbolCount: number;
  parseErrors: number;
  /** filePath → RawImport[] for import resolution phase */
  fileImports: Map<string, RawImport[]>;
  /** filePath → RawCall[] for call resolution phase */
  fileCalls: Map<string, RawCall[]>;
}

export async function parseFiles(
  files: FileInfo[],
  rootPath: string,
  graph: KnowledgeGraph,
  symbolTable: SymbolTable,
): Promise<ParseResult> {
  let symbolCount = 0;
  let parseErrors = 0;
  const fileImports = new Map<string, RawImport[]>();
  const fileCalls = new Map<string, RawCall[]>();

  for (const file of files) {
    const provider = PROVIDERS[file.language];
    if (!provider) continue;

    try {
      const source = readFileSync(file.absolutePath, 'utf-8');

      // For Vue files, extract the <script> block and parse that
      let parseableSource = source;
      let treeSitterLang = getTreeSitterLang(file);

      if (file.language === 'vue') {
        // Vue provider will handle script extraction internally.
        // We still parse the script content for the tree.
        const scriptMatch = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
          parseableSource = scriptMatch[1];
          const attrs = source.match(/<script\b([^>]*)>/i)?.[1] ?? '';
          treeSitterLang = /\blang\s*=\s*["']?(ts|typescript)/.test(attrs) ? 'typescript' : 'javascript';
        } else {
          // No script block, just create the component node
          const parsed = provider.extract(source, file.path, { rootNode: { childCount: 0, child: () => null, namedChildCount: 0, namedChild: () => null, type: 'program' } });
          addParsedToGraph(parsed, file.path, graph, symbolTable);
          symbolCount += parsed.nodes.length;
          fileImports.set(file.path, parsed.imports);
          fileCalls.set(file.path, parsed.calls);
          continue;
        }
      }

      // Parse with tree-sitter
      const tree = await parseSource(parseableSource, treeSitterLang);
      const parsed = provider.extract(source, file.path, tree);

      // Add to graph + symbol table
      addParsedToGraph(parsed, file.path, graph, symbolTable);
      symbolCount += parsed.nodes.length;
      fileImports.set(file.path, parsed.imports);
      fileCalls.set(file.path, parsed.calls);

    } catch (err) {
      parseErrors++;
      // Continue with other files
    }
  }

  return { symbolCount, parseErrors, fileImports, fileCalls };
}

function addParsedToGraph(
  parsed: ParsedSymbols,
  filePath: string,
  graph: KnowledgeGraph,
  symbolTable: SymbolTable,
): void {
  // Add nodes
  for (const node of parsed.nodes) {
    graph.addNode(node);
    symbolTable.add({
      nodeId: node.id,
      name: node.name,
      filePath,
      label: node.label,
      isExported: node.isExported ?? false,
      parameterCount: (node.properties as any)?.parameterCount,
    });
  }

  // Add relationships
  for (const rel of parsed.relationships) {
    graph.addRelationship(rel);
  }
}
