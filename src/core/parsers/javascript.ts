import { dirname, join, resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import type { GraphNode, GraphRelationship } from '../../types/graph.js';
import type { ProjectConfig } from '../../types/pipeline.js';
import type { LanguageProvider, ParsedSymbols, RawImport, RawExport, RawCall } from './provider.js';

// Helper: walk tree-sitter cursor depth-first
function* walkTree(node: any): Generator<any> {
  yield node;
  for (let i = 0; i < node.childCount; i++) {
    yield* walkTree(node.child(i));
  }
}

// Helper: check if a node is inside an export statement
function isExported(node: any): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return parent.type === 'export_statement' || parent.type === 'export_default_declaration';
}

// Helper: count parameters
function countParams(paramsNode: any): number {
  if (!paramsNode) return 0;
  return paramsNode.namedChildren?.length ?? 0;
}

// Helper: check for async
function isAsync(node: any): boolean {
  if (node.type === 'function_declaration' || node.type === 'arrow_function') {
    // Check for 'async' keyword before the function
    const prevSibling = node.previousSibling;
    if (prevSibling?.type === 'async') return true;
    // web-tree-sitter: check text
    const text = node.text;
    if (typeof text === 'string' && text.startsWith('async')) return true;
  }
  return false;
}

// Check if a function/arrow returns JSX (React component heuristic)
function returnsJSX(node: any): boolean {
  for (const child of walkTree(node)) {
    if (child.type === 'jsx_element' || child.type === 'jsx_self_closing_element' || child.type === 'jsx_fragment') {
      return true;
    }
  }
  return false;
}

function makeId(label: string, filePath: string, name: string): string {
  return `${label}:${filePath}:${name}`;
}

export const javascriptProvider: LanguageProvider = {
  id: 'javascript',
  extensions: ['.js', '.jsx'],
  treeSitterLang: 'javascript',

  extract(source: string, filePath: string, tree: any): ParsedSymbols {
    return extractJSTS(source, filePath, tree);
  },

  resolveImport: resolveJSTSImport,
};

export const typescriptProvider: LanguageProvider = {
  id: 'typescript',
  extensions: ['.ts', '.tsx'],
  treeSitterLang: 'typescript',

  extract(source: string, filePath: string, tree: any): ParsedSymbols {
    return extractJSTS(source, filePath, tree);
  },

  resolveImport: resolveJSTSImport,
};

// ─── Main Extraction ───────────────────────────────────────

