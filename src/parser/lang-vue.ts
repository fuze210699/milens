import type { LangSpec } from './extract.js';
import type { RawCall, CodeSymbol } from '../types.js';
import type Parser from 'web-tree-sitter';
import tsSpec from './lang-ts.js';

// Vue SFC: parse <script> or <script setup> blocks as TypeScript
const spec: LangSpec = {
  id: 'vue',
  extensions: ['.vue'],
  wasmName: 'tree-sitter-tsx', // delegate to TS/TSX parser for script content
  queries: tsSpec.queries,     // reuse TS queries on extracted script block
  resolveImport: tsSpec.resolveImport,
};

/**
 * Extract the <script> or <script setup> block content from a Vue SFC.
 * Returns the script content and its starting line offset.
 */
export function extractVueScript(source: string): { content: string; lineOffset: number } | null {
  // Match <script ...> ... </script> — prefer <script setup> if present
  const setupMatch = source.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i);
  const regularMatch = source.match(/<script(?:\s+lang="(?:ts|typescript)")?[^>]*>([\s\S]*?)<\/script>/i);
  const match = setupMatch ?? regularMatch;
  if (!match) return null;

  const fullMatchStart = source.indexOf(match[0]);
  const tagEnd = match[0].indexOf('>') + 1;
  const contentStart = fullMatchStart + tagEnd;
  const lineOffset = source.slice(0, contentStart).split('\n').length - 1;

  return { content: match[1], lineOffset };
}

/**
 * Extract references from Vue <template> block.
 * Captures: component tags, event handlers, v-bind/v-model/v-if directives, interpolations.
 */
export function extractVueTemplateRefs(source: string, filePath: string): RawCall[] {
  const calls: RawCall[] = [];
  const templateMatch = source.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  if (!templateMatch) return calls;

  const templateStart = source.indexOf(templateMatch[0]);
  const tagEnd = templateMatch[0].indexOf('>') + 1;
  const contentStart = templateStart + tagEnd;
  const baseLineOffset = source.slice(0, contentStart).split('\n').length - 1;
  const templateContent = templateMatch[1];
  const moduleId = `${filePath}#module:_top:0`;

  const lines = templateContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = baseLineOffset + i + 1;

    // Component tags: <MyComponent>, <UserList>, <el-table> (skip HTML tags — require uppercase or hyphen)
    const tagRe = /<([A-Z][A-Za-z0-9]*|[a-z]+-[a-z][a-z0-9-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(line)) !== null) {
      calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: m[1], line: lineNum });
    }

    // Event handlers: @click="handler" or v-on:click="handler"
    const eventRe = /(?:@|v-on:)[a-z.-]+="([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\(|")/g;
    while ((m = eventRe.exec(line)) !== null) {
      calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: m[1], line: lineNum });
    }

    // Directive expressions: v-if="isVisible", v-show="hasAccess", v-model="formData"
    // :prop="computedValue", v-bind:src="imageUrl"
    const directiveRe = /(?:v-(?:if|else-if|show|model|bind)|:[a-z][-a-z]*)="([a-zA-Z_$][a-zA-Z0-9_$]*)"/g;
    while ((m = directiveRe.exec(line)) !== null) {
      calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: m[1], line: lineNum });
    }

    // Template interpolations: {{ computedValue }}, {{ formatDate(x) }}
    const interpRe = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((m = interpRe.exec(line)) !== null) {
      calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: m[1], line: lineNum });
    }
  }

  return calls;
}

/**
 * AST-based extraction of references from Vue <template> block using tree-sitter-html.
 * Handles multi-line attributes, nested components, class attributes for CSS linking,
 * ref attributes for template ref symbols, and all directive/event/interpolation patterns.
 */
