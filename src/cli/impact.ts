import { resolve } from 'node:path';
import { SqliteAdapter } from '../storage/sqlite-adapter.js';
import { RepoManager } from '../storage/repo-manager.js';
import type { RiskLevel } from '../types/graph.js';

interface ImpactOptions {
  direction: 'upstream' | 'downstream';
  depth: string;
  path: string;
}

export async function impactCommand(symbolName: string, options: ImpactOptions): Promise<void> {
  const rootPath = resolve(options.path);
  const manager = new RepoManager();
  const dbPath = manager.findDbPath(rootPath);

  if (!dbPath) {
    console.error(`No index found for ${rootPath}. Run 'milens analyze' first.`);
    process.exit(1);
  }

  const db = new SqliteAdapter(dbPath);
  const maxDepth = parseInt(options.depth, 10);

  // Find symbol
  const results = db.search(symbolName, 5);
  if (results.length === 0) {
    console.log(`Symbol "${symbolName}" not found.`);
    db.close();
    return;
  }

  const target = results[0].node;
  console.log(`\n── Impact Analysis: ${target.label} "${target.name}" ──`);
  console.log(`  Direction: ${options.direction}`);
  console.log(`  Max depth: ${maxDepth}\n`);

  // BFS traversal
  const affected = new Map<string, { depth: number; name: string; label: string }>();
  const edgeTypes = options.direction === 'upstream'
    ? ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS']
    : ['CALLS', 'IMPORTS'];

  const queue: Array<{ nodeId: string; depth: number }> = [
    { nodeId: target.id, depth: 0 },
  ];
  const visited = new Set<string>([target.id]);

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const edges = options.direction === 'upstream'
      ? db.getIncoming(nodeId, edgeTypes)
      : db.getOutgoing(nodeId, edgeTypes);

    for (const edge of edges) {
      const nextId = options.direction === 'upstream' ? edge.sourceId : edge.targetId;
      if (visited.has(nextId)) continue;
      visited.add(nextId);

      const nextNode = db.getNode(nextId);
      affected.set(nextId, {
        depth: depth + 1,
        name: nextNode?.name ?? nextId,
        label: nextNode?.label ?? '?',
      });
      queue.push({ nodeId: nextId, depth: depth + 1 });
    }
  }

  // Output results
  const total = affected.size;
  const risk = calculateRisk(total);
  console.log(`  Risk level: ${risk}`);
  console.log(`  Total affected: ${total}\n`);

  // Group by depth
  for (let d = 1; d <= maxDepth; d++) {
    const atDepth = [...affected.values()].filter(a => a.depth === d);
    if (atDepth.length === 0) continue;

    const label = d === 1 ? 'WILL BREAK' : d === 2 ? 'LIKELY AFFECTED' : 'MAY NEED TESTING';
    console.log(`  Depth ${d} (${label}):`);
    for (const a of atDepth) {
      console.log(`    [${a.label}] ${a.name}`);
    }
  }

  console.log('');
  db.close();
}

function calculateRisk(affectedCount: number): RiskLevel {
  if (affectedCount === 0) return 'LOW';
  if (affectedCount <= 5) return 'MEDIUM';
  if (affectedCount <= 20) return 'HIGH';
  return 'CRITICAL';
}
