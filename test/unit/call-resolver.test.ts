import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KnowledgeGraph } from '../../src/core/graph/graph.js';
import { SymbolTable } from '../../src/core/symbols/symbol-table.js';
import { parseSource } from '../../src/core/tree-sitter/loader.js';
import { typescriptProvider } from '../../src/core/parsers/javascript.js';
import { resolveCalls } from '../../src/core/pipeline/call-resolver.js';
import { postProcess } from '../../src/core/pipeline/post-process.js';
import type { RawImport, RawCall } from '../../src/core/parsers/provider.js';
import type { FileInfo, ProjectConfig } from '../../src/types/pipeline.js';
import type { GraphNode, GraphRelationship } from '../../src/types/graph.js';

const FIXTURES = join(import.meta.dirname, '../fixtures/sample-ts/src');

const config: ProjectConfig = {
  rootPath: join(import.meta.dirname, '../fixtures/sample-ts'),
  aliases: {},
  psr4: {},
};

describe('call-resolver', () => {
  let graph: KnowledgeGraph;
  let symbolTable: SymbolTable;
  let fileImports: Map<string, RawImport[]>;
  let fileCalls: Map<string, RawCall[]>;

  const files: FileInfo[] = [
    { path: 'src/auth.ts', absolutePath: join(FIXTURES, 'auth.ts'), language: 'typescript', size: 0, lastModified: 0 },
    { path: 'src/user-service.ts', absolutePath: join(FIXTURES, 'user-service.ts'), language: 'typescript', size: 0, lastModified: 0 },
    { path: 'src/types.ts', absolutePath: join(FIXTURES, 'types.ts'), language: 'typescript', size: 0, lastModified: 0 },
  ];

  beforeAll(async () => {
    graph = new KnowledgeGraph();
    symbolTable = new SymbolTable();
    fileImports = new Map();
    fileCalls = new Map();

    // Create File nodes
    for (const f of files) {
      graph.addNode({ id: `File:${f.path}`, label: 'File', name: f.path, filePath: f.path });
    }

    // Parse each file
    for (const f of files) {
      const source = readFileSync(f.absolutePath, 'utf-8');
      const tree = await parseSource(source, 'typescript');
      const parsed = typescriptProvider.extract(source, f.path, tree);

      for (const node of parsed.nodes) {
        graph.addNode(node);
        symbolTable.add({
          nodeId: node.id,
          name: node.name,
          filePath: f.path,
          label: node.label,
          isExported: node.isExported ?? false,
          parameterCount: (node.properties?.parameterCount as number) ?? undefined,
        });
        // Also register methods/fields by owner
        if (node.label === 'Method' || node.label === 'Property') {
          const className = (node.properties?.className as string) ?? '';
          if (className) {
            // Find class node ID
            const classNodeId = parsed.nodes.find(n => n.label === 'Class' && n.name === className)?.id;
            if (classNodeId && node.label === 'Method') {
              symbolTable.addMethod(classNodeId, {
                nodeId: node.id,
                name: node.name,
                filePath: f.path,
                label: node.label,
                isExported: false,
              });
            }
          }
        }
      }
      for (const rel of parsed.relationships) {
        graph.addRelationship(rel);
      }
      fileImports.set(f.path, parsed.imports);
      fileCalls.set(f.path, parsed.calls);
    }

    // Resolve imports first (create IMPORTS edges)
    // auth.ts imports from user-service.ts
    graph.addRelationship({
      id: 'IMPORTS:File:src/auth.ts->File:src/user-service.ts',
      sourceId: 'File:src/auth.ts',
      targetId: 'File:src/user-service.ts',
      type: 'IMPORTS',
      confidence: 0.95,
      properties: { importPath: './user-service' },
    });
  });

  it('should extract call expressions from source', () => {
    const authCalls = fileCalls.get('src/auth.ts') ?? [];
    expect(authCalls.length).toBeGreaterThan(0);

    // Should find: new UserService() (x2), service.authenticate(), service.invalidateSession()
    const constructCalls = authCalls.filter(c => c.kind === 'construct');
    expect(constructCalls.length).toBe(2); // Two `new UserService()`

    const memberCalls = authCalls.filter(c => c.kind === 'member');
    expect(memberCalls.length).toBeGreaterThanOrEqual(2); // authenticate, invalidateSession
  });

  it('should extract calls from user-service.ts', () => {
    const serviceCalls = fileCalls.get('src/user-service.ts') ?? [];
    // findById has: this.users.find(u => u.id === id) — member call
    const memberCalls = serviceCalls.filter(c => c.kind === 'member');
    expect(memberCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should resolve direct function calls', () => {
    const result = resolveCalls(fileCalls, fileImports, files, graph, symbolTable, config);
    expect(result.callEdges).toBeGreaterThan(0);

    // Verify CALLS edges exist
    const callEdges = graph.getAllRelationships().filter(r => r.type === 'CALLS');
    expect(callEdges.length).toBeGreaterThan(0);
  });

  it('should resolve constructor calls (new UserService)', () => {
    const callEdges = graph.getAllRelationships().filter(r => r.type === 'CALLS');

    // handleLogin → UserService (construct)
    const constructEdge = callEdges.find(
      r => r.sourceId.includes('handleLogin') && r.targetId.includes('UserService')
    );
    expect(constructEdge).toBeDefined();
    expect(constructEdge!.properties?.kind).toBe('construct');
  });

  it('should resolve heritage placeholders (EXTENDS)', () => {
    // UserRepository extends BaseRepository
    const extendsEdges = graph.getAllRelationships().filter(
      r => r.type === 'EXTENDS' && !r.targetId.includes(':?:')
    );
    const userRepoExtends = extendsEdges.find(
      r => r.sourceId.includes('UserRepository')
    );
    expect(userRepoExtends).toBeDefined();
    expect(userRepoExtends!.targetId).toContain('BaseRepository');
  });

  it('should clean up unresolved placeholders in post-process', () => {
    const result = postProcess(graph);
    expect(result.removedPlaceholders).toBeGreaterThanOrEqual(0);

    // No relationships with :?: should remain
    const remaining = graph.getAllRelationships().filter(r => r.targetId.includes(':?:'));
    expect(remaining.length).toBe(0);
  });
});
