import { resolve, join } from 'node:path';
import { SqliteAdapter } from '../storage/sqlite-adapter.js';
import { RepoManager } from '../storage/repo-manager.js';

interface QueryOptions {
  limit: string;
  path: string;
}

export async function queryCommand(search: string, options: QueryOptions): Promise<void> {
  const rootPath = resolve(options.path);
  const manager = new RepoManager();
  const dbPath = manager.findDbPath(rootPath);

  if (!dbPath) {
    console.error(`No index found for ${rootPath}. Run 'milens analyze' first.`);
    process.exit(1);
  }

  const db = new SqliteAdapter(dbPath);
  const results = db.search(search, parseInt(options.limit, 10));

  if (results.length === 0) {
    console.log(`No results for "${search}"`);
  } else {
    console.log(`\nFound ${results.length} results for "${search}":\n`);
    for (const { node, score } of results) {
      const loc = node.startLine ? `:${node.startLine}` : '';
      console.log(`  [${node.label}] ${node.name}  — ${node.filePath ?? ''}${loc}  (score: ${score.toFixed(2)})`);
    }
    console.log('');
  }

  db.close();
}
