import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve, join } from 'node:path';
import { SqliteAdapter } from '../storage/sqlite-adapter.js';
import { RepoManager } from '../storage/repo-manager.js';
import { detectChanges } from '../core/search/detect-changes.js';
import type { GraphNode, GraphRelationship } from '../types/graph.js';

function openDb(rootPath?: string): { db: SqliteAdapter; rootPath: string } {
  const manager = new RepoManager();

  // Try to find database
  const resolvedPath = resolve(rootPath ?? '.');
  const dbPath = manager.findDbPath(resolvedPath);
  if (!dbPath) {
    throw new Error(`No analysis found for ${resolvedPath}. Run \`milens analyze\` first.`);
  }

  return { db: new SqliteAdapter(dbPath), rootPath: resolvedPath };
}

function formatNode(node: GraphNode): string {
  const loc = node.filePath ? `${node.filePath}:${node.startLine ?? '?'}` : '';
  return `${node.label}: ${node.name}${loc ? ` (${loc})` : ''}`;
}

function formatRelationship(rel: GraphRelationship, db: SqliteAdapter): string {
  const source = db.getNode(rel.sourceId);
  const target = db.getNode(rel.targetId);
  return `${source?.name ?? rel.sourceId} -[${rel.type}]-> ${target?.name ?? rel.targetId}`;
}

