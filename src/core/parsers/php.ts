import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { GraphNode, GraphRelationship } from '../../types/graph.js';
import type { ProjectConfig } from '../../types/pipeline.js';
import type { LanguageProvider, ParsedSymbols, RawImport, RawExport, RawCall } from './provider.js';

function* walkTree(node: any): Generator<any> {
  yield node;
  for (let i = 0; i < node.childCount; i++) {
    yield* walkTree(node.child(i));
  }
}

function findChild(node: any, type: string): any {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === type) return child;
  }
  return null;
}

function findChildren(node: any, type: string): any[] {
  const result: any[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === type) result.push(child);
  }
  return result;
}

function makeId(label: string, filePath: string, name: string): string {
  return `${label}:${filePath}:${name}`;
}

function countParams(paramsNode: any): number {
  if (!paramsNode) return 0;
  return paramsNode.namedChildren?.length ?? 0;
}

export const phpProvider: LanguageProvider = {
  id: 'php',
  extensions: ['.php'],
  treeSitterLang: 'php',

  extract(source: string, filePath: string, tree: any): ParsedSymbols {
    const nodes: GraphNode[] = [];
    const relationships: GraphRelationship[] = [];
    const imports: RawImport[] = [];
    const exports: RawExport[] = [];
    const calls: RawCall[] = [];
    const rootNode = tree.rootNode;

    let currentNamespace = '';
    let currentClass: { id: string; name: string } | null = null;

    for (const node of walkTree(rootNode)) {
      switch (node.type) {
        // ── Namespace ──────────────────────────────────────
        case 'namespace_definition': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            currentNamespace = nameNode.text;
            const id = makeId('Module', filePath, currentNamespace);
            nodes.push({
              id,
              label: 'Module',
              name: currentNamespace,
              filePath,
              startLine: node.startPosition.row + 1,
            });
            relationships.push({
              id: `DEFINES:File:${filePath}->${id}`,
              sourceId: `File:${filePath}`,
              targetId: id,
              type: 'DEFINES',
              confidence: 1.0,
            });
          }
          break;
        }

        // ── Use statements (imports) ───────────────────────
        case 'namespace_use_declaration': {
          const useGroup = findChildren(node, 'namespace_use_clause');
          for (const clause of useGroup) {
            const nameNode = findChild(clause, 'qualified_name') ?? findChild(clause, 'name');
            const aliasNode = findChild(clause, 'namespace_aliasing_clause');

            if (nameNode) {
              const fullName = nameNode.text;
              const localName = aliasNode
                ? findChild(aliasNode, 'name')?.text ?? fullName.split('\\').pop()!
                : fullName.split('\\').pop()!;

              imports.push({
                source: fullName,
                bindings: [{ local: localName, imported: fullName }],
                isNamespace: false,
                isDefault: false,
                line: node.startPosition.row + 1,
              });
            }
          }
          break;
        }

        // ── Function declaration ───────────────────────────
        case 'function_definition': {
          // Skip methods (they are inside class bodies)
          if (currentClass) break;

          const nameNode = node.childForFieldName('name');
          if (!nameNode) break;
          const name = nameNode.text;
          const params = node.childForFieldName('parameters');
          const fullName = currentNamespace ? `${currentNamespace}\\${name}` : name;
          const id = makeId('Function', filePath, fullName);

          nodes.push({
            id,
            label: 'Function',
            name,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isExported: true, // PHP functions are always accessible
            properties: {
              parameterCount: countParams(params),
              namespace: currentNamespace || undefined,
              qualifiedName: fullName,
            },
          });
          relationships.push({
            id: `DEFINES:File:${filePath}->${id}`,
            sourceId: `File:${filePath}`,
            targetId: id,
            type: 'DEFINES',
            confidence: 1.0,
          });
          exports.push({ name: fullName, line: node.startPosition.row + 1 });
          break;
        }

        // ── Class declaration ──────────────────────────────
        case 'class_declaration': {
          const nameNode = node.childForFieldName('name');
          if (!nameNode) break;
          const name = nameNode.text;
          const fullName = currentNamespace ? `${currentNamespace}\\${name}` : name;
          const isAbstract = source.substring(node.startIndex - 10, node.startIndex).includes('abstract');
          const id = makeId('Class', filePath, fullName);

          nodes.push({
            id,
            label: 'Class',
            name,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isExported: true,
            properties: {
              isAbstract,
              namespace: currentNamespace || undefined,
              qualifiedName: fullName,
            },
          });
          relationships.push({
            id: `DEFINES:File:${filePath}->${id}`,
            sourceId: `File:${filePath}`,
            targetId: id,
            type: 'DEFINES',
            confidence: 1.0,
          });
          exports.push({ name: fullName, line: node.startPosition.row + 1 });

          // Extends
          const baseClause = node.childForFieldName('base_clause') ?? findChild(node, 'base_clause');
          if (baseClause) {
            const superNode = findChild(baseClause, 'qualified_name') ?? findChild(baseClause, 'name');
            if (superNode) {
              relationships.push({
                id: `EXTENDS:${id}->?:${superNode.text}`,
                sourceId: id,
                targetId: `Class:?:${superNode.text}`,
                type: 'EXTENDS',
                confidence: 1.0,
                properties: { unresolvedTarget: superNode.text },
              });
            }
          }

          // Implements
          const implClause = findChild(node, 'class_interface_clause');
          if (implClause) {
            for (const child of implClause.namedChildren ?? []) {
              const ifaceName = child.text;
              if (ifaceName) {
                relationships.push({
                  id: `IMPLEMENTS:${id}->?:${ifaceName}`,
                  sourceId: id,
                  targetId: `Interface:?:${ifaceName}`,
                  type: 'IMPLEMENTS',
                  confidence: 1.0,
                  properties: { unresolvedTarget: ifaceName },
                });
              }
            }
          }

          // Process class body
          currentClass = { id, name };
          const body = node.childForFieldName('body') ?? findChild(node, 'declaration_list');
          if (body) {
            extractPHPClassBody(body, filePath, id, fullName, nodes, relationships);
          }
          currentClass = null;
          break;
        }

        // ── Interface declaration ──────────────────────────
        case 'interface_declaration': {
          const nameNode = node.childForFieldName('name');
          if (!nameNode) break;
          const name = nameNode.text;
          const fullName = currentNamespace ? `${currentNamespace}\\${name}` : name;
          const id = makeId('Interface', filePath, fullName);

          nodes.push({
            id,
            label: 'Interface',
            name,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isExported: true,
            properties: {
              namespace: currentNamespace || undefined,
              qualifiedName: fullName,
            },
          });
          relationships.push({
            id: `DEFINES:File:${filePath}->${id}`,
            sourceId: `File:${filePath}`,
            targetId: id,
            type: 'DEFINES',
            confidence: 1.0,
          });
          exports.push({ name: fullName, line: node.startPosition.row + 1 });
          break;
        }

        // ── Trait declaration ──────────────────────────────
        case 'trait_declaration': {
          const nameNode = node.childForFieldName('name');
          if (!nameNode) break;
          const name = nameNode.text;
          const fullName = currentNamespace ? `${currentNamespace}\\${name}` : name;
          const id = makeId('Class', filePath, fullName); // Treat traits as Class

          nodes.push({
            id,
            label: 'Class',
            name,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isExported: true,
            properties: {
              isTrait: true,
              namespace: currentNamespace || undefined,
              qualifiedName: fullName,
            },
          });
          relationships.push({
            id: `DEFINES:File:${filePath}->${id}`,
            sourceId: `File:${filePath}`,
            targetId: id,
            type: 'DEFINES',
            confidence: 1.0,
          });
          break;
        }

        default:
          break;
      }
    }

    // ── Extract call expressions ──────────────────────────
    extractPHPCalls(rootNode, filePath, nodes, calls);

    return { nodes, relationships, imports, exports, calls };
  },

  resolveImport(importPath: string, fromFile: string, config: ProjectConfig): string | null {
    // PHP: resolve via PSR-4 mapping from composer.json
    if (!importPath.includes('\\')) return null;

    for (const [namespace, dir] of Object.entries(config.psr4)) {
      if (importPath.startsWith(namespace)) {
        const rest = importPath.slice(namespace.length).replace(/\\/g, '/');
        const candidate = join(dir, rest + '.php').replace(/\\/g, '/');
        const full = join(config.rootPath, candidate);
        if (existsSync(full)) return candidate;
      }
    }

    return null;
  },
};

