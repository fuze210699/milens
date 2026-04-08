import { Command } from 'commander';
import { resolve } from 'node:path';
import { SqliteAdapter } from '../storage/sqlite-adapter.js';
import { RepoManager } from '../storage/repo-manager.js';
import { detectChanges } from '../core/search/detect-changes.js';

export const changesCommand = new Command('changes')
  .description('Detect which symbols are affected by uncommitted changes')
  .argument('[path]', 'Repository path', '.')
  .option('-s, --scope <scope>', 'Change scope: staged, unstaged, all', 'all')
  .action(async (targetPath: string, options: { scope: string }) => {
    const rootPath = resolve(targetPath);
    const scope = options.scope as 'staged' | 'unstaged' | 'all';

    // Find database
    const manager = new RepoManager();
    const dbPath = manager.findDbPath(rootPath);
    if (!dbPath) {
      console.error('No analysis found. Run `milens analyze` first.');
      process.exit(1);
    }

    const db = new SqliteAdapter(dbPath);

    try {
      const result = detectChanges(rootPath, db, scope);

      if (result.changedFiles.length === 0) {
        console.log('No changes detected.');
        return;
      }

      console.log(`\n── Changed Files (${result.changedFiles.length}) ──`);
      for (const f of result.changedFiles) {
        console.log(`  ${f}`);
      }

      if (result.changedSymbols.length > 0) {
        console.log(`\n── Changed Symbols (${result.changedSymbols.length}) ──`);
        for (const s of result.changedSymbols) {
          const tag = s.changeType === 'added' ? '+' : s.changeType === 'deleted' ? '-' : '~';
          console.log(`  [${tag}] ${s.node.label}: ${s.node.name} (${s.filePath}:${s.node.startLine ?? '?'})`);
        }
      }

      if (result.affectedSymbols.length > 0) {
        console.log(`\n── Affected Symbols (${result.affectedSymbols.length}) ──`);
        for (const node of result.affectedSymbols) {
          console.log(`  ${node.label}: ${node.name} (${node.filePath}:${node.startLine ?? '?'})`);
        }
      }

      console.log('');
    } finally {
      db.close();
    }
  });
