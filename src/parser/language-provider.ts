import type { CodeSymbol, RawCall } from '../types.js';

export interface ParseContext {
  filePath: string;
  sourceDir: string;   // directory containing the file being parsed
  rootPath: string;    // project root
}

export interface LanguageProvider {
  /** Unique identifier (e.g. 'typescript', 'python') */
  id: string;

  /** File extensions this language handles (e.g. ['.ts', '.tsx']) */
  extensions: string[];

  /** Tree-sitter WASM module name */
  wasmName: string;

  /** All tree-sitter queries keyed by capture type */
  treeSitterQueries: Record<string, string>;

  /** How imports expose symbols to the importing file */
  importSemantics: 'named' | 'wildcard-leaf' | 'wildcard-transitive' | 'namespace';

  /** Method resolution order strategy for inheritance */
  mroStrategy: 'first-wins' | 'c3' | 'ruby-mixin' | 'none';

  /** Determine whether a symbol is exported in this language */
  isExported(symbol: CodeSymbol, context: ParseContext): boolean;

  /** Resolve a raw import string to a relative file path, or null if external */
  resolveImport(raw: string, fromFile: string, root: string, aliases: Record<string, string>): string | null;

  /** Optional: infer an implicit receiver for a call (e.g. `this` in JS) */
  inferImplicitReceiver?(call: RawCall, context: ParseContext): string | null;
}