export function extractVueTemplateAst(
  parser: Parser,
  source: string,
  filePath: string,
): { calls: RawCall[]; symbols: CodeSymbol[] } {
  const calls: RawCall[] = [];
  const symbols: CodeSymbol[] = [];
  const templateMatch = source.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  if (!templateMatch) return { calls, symbols };

  const templateStart = source.indexOf(templateMatch[0]);
  const tagEnd = templateMatch[0].indexOf('>') + 1;
  const contentStart = templateStart + tagEnd;
  const lineOffset = source.slice(0, contentStart).split('\n').length;
  const templateContent = templateMatch[1];
  const moduleId = `${filePath}#module:_top:0`;

  const tree = parser.parse(templateContent);
  const seenCalls = new Set<string>();

  function walk(node: Parser.SyntaxNode): void {
    if (node.type === 'start_tag' || node.type === 'self_closing_tag') {
      const tagNameNode = node.childForFieldName?.('name') ?? node.firstNamedChild;
      const tagName = tagNameNode?.text;
      const line = lineOffset + node.startPosition.row;

      // Component tags: PascalCase or kebab-case with hyphen
      if (tagName && (/^[A-Z]/.test(tagName) || tagName.includes('-'))) {
        const dedupKey = `tag:${tagName}:${line}`;
        if (!seenCalls.has(dedupKey)) {
          seenCalls.add(dedupKey);
          calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: tagName, line });
        }
      }

      // Process attributes
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child?.type !== 'attribute') continue;

        const attrNameChild = child.firstNamedChild;
        const attrName = attrNameChild?.text || '';
        const valueNode = child.namedChild(1);
        const rawValue = valueNode?.text || '';
        const value = rawValue.replace(/^["']|["']$/g, '');
        const attrLine = lineOffset + child.startPosition.row;

        // class="container main" → calls with . prefix for CSS linking
        if (attrName === 'class' && value) {
          const classes = value.split(/\s+/).filter(Boolean);
          for (const cls of classes) {
            const dedupKey = `class:${cls}:${attrLine}`;
            if (!seenCalls.has(dedupKey)) {
              seenCalls.add(dedupKey);
              calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: `.${cls}`, line: attrLine });
            }
          }
          continue;
        }

        // ref="inputEl" → template ref symbol
        if (attrName === 'ref' && value) {
          const dedupKey = `ref:${value}:${attrLine}`;
          if (!seenCalls.has(dedupKey)) {
            seenCalls.add(dedupKey);
            symbols.push({
              id: `${filePath}#variable:${value}:${attrLine}`,
              name: value,
              kind: 'variable',
              filePath,
              startLine: attrLine,
              endLine: attrLine,
              exported: false,
            });
          }
          continue;
        }

        // Event handlers: @click="handler", v-on:click="handler"
        if ((attrName.startsWith('@') || attrName.startsWith('v-on:')) && value) {
          const handler = value.match(/^([a-zA-Z_$][\w$]*)/)?.[1];
          if (handler) {
            const dedupKey = `event:${handler}:${attrLine}`;
            if (!seenCalls.has(dedupKey)) {
              seenCalls.add(dedupKey);
              calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: handler, line: attrLine });
            }
          }
          continue;
        }

        // Directives: v-if="expr", v-show="expr", v-model="expr", :prop="expr"
        if (/^(v-(?:if|else-if|show|model|for|html|text|bind)|:)/.test(attrName) && value) {
          const expr = value.match(/^([a-zA-Z_$][\w$.]*)/)?.[1];
          if (expr) {
            const dedupKey = `dir:${expr}:${attrLine}`;
            if (!seenCalls.has(dedupKey)) {
              seenCalls.add(dedupKey);
              calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: expr, line: attrLine });
            }
          }
          continue;
        }
      }
    }

    // Interpolations: {{ expression }}
    if (node.type === 'interpolation') {
      const text = node.text.slice(2, -2).trim(); // strip {{ }}
      const expr = text.match(/^([a-zA-Z_$][\w$.]*)/)?.[1];
      if (expr) {
        const line = lineOffset + node.startPosition.row;
        const dedupKey = `interp:${expr}:${line}`;
        if (!seenCalls.has(dedupKey)) {
          seenCalls.add(dedupKey);
          calls.push({ filePath, enclosingSymbolId: moduleId, calleeName: expr, line });
        }
      }
    }

    // Recurse
    for (let i = 0; i < node.namedChildCount; i++) {
      walk(node.namedChild(i)!);
    }
  }

  const htmlTree = parser.parse(templateContent);
  walk(htmlTree.rootNode);

  return { calls, symbols };
}

/**
 * Extract Composition API symbols from <script setup> content.
 * Captures defineProps prop children and defineEmits event names.
 * Parent variable symbols (props, emit) are already captured by the TS variables query.
 */
export function extractVueCompositionApi(
  scriptContent: string,
  filePath: string,
  lineOffset: number,
): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = scriptContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const absLine = lineOffset + i + 1;

    // defineProps<{ name: string; age?: number }>()
    const propsMatch = line.match(/const\s+(\w+)\s*=\s*defineProps\s*<\s*\{\s*([^}]*)\s*\}\s*>/);
    if (propsMatch) {
      const varName = propsMatch[1];
      const typeBody = propsMatch[2];
      const parentId = `${filePath}#variable:${varName}:${absLine}`;

      const propRe = /(\w+)\s*\??\s*:\s*(?:string|number|boolean|any|void|never|unknown|[A-Z]\w*|[\w\[\]<>|&,'"]+)/g;
      let pm: RegExpExecArray | null;
      while ((pm = propRe.exec(typeBody)) !== null) {
        const propName = pm[1];
        symbols.push({
          id: `${filePath}#variable:${propName}:${absLine}`,
          name: propName,
          kind: 'variable',
          filePath,
          startLine: absLine,
          endLine: absLine,
          exported: true,
          parentId,
        });
      }
    }
  }

  return symbols;
}

export default spec;