function extractJSTS(source: string, filePath: string, tree: any): ParsedSymbols {
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const calls: RawCall[] = [];
  const rootNode = tree.rootNode;

  let currentClass: { id: string; name: string } | null = null;

  for (const node of walkTree(rootNode)) {
    switch (node.type) {
      // ── Function declarations ──────────────────────────
      case 'function_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = nameNode.text;
        const exported = isExported(node);
        const params = node.childForFieldName('parameters');
        const isComponent = /^[A-Z]/.test(name) && returnsJSX(node);

        const label = isComponent ? 'Component' : 'Function';
        const id = makeId(label, filePath, name);
        nodes.push({
          id,
          label: label as any,
          name,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          isExported: exported,
          properties: {
            parameterCount: countParams(params),
            isAsync: source.substring(node.startIndex - 6, node.startIndex).includes('async'),
            ...(isComponent ? { framework: 'react' } : {}),
          },
        });
        relationships.push({
          id: `DEFINES:File:${filePath}->${id}`,
          sourceId: `File:${filePath}`,
          targetId: id,
          type: 'DEFINES',
          confidence: 1.0,
        });
        if (exported) {
          exports.push({ name, line: node.startPosition.row + 1 });
        }
        break;
      }

      // ── Arrow / var functions ──────────────────────────
      case 'lexical_declaration':
      case 'variable_declaration': {
        for (let i = 0; i < node.namedChildCount; i++) {
          const declarator = node.namedChild(i);
          if (declarator?.type !== 'variable_declarator') continue;

          const nameNode = declarator.childForFieldName('name');
          const valueNode = declarator.childForFieldName('value');
          if (!nameNode || !valueNode) continue;

          const isArrow = valueNode.type === 'arrow_function';
          const isFuncExpr = valueNode.type === 'function' || valueNode.type === 'function_expression';
          if (!isArrow && !isFuncExpr) continue;

          const name = nameNode.text;
          const exported = isExported(node);
          const params = valueNode.childForFieldName('parameters');
          const isComponent = /^[A-Z]/.test(name) && returnsJSX(valueNode);

          const label = isComponent ? 'Component' : 'Function';
          const id = makeId(label, filePath, name);
          nodes.push({
            id,
            label: label as any,
            name,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: valueNode.endPosition.row + 1,
            isExported: exported,
            properties: {
              parameterCount: countParams(params),
              isAsync: source.substring(node.startIndex, node.startIndex + 20).includes('async'),
              ...(isComponent ? { framework: 'react' } : {}),
            },
          });
          relationships.push({
            id: `DEFINES:File:${filePath}->${id}`,
            sourceId: `File:${filePath}`,
            targetId: id,
            type: 'DEFINES',
            confidence: 1.0,
          });
          if (exported) {
            exports.push({ name, line: node.startPosition.row + 1 });
          }
        }
        break;
      }

      // ── Class declaration ──────────────────────────────
      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = nameNode.text;
        const exported = isExported(node);
        const id = makeId('Class', filePath, name);

        nodes.push({
          id,
          label: 'Class',
          name,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          isExported: exported,
          properties: {
            isAbstract: source.substring(node.startIndex - 10, node.startIndex).includes('abstract'),
          },
        });
        relationships.push({
          id: `DEFINES:File:${filePath}->${id}`,
          sourceId: `File:${filePath}`,
          targetId: id,
          type: 'DEFINES',
          confidence: 1.0,
        });

        // Heritage: extends
        const heritage = node.childForFieldName('heritage') ?? findChild(node, 'class_heritage');
        if (heritage) {
          const extendsClause = findChild(heritage, 'extends_clause');
          if (extendsClause) {
            const superName = extendsClause.namedChildren?.[0]?.text;
            if (superName) {
              // Create placeholder relationship — resolved later
              relationships.push({
                id: `EXTENDS:${id}->?:${superName}`,
                sourceId: id,
                targetId: `Class:?:${superName}`, // placeholder
                type: 'EXTENDS',
                confidence: 1.0,
                properties: { unresolvedTarget: superName },
              });
            }
          }

          // implements
          const implementsClause = findChild(heritage, 'implements_clause');
          if (implementsClause) {
            for (const child of implementsClause.namedChildren ?? []) {
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
        }

        if (exported) {
          exports.push({ name, line: node.startPosition.row + 1 });
        }

        // Process class body in context
        currentClass = { id, name };
        const body = node.childForFieldName('body');
        if (body) {
          extractClassBody(body, filePath, id, name, nodes, relationships);
        }
        currentClass = null;
        break;
      }

      // ── Abstract class declaration (TS) ────────────────
      case 'abstract_class_declaration': {
        const nameNode = node.childForFieldName('name') ?? findChild(node, 'type_identifier');
        if (!nameNode) break;
        const name = nameNode.text;
        const exported = isExported(node);
        const id = makeId('Class', filePath, name);

        nodes.push({
          id,
          label: 'Class',
          name,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          isExported: exported,
          properties: { isAbstract: true },
        });
        relationships.push({
          id: `DEFINES:File:${filePath}->${id}`,
          sourceId: `File:${filePath}`,
          targetId: id,
          type: 'DEFINES',
          confidence: 1.0,
        });

        // Heritage: extends / implements
        const heritage = node.childForFieldName('heritage') ?? findChild(node, 'class_heritage');
        if (heritage) {
          const extendsClause = findChild(heritage, 'extends_clause');
          if (extendsClause) {
            const superName = extendsClause.namedChildren?.[0]?.text;
            if (superName) {
              relationships.push({
                id: `EXTENDS:${id}->?:${superName}`,
                sourceId: id,
                targetId: `Class:?:${superName}`,
                type: 'EXTENDS',
                confidence: 1.0,
                properties: { unresolvedTarget: superName },
              });
            }
          }
          const implementsClause = findChild(heritage, 'implements_clause');
          if (implementsClause) {
            for (const child of implementsClause.namedChildren ?? []) {
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
        }

        if (exported) {
          exports.push({ name, line: node.startPosition.row + 1 });
        }

        currentClass = { id, name };
        const body = node.childForFieldName('body');
        if (body) {
          extractClassBody(body, filePath, id, name, nodes, relationships);
        }
        currentClass = null;
        break;
      }

      // ── Interface declaration (TS) ─────────────────────
      case 'interface_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = nameNode.text;
        const exported = isExported(node);
        const id = makeId('Interface', filePath, name);

        nodes.push({
          id,
          label: 'Interface',
          name,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          isExported: exported,
        });
        relationships.push({
          id: `DEFINES:File:${filePath}->${id}`,
          sourceId: `File:${filePath}`,
          targetId: id,
          type: 'DEFINES',
          confidence: 1.0,
        });
        if (exported) {
          exports.push({ name, line: node.startPosition.row + 1 });
        }
        break;
      }

      // ── Type alias (TS) ────────────────────────────────
      case 'type_alias_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = nameNode.text;
        const exported = isExported(node);
        const id = makeId('Interface', filePath, name);

        nodes.push({
          id,
          label: 'Interface',
          name,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          isExported: exported,
          properties: { isTypeAlias: true },
        });
        relationships.push({
          id: `DEFINES:File:${filePath}->${id}`,
          sourceId: `File:${filePath}`,
          targetId: id,
          type: 'DEFINES',
          confidence: 1.0,
        });
        if (exported) {
          exports.push({ name, line: node.startPosition.row + 1 });
        }
        break;
      }

      // ── Import statements ──────────────────────────────
      case 'import_statement': {
        const imp = extractImport(node);
        if (imp) imports.push(imp);
        break;
      }

      // ── Export statements ──────────────────────────────
      case 'export_statement': {
        // export default X, export { X }, etc.
        const decl = node.childForFieldName('declaration');
        if (!decl) {
          // export { a, b } or export default expression
          const defaultKeyword = findChild(node, 'default');
          if (defaultKeyword) {
            exports.push({ name: 'default', line: node.startPosition.row + 1 });
          }
          // Named re-exports handled via import extraction
          const exportClause = findChild(node, 'export_clause');
          if (exportClause) {
            for (const spec of exportClause.namedChildren ?? []) {
              if (spec.type === 'export_specifier') {
                const localNode = spec.childForFieldName('name');
                const aliasNode = spec.childForFieldName('alias');
                if (localNode) {
                  exports.push({
                    name: aliasNode?.text ?? localNode.text,
                    localName: localNode.text,
                    line: node.startPosition.row + 1,
                  });
                }
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // ── Second pass: extract call expressions ──────────────
  // Build a map of node IDs for containers (functions/methods) by their AST position
  extractCalls(rootNode, filePath, nodes, calls);

  return { nodes, relationships, imports, exports, calls };
}

// ─── Class Body Extraction ──────────────────────────────────

function extractClassBody(
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

    if (member.type === 'method_definition' || member.type === 'method_signature') {
      const nameNode = member.childForFieldName('name');
      if (!nameNode) continue;
      const name = nameNode.text;
      const params = member.childForFieldName('parameters');
      const isStatic = member.text?.startsWith('static') ?? false;

      // Determine visibility
      let visibility: string = 'public';
      if (member.text?.startsWith('private') || name.startsWith('#')) visibility = 'private';
      else if (member.text?.startsWith('protected')) visibility = 'protected';

      const id = makeId('Method', filePath, `${className}.${name}`);
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
          className,
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

    if (member.type === 'public_field_definition' || member.type === 'field_definition' || member.type === 'property_signature') {
      const nameNode = member.childForFieldName('name');
      if (!nameNode) continue;
      const name = nameNode.text;

      let visibility: string = 'public';
      if (member.text?.startsWith('private') || name.startsWith('#')) visibility = 'private';
      else if (member.text?.startsWith('protected')) visibility = 'protected';

      const id = makeId('Property', filePath, `${className}.${name}`);
      nodes.push({
        id,
        label: 'Property',
        name,
        filePath,
        startLine: member.startPosition.row + 1,
        properties: {
          visibility,
          className,
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

// ─── Call Expression Extraction ─────────────────────────────

function extractCalls(
  rootNode: any,
  filePath: string,
  symbolNodes: GraphNode[],
  calls: RawCall[],
): void {
  // Build a lookup: line range → container node ID
  // Container = Function, Method, Component
  const containers: Array<{ id: string; startLine: number; endLine: number }> = [];
  for (const n of symbolNodes) {
    if (n.label === 'Function' || n.label === 'Method' || n.label === 'Component') {
      containers.push({
        id: n.id,
        startLine: n.startLine ?? 0,
        endLine: n.endLine ?? Infinity,
      });
    }
  }

  // Sort by startLine descending so inner (more specific) containers come first
  containers.sort((a, b) => b.startLine - a.startLine);

  function findContainer(line: number): string {
    for (const c of containers) {
      if (line >= c.startLine && line <= c.endLine) return c.id;
    }
    // Module-level (outside any function)
    return `File:${filePath}`;
  }

  for (const node of walkTree(rootNode)) {
    if (node.type === 'call_expression') {
      const line = node.startPosition.row + 1;
      const containerId = findContainer(line);
      const fn = node.childForFieldName('function');
      if (!fn) continue;

      if (fn.type === 'identifier') {
        // Direct call: formatDate(...)
        calls.push({
          callee: fn.text,
          kind: 'direct',
          containerId,
          line,
        });
      } else if (fn.type === 'member_expression') {
        // Member call: obj.method(...)
        const objectNode = fn.childForFieldName('object');
        const propertyNode = fn.childForFieldName('property');
        if (objectNode && propertyNode) {
          const receiver = objectNode.text;
          const method = propertyNode.text;
          calls.push({
            callee: `${receiver}.${method}`,
            kind: 'member',
            receiver,
            method,
            containerId,
            line,
          });
        }
      }
    } else if (node.type === 'new_expression') {
      // Constructor: new UserService(...)
      const constructor = node.childForFieldName('constructor');
      if (constructor) {
        const name = constructor.text;
        const line = node.startPosition.row + 1;
        calls.push({
          callee: name,
          kind: 'construct',
          containerId: findContainer(line),
          line,
        });
      }
    }
  }
}

// ─── Import Extraction ──────────────────────────────────────

function extractImport(node: any): RawImport | null {
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return null;

  // Remove quotes from the string
  const rawSource = sourceNode.text.replace(/^['"]|['"]$/g, '');
  const bindings: RawImport['bindings'] = [];
  let isNamespace = false;
  let isDefault = false;

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;

    switch (child.type) {
      case 'import_clause': {
        // Process import clause children
        for (let j = 0; j < child.namedChildCount; j++) {
          const clauseChild = child.namedChild(j);
          if (!clauseChild) continue;

          if (clauseChild.type === 'identifier') {
            // default import: import Foo from '...'
            isDefault = true;
            bindings.push({ local: clauseChild.text, imported: 'default' });
          }
          if (clauseChild.type === 'named_imports') {
            for (let k = 0; k < clauseChild.namedChildCount; k++) {
              const spec = clauseChild.namedChild(k);
              if (spec?.type === 'import_specifier') {
                const importedNode = spec.childForFieldName('name');
                const aliasNode = spec.childForFieldName('alias');
                if (importedNode) {
                  bindings.push({
                    local: aliasNode?.text ?? importedNode.text,
                    imported: importedNode.text,
                  });
                }
              }
            }
          }
          if (clauseChild.type === 'namespace_import') {
            isNamespace = true;
            const nameNode = clauseChild.namedChildren?.[0]; // identifier after 'as'
            if (nameNode) {
              bindings.push({ local: nameNode.text, imported: '*' });
            }
          }
        }
        break;
      }

      // In some tree-sitter versions these appear directly under import_statement
      case 'identifier': {
        isDefault = true;
        bindings.push({ local: child.text, imported: 'default' });
        break;
      }
      case 'named_imports': {
        for (let k = 0; k < child.namedChildCount; k++) {
          const spec = child.namedChild(k);
          if (spec?.type === 'import_specifier') {
            const importedNode = spec.childForFieldName('name');
            const aliasNode = spec.childForFieldName('alias');
            if (importedNode) {
              bindings.push({
                local: aliasNode?.text ?? importedNode.text,
                imported: importedNode.text,
              });
            }
          }
        }
        break;
      }
      case 'namespace_import': {
        isNamespace = true;
        const nameNode = child.namedChildren?.[0];
        if (nameNode) {
          bindings.push({ local: nameNode.text, imported: '*' });
        }
        break;
      }
    }
  }

  return {
    source: rawSource,
    bindings,
    isNamespace,
    isDefault,
    line: node.startPosition.row + 1,
  };
}

// ─── Import Resolution ──────────────────────────────────────

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function resolveJSTSImport(importPath: string, fromFile: string, config: ProjectConfig): string | null {
  // Skip external packages and node builtins
  if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')) {
    // Check aliases
    for (const [alias, target] of Object.entries(config.aliases)) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
        const rest = importPath.slice(alias.length);
        importPath = target + rest;
        break;
      }
    }
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null; // external package
    }
  }

  // Handle @/ alias
  if (importPath.startsWith('@/')) {
    const alias = config.aliases['@'] ?? 'src';
    importPath = './' + alias + importPath.slice(1);
  }
  if (importPath.startsWith('~/')) {
    const alias = config.aliases['~'] ?? 'src';
    importPath = './' + alias + importPath.slice(1);
  }

  // Resolve relative to fromFile
  const fromDir = dirname(fromFile);
  let candidate = join(fromDir, importPath).replace(/\\/g, '/');

  // Normalize: remove leading ./ if absolute within project
  if (candidate.startsWith('./')) {
    // fine
  }

  // Try extensions
  const ext = extname(candidate);
  if (!ext) {
    // Try file with extensions
    for (const tryExt of JS_EXTENSIONS) {
      const withExt = candidate + tryExt;
      const full = join(config.rootPath, withExt);
      if (existsSync(full)) return withExt;
    }
    // Try index file
    for (const tryExt of JS_EXTENSIONS) {
      const withIndex = join(candidate, 'index' + tryExt);
      const full = join(config.rootPath, withIndex);
      if (existsSync(full)) return withIndex.replace(/\\/g, '/');
    }
    // Try .vue
    const vueCandidate = candidate + '.vue';
    const vueFull = join(config.rootPath, vueCandidate);
    if (existsSync(vueFull)) return vueCandidate;
  }

  // With extension, check directly
  const full = join(config.rootPath, candidate);
  if (existsSync(full)) return candidate;

  return null;
}

// ─── Helpers ────────────────────────────────────────────────

function findChild(node: any, type: string): any {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === type) return child;
  }
  return null;
}
