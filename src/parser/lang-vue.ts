import type { LangSpec } from './extract.js';
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

export default spec;