export async function startMcpServer(rootPath?: string): Promise<void> {
  const server = new McpServer(
    { name: 'milens', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ─── Tool: query ──────────────────────────────────────
  server.tool(
    'query',
    'Search symbols by name or concept in the codebase knowledge graph',
    {
      query: z.string().describe('Search term'),
      limit: z.number().optional().default(20).describe('Max results'),
    },
    async ({ query, limit }) => {
      const { db } = openDb(rootPath);
      try {
        const results = db.search(query, limit);
        const text = results.length === 0
          ? 'No symbols found.'
          : results.map(r => `[${r.score.toFixed(2)}] ${formatNode(r.node)}`).join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      } finally {
        db.close();
      }
    },
  );

  // ─── Tool: context ────────────────────────────────────
  server.tool(
    'context',
    'Get full 360° context of a symbol: callers, callees, imports, relationships',
    {
      name: z.string().describe('Symbol name to look up'),
    },
    async ({ name }) => {
      const { db } = openDb(rootPath);
      try {
        // Search for the symbol
        const results = db.search(name, 5);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `Symbol "${name}" not found.` }] };
        }

        const node = results[0].node;
        const outgoing = db.getOutgoing(node.id);
        const incoming = db.getIncoming(node.id);

        const lines: string[] = [];
        lines.push(`── ${formatNode(node)} ──`);
        lines.push('');

        // Group relationships
        const groups: Record<string, { dir: string; rels: GraphRelationship[] }> = {};
        for (const rel of outgoing) {
          const key = `${rel.type} (outgoing)`;
          if (!groups[key]) groups[key] = { dir: 'outgoing', rels: [] };
          groups[key].rels.push(rel);
        }
        for (const rel of incoming) {
          const key = `${rel.type} (incoming)`;
          if (!groups[key]) groups[key] = { dir: 'incoming', rels: [] };
          groups[key].rels.push(rel);
        }

        for (const [groupName, group] of Object.entries(groups)) {
          lines.push(`${groupName}:`);
          for (const rel of group.rels) {
            lines.push(`  ${formatRelationship(rel, db)}`);
          }
          lines.push('');
        }

        if (Object.keys(groups).length === 0) {
          lines.push('No relationships found.');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } finally {
        db.close();
      }
    },
  );

  // ─── Tool: impact ─────────────────────────────────────
  server.tool(
    'impact',
    'Analyze blast radius of changing a symbol — who depends on it?',
    {
      target: z.string().describe('Symbol name to analyze'),
      direction: z.enum(['upstream', 'downstream']).optional().default('upstream')
        .describe('upstream = who calls me?, downstream = what do I call?'),
      depth: z.number().optional().default(3).describe('Max traversal depth'),
    },
    async ({ target, direction, depth }) => {
      const { db } = openDb(rootPath);
      try {
        const results = db.search(target, 1);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `Symbol "${target}" not found.` }] };
        }

        const targetNode = results[0].node;
        const affected = new Map<string, { node: GraphNode; depth: number }>();
        const queue: Array<{ nodeId: string; d: number }> = [{ nodeId: targetNode.id, d: 0 }];
        const visited = new Set<string>();
        visited.add(targetNode.id);

        while (queue.length > 0) {
          const { nodeId, d } = queue.shift()!;
          if (d >= depth) continue;

          const edges = direction === 'upstream'
            ? db.getIncoming(nodeId, ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS'])
            : db.getOutgoing(nodeId, ['CALLS', 'IMPORTS']);

          for (const edge of edges) {
            const nextId = direction === 'upstream' ? edge.sourceId : edge.targetId;
            if (visited.has(nextId)) continue;
            visited.add(nextId);

            const nextNode = db.getNode(nextId);
            if (nextNode) {
              affected.set(nextId, { node: nextNode, depth: d + 1 });
              queue.push({ nodeId: nextId, d: d + 1 });
            }
          }
        }

        const lines: string[] = [];
        lines.push(`── Impact: ${formatNode(targetNode)} (${direction}) ──`);
        lines.push(`Total affected: ${affected.size}`);
        lines.push('');

        // Group by depth
        const byDepth = new Map<number, GraphNode[]>();
        for (const [, info] of affected) {
          if (!byDepth.has(info.depth)) byDepth.set(info.depth, []);
          byDepth.get(info.depth)!.push(info.node);
        }

        const depthLabels = ['', 'WILL BREAK', 'LIKELY AFFECTED', 'MAY NEED TESTING'];
        for (const [d, nodes] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
          lines.push(`Depth ${d} (${depthLabels[d] ?? 'DISTANT'}):`);
          for (const n of nodes) {
            lines.push(`  ${formatNode(n)}`);
          }
          lines.push('');
        }

        // Risk level
        let risk = 'LOW';
        if (affected.size > 20) risk = 'CRITICAL';
        else if (affected.size > 10) risk = 'HIGH';
        else if (affected.size > 3) risk = 'MEDIUM';
        lines.push(`Risk: ${risk}`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } finally {
        db.close();
      }
    },
  );

  // ─── Tool: detect_changes ─────────────────────────────
  server.tool(
    'detect_changes',
    'Map git diff to affected symbols — find what changed and what depends on it',
    {
      scope: z.enum(['staged', 'unstaged', 'all']).optional().default('all')
        .describe('Which changes to analyze'),
    },
    async ({ scope }) => {
      const { db, rootPath: rp } = openDb(rootPath);
      try {
        const result = detectChanges(rp, db, scope);

        const lines: string[] = [];

        if (result.changedFiles.length === 0) {
          return { content: [{ type: 'text', text: 'No changes detected.' }] };
        }

        lines.push(`Changed files: ${result.changedFiles.length}`);
        for (const f of result.changedFiles) {
          lines.push(`  ${f}`);
        }
        lines.push('');

        if (result.changedSymbols.length > 0) {
          lines.push(`Changed symbols: ${result.changedSymbols.length}`);
          for (const s of result.changedSymbols) {
            const tag = s.changeType === 'added' ? '+' : s.changeType === 'deleted' ? '-' : '~';
            lines.push(`  [${tag}] ${formatNode(s.node)}`);
          }
          lines.push('');
        }

        if (result.affectedSymbols.length > 0) {
          lines.push(`Affected symbols (dependencies): ${result.affectedSymbols.length}`);
          for (const n of result.affectedSymbols) {
            lines.push(`  ${formatNode(n)}`);
          }
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } finally {
        db.close();
      }
    },
  );

  // ─── Resource: repo-info ──────────────────────────────
  server.resource(
    'repo-info',
    'milens://repo-info',
    { description: 'Information about the analyzed repository' },
    async () => {
      const { db } = openDb(rootPath);
      try {
        const stats = db.stats();
        const indexedAt = db.getMetadata('indexed_at') ?? 'unknown';
        const rootPathMeta = db.getMetadata('root_path') ?? 'unknown';

        const text = [
          `Root: ${rootPathMeta}`,
          `Indexed at: ${indexedAt}`,
          `Nodes: ${stats.nodes}`,
          `Relationships: ${stats.relationships}`,
        ].join('\n');

        return { contents: [{ uri: 'milens://repo-info', text, mimeType: 'text/plain' }] };
      } finally {
        db.close();
      }
    },
  );

  // ─── Connect via stdio ────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