// ─── PHP Class Body ─────────────────────────────────────────

function extractPHPClassBody(
  body: any,
  filePath: string,
  classId: string,
  className: string,
  nodes: GraphNode[],
  relationships: GraphRelationship[],
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (!member) continue;

    if (member.type === 'method_declaration') {
      const nameNode = member.childForFieldName('name');
      if (!nameNode) continue;
      const name = nameNode.text;
      const params = member.childForFieldName('parameters');

      let visibility = 'public';
      const text = member.text ?? '';
      if (text.includes('private ')) visibility = 'private';
      else if (text.includes('protected ')) visibility = 'protected';
      const isStatic = text.includes('static ');

      const shortName = className.split('\\').pop() ?? className;
      const id = makeId('Method', filePath, `${shortName}.${name}`);
      nodes.push({
        id,
        label: 'Method',
        name,
        filePath,
        startLine: member.startPosition.row + 1,
        endLine: member.endPosition.row + 1,
        properties: {
          isStatic,
          visibility,
          parameterCount: countParams(params),
          className: shortName,
        },
      });
      relationships.push({
        id: `HAS_METHOD:${classId}->${id}`,
        sourceId: classId,
        targetId: id,
        type: 'HAS_METHOD',
        confidence: 1.0,
      });
    }

    if (member.type === 'property_declaration') {
      const propElement = findChild(member, 'property_element');
      const nameNode = propElement
        ? findChild(propElement, 'variable_name')
        : member.childForFieldName('name');
      if (!nameNode) continue;
      const name = nameNode.text.replace(/^\$/, '');

      let visibility = 'public';
      const text = member.text ?? '';
      if (text.includes('private ')) visibility = 'private';
      else if (text.includes('protected ')) visibility = 'protected';

      const shortName = className.split('\\').pop() ?? className;
      const id = makeId('Property', filePath, `${shortName}.${name}`);
      nodes.push({
        id,
        label: 'Property',
        name,
        filePath,
        startLine: member.startPosition.row + 1,
        properties: {
          visibility,
          className: shortName,
        },
      });
      relationships.push({
        id: `HAS_PROPERTY:${classId}->${id}`,
        sourceId: classId,
        targetId: id,
        type: 'HAS_PROPERTY',
        confidence: 1.0,
      });
    }
  }
}

