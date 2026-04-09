import type { LangSpec } from './extract.js';
import type { RawCall } from '../types.js';
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

export default spec;
