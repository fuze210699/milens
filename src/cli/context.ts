import { resolve } from 'node:path';
import { SqliteAdapter } from '../storage/sqlite-adapter.js';
import { RepoManager } from '../storage/repo-manager.js';

interface ContextOptions {
  path: string;
}

export async function contextCommand(symbolName: string, options: ContextOptions): Promise<void> {
  const rootPath = resolve(options.path);
  const manager = new RepoManager();
  const dbPath = manager.findDbPath(rootPath);

  if (!dbPath) {
    console.error(`No index found for ${rootPath}. Run 'milens analyze' first.`);
    process.exit(1);
  }

  const db = new SqliteAdapter(dbPath);

  // Find the symbol via search
  const results = db.search(symbolName, 5);
  if (results.length === 0) {
    console.log(`Symbol "${symbolName}" not found.`);
    db.close();
    return;
  }

  const symbol = results[0].node;
  console.log(`\n── Context: ${symbol.label} "${symbol.name}" ──`);
  console.log(`  File: ${symbol.filePath ?? 'N/A'}`);
  if (symbol.startLine) console.log(`  Lines: ${symbol.startLine}–${symbol.endLine ?? '?'}`);
  console.log(`  Exported: ${symbol.isExported ? 'yes' : 'no'}`);

  // Incoming relationships
  const incoming = db.getIncoming(symbol.id);
  if (incoming.length > 0) {
    console.log('\n  ← Incoming:');
    for (const rel of incoming) {
      const source = db.getNode(rel.sourceId);
      console.log(`    [${rel.type}] from ${source?.label}:${source?.name ?? rel.sourceId} (confidence: ${rel.confidence})`);
    }
  }

  // Outgoing relationships
  const outgoing = db.getOutgoing(symbol.id);
  if (outgoing.length > 0) {
    console.log('\n  → Outgoing:');
    for (const rel of outgoing) {
      const target = db.getNode(rel.targetId);
      console.log(`    [${rel.type}] to ${target?.label}:${target?.name ?? rel.targetId} (confidence: ${rel.confidence})`);
    }
  }

  if (incoming.length === 0 && outgoing.length === 0) {
    console.log('\n  No relationships found.');
  }

  console.log('');
  db.close();
}
