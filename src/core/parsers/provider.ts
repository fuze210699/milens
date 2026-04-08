import type { GraphNode, GraphRelationship } from '../../types/graph.js';
import type { SupportedLanguage, ProjectConfig } from '../../types/pipeline.js';

export interface ParsedSymbols {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  imports: RawImport[];
  exports: RawExport[];
  calls: RawCall[];
}

export interface RawImport {
  /** The raw import path string e.g. './utils' or 'App\\Models\\User' */
  source: string;
  /** Named bindings: localName → exportedName */
  bindings: Array<{ local: string; imported: string }>;
  /** import * as X */
  isNamespace: boolean;
  /** default import */
  isDefault: boolean;
  /** Line number of the import statement */
  line: number;
}

export interface RawExport {
  /** Exported name (or 'default') */
  name: string;
  /** Local name if re-exported differently */
  localName?: string;
  /** Line number */
  line: number;
}

export type CallKind = 'direct' | 'member' | 'construct' | 'static';

export interface RawCall {
  /** The callee name: 'formatDate', 'userService.findById', 'UserService' (for new) */
  callee: string;
  /** Kind of call: direct function, member access, constructor, static */
  kind: CallKind;
  /** For member/static: the receiver name (e.g. 'userService', 'User') */
  receiver?: string;
  /** For member/static: the method name */
  method?: string;
  /** The containing function/method node ID */
  containerId: string;
  /** Line number */
  line: number;
}

export interface LanguageProvider {
  id: SupportedLanguage;
  extensions: string[];
  treeSitterLang: string;

  /**
   * Parse source code and extract symbols, relationships, imports, exports.
   * @param source - File source code
   * @param filePath - Relative file path
   * @param tree - Tree-sitter parse tree
   */
  extract(source: string, filePath: string, tree: any): ParsedSymbols;

  /**
   * Resolve an import path to a relative file path within the project.
   * Returns null if external/unresolvable.
   */
  resolveImport(importPath: string, fromFile: string, config: ProjectConfig): string | null;
}
