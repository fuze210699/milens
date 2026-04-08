// ─── Language Detection ──────────────────────────────────
export type SupportedLanguage = 'javascript' | 'typescript' | 'vue' | 'php';

// ─── File Info ───────────────────────────────────────────
export interface FileInfo {
  path: string;           // relative to repo root
  absolutePath: string;
  language: SupportedLanguage;
  size: number;
  lastModified: number;   // epoch ms
}

// ─── Pipeline Phase Results ──────────────────────────────
export interface ScanResult {
  files: FileInfo[];
  rootPath: string;
  duration: number;        // ms
}

export interface PipelineStats {
  totalFiles: number;
  totalSymbols: number;
  totalRelationships: number;
  parseErrors: number;
  duration: number;         // ms
  byLanguage: Record<string, number>;
}

export interface PipelineOptions {
  rootPath: string;
  outputDir?: string;       // defaults to .milens/
  include?: string[];       // extra include patterns
  exclude?: string[];       // extra exclude patterns
  verbose?: boolean;
}

// ─── Project Config ──────────────────────────────────────
export interface ProjectConfig {
  rootPath: string;
  aliases: Record<string, string>;   // e.g. { '@': 'src', '~': 'src' }
  psr4: Record<string, string>;      // PHP namespace → directory mapping
}

// ─── Symbol Table ────────────────────────────────────────
export interface SymbolDef {
  nodeId: string;
  name: string;
  filePath: string;
  label: import('./graph.js').NodeLabel;
  isExported: boolean;
  parameterCount?: number;
}

export interface ImportBinding {
  localName: string;
  sourceName: string;       // exported name (or 'default')
  sourceFile: string;       // resolved file path
  isNamespace: boolean;     // import * as X
}

export type ImportMap = Map<string, ImportBinding>;  // localName → binding