// ─── PHP Call Extraction ────────────────────────────────────

function extractPHPCalls(
  rootNode: any,
  filePath: string,
  symbolNodes: GraphNode[],
  calls: RawCall[],
): void {
  const containers: Array<{ id: string; startLine: number; endLine: number }> = [];
  for (const n of symbolNodes) {
    if (n.label === 'Function' || n.label === 'Method') {
      containers.push({
        id: n.id,
        startLine: n.startLine ?? 0,
        endLine: n.endLine ?? Infinity,
      });
    }
  }
  containers.sort((a, b) => b.startLine - a.startLine);

  function findContainer(line: number): string {
    for (const c of containers) {
      if (line >= c.startLine && line <= c.endLine) return c.id;
    }
    return `File:${filePath}`;
  }

  for (const node of walkTree(rootNode)) {
    if (node.type === 'function_call_expression') {
      const fn = node.childForFieldName('function');
      if (!fn) continue;
      const line = node.startPosition.row + 1;
      calls.push({
        callee: fn.text,
        kind: 'direct',
        containerId: findContainer(line),
        line,
      });
    } else if (node.type === 'member_call_expression') {
      const objectNode = node.childForFieldName('object');
      const nameNode = node.childForFieldName('name');
      if (objectNode && nameNode) {
        const line = node.startPosition.row + 1;
        calls.push({
          callee: `${objectNode.text}->${nameNode.text}`,
          kind: 'member',
          receiver: objectNode.text,
          method: nameNode.text,
          containerId: findContainer(line),
          line,
        });
      }
    } else if (node.type === 'scoped_call_expression') {
      // Static call: User::find($id)
      const scopeNode = node.childForFieldName('scope');
      const nameNode = node.childForFieldName('name');
      if (scopeNode && nameNode) {
        const line = node.startPosition.row + 1;
        calls.push({
          callee: `${scopeNode.text}::${nameNode.text}`,
          kind: 'static',
          receiver: scopeNode.text,
          method: nameNode.text,
          containerId: findContainer(line),
          line,
        });
      }
    } else if (node.type === 'object_creation_expression') {
      const classNode = node.childForFieldName('class') ?? node.namedChildren?.[0];
      if (classNode) {
        const line = node.startPosition.row + 1;
        calls.push({
          callee: classNode.text,
          kind: 'construct',
          containerId: findContainer(line),
          line,
        });
      }
    }
  }
}

// ─── PSR-4 Config Loader ────────────────────────────────────

export function loadPSR4Config(rootPath: string): Record<string, string> {
  const composerPath = join(rootPath, 'composer.json');
  if (!existsSync(composerPath)) return {};

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf-8'));
    const psr4: Record<string, string> = {};

    const autoload = composer.autoload?.['psr-4'] ?? {};
    for (const [ns, dir] of Object.entries(autoload)) {
      psr4[ns as string] = (dir as string).replace(/\/$/, '');
    }

    const autoloadDev = composer['autoload-dev']?.['psr-4'] ?? {};
    for (const [ns, dir] of Object.entries(autoloadDev)) {
      psr4[ns as string] = (dir as string).replace(/\/$/, '');
    }

    return psr4;
  } catch {
    return {};
  }
}
