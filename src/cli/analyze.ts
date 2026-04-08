import { resolve } from 'node:path';
import { runPipeline } from '../core/pipeline/pipeline.js';
import { RepoManager } from '../storage/repo-manager.js';

interface AnalyzeOptions {
  path: string;
  output?: string;
  verbose?: boolean;
}

export async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  const rootPath = resolve(options.path);

  console.log(`\nMilens — Analyzing: ${rootPath}\n`);

  const stats = await runPipeline({
    rootPath,
    outputDir: options.output,
    verbose: options.verbose ?? true,
  });

  // Register repo
  const manager = new RepoManager();
  manager.register({
    rootPath,
    dbPath: resolve(rootPath, options.output ?? '.milens', 'db.sqlite'),
    indexedAt: new Date().toISOString(),
    fileCount: stats.totalFiles,
    nodeCount: stats.totalSymbols + stats.totalFiles,
  });

  // Summary
  console.log('\n── Summary ──────────────────────────────────');
  console.log(`  Files:          ${stats.totalFiles}`);
  console.log(`  Symbols:        ${stats.totalSymbols}`);
  console.log(`  Relationships:  ${stats.totalRelationships}`);
  console.log(`  Parse errors:   ${stats.parseErrors}`);
  console.log(`  Duration:       ${stats.duration.toFixed(0)}ms`);
  console.log('  Languages:');
  for (const [lang, count] of Object.entries(stats.byLanguage)) {
    console.log(`    ${lang}: ${count}`);
  }
  console.log('─────────────────────────────────────────────\n');
}
