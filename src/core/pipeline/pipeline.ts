import { join, resolve } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { KnowledgeGraph } from '../graph/graph.js';
import { SymbolTable } from '../symbols/symbol-table.js';
import { SqliteAdapter } from '../../storage/sqlite-adapter.js';
import { scan } from './scanner.js';
import { buildStructure } from './structure-builder.js';
import { parseFiles } from './parser.js';
import { resolveImports } from './import-resolver.js';
import { resolveCalls } from './call-resolver.js';
import { postProcess } from './post-process.js';
import type { PipelineOptions, PipelineStats, ProjectConfig } from '../../types/pipeline.js';

function loadProjectConfig(rootPath: string): ProjectConfig {
  const config: ProjectConfig = { rootPath, aliases: {}, psr4: {} };

  // Try tsconfig.json for aliases
  const tsconfigPath = join(rootPath, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    try {
      const raw = readFileSync(tsconfigPath, 'utf-8');
      // Strip comments for JSON.parse
      const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const tsconfig = JSON.parse(cleaned);
      const paths = tsconfig.compilerOptions?.paths ?? {};
      for (const [alias, targets] of Object.entries(paths)) {
        const cleanAlias = alias.replace('/*', '');
        const target = (targets as string[])[0]?.replace('/*', '').replace('./', '') ?? '';
        if (cleanAlias && target) {
          config.aliases[cleanAlias] = target;
        }
      }
    } catch { /* ignore */ }
  }

  // Try vite.config for aliases
  // (simplified: just check for @ → src which is the most common)
  if (!config.aliases['@']) {
    const vitePath = join(rootPath, 'vite.config.ts');
    if (existsSync(vitePath)) {
      config.aliases['@'] = 'src';
    }
  }

  // Try composer.json for PSR-4
  const composerPath = join(rootPath, 'composer.json');
  if (existsSync(composerPath)) {
    try {
      const composer = JSON.parse(readFileSync(composerPath, 'utf-8'));
      const psr4 = composer.autoload?.['psr-4'] ?? {};
      for (const [ns, dir] of Object.entries(psr4)) {
        config.psr4[ns as string] = (dir as string).replace(/\/$/, '');
      }
      const psr4Dev = composer['autoload-dev']?.['psr-4'] ?? {};
      for (const [ns, dir] of Object.entries(psr4Dev)) {
        config.psr4[ns as string] = (dir as string).replace(/\/$/, '');
      }
    } catch { /* ignore */ }
  }

  return config;
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineStats> {
  const start = performance.now();
  const rootPath = resolve(options.rootPath);
  const outputDir = options.outputDir ?? join(rootPath, '.milens');

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  const log = options.verbose ? console.log.bind(console) : () => {};

  // Load project config (aliases, PSR-4, etc.)
  const projectConfig = loadProjectConfig(rootPath);

  // ─── Phase 1: Scan ──────────────────────────────────────
  log('[1/6] Scanning files...');
  const scanResult = await scan(rootPath, options.exclude);
  log(`  Found ${scanResult.files.length} files (${scanResult.duration.toFixed(0)}ms)`);

  // ─── Phase 2: Structure ──────────────────────────────────
  log('[2/6] Building structure...');
  const graph = new KnowledgeGraph();
  buildStructure(scanResult.files, graph);
  log(`  ${graph.nodeCount} nodes, ${graph.relationshipCount} relationships`);

  // ─── Phase 3: Parse ──────────────────────────────────────
  log('[3/6] Parsing symbols...');
  const symbolTable = new SymbolTable();
  const parseResult = await parseFiles(scanResult.files, rootPath, graph, symbolTable);
  log(`  ${parseResult.symbolCount} symbols extracted (${parseResult.parseErrors} errors)`);

  // ─── Phase 4: Import Resolution ──────────────────────────
  log('[4/6] Resolving imports...');
  const importCount = resolveImports(parseResult.fileImports, scanResult.files, graph, projectConfig);
  log(`  ${importCount} import edges resolved`);

  // ─── Phase 5: Call Resolution ─────────────────────────────
  log('[5/6] Resolving calls...');
  const callResult = resolveCalls(
    parseResult.fileCalls,
    parseResult.fileImports,
    scanResult.files,
    graph,
    symbolTable,
    projectConfig,
  );
  log(`  ${callResult.callEdges} call edges, ${callResult.heritageResolved} heritage resolved, ${callResult.rendersResolved} renders resolved`);

  // ─── Phase 6: Post-process & Persist ────────────────────
  log('[6/6] Post-processing & persisting...');
  const ppResult = postProcess(graph);
  log(`  Removed ${ppResult.removedPlaceholders} unresolved placeholders`);
  const dbPath = join(outputDir, 'db.sqlite');
  const db = new SqliteAdapter(dbPath);
  db.clear();
  db.insertNodes(graph.getAllNodes());
  db.insertRelationships(graph.getAllRelationships());

  // Save metadata
  const now = new Date().toISOString();
  db.setMetadata('indexed_at', now);
  db.setMetadata('root_path', rootPath);
  db.setMetadata('file_count', String(scanResult.files.length));
  db.setMetadata('symbol_count', String(parseResult.symbolCount));
  db.setMetadata('node_count', String(graph.nodeCount));
  db.setMetadata('relationship_count', String(graph.relationshipCount));

  // Language breakdown
  const byLanguage: Record<string, number> = {};
  for (const f of scanResult.files) {
    byLanguage[f.language] = (byLanguage[f.language] ?? 0) + 1;
  }

  db.close();

  const duration = performance.now() - start;
  log(`\nDone in ${duration.toFixed(0)}ms`);

  return {
    totalFiles: scanResult.files.length,
    totalSymbols: parseResult.symbolCount,
    totalRelationships: graph.relationshipCount,
    parseErrors: parseResult.parseErrors,
    duration,
    byLanguage,
  };
}
