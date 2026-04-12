// ── Core domain types for milens code intelligence ──

export type SymbolKind =
  | 'function' | 'class' | 'method' | 'interface'
  | 'variable' | 'type' | 'enum' | 'struct' | 'trait' | 'module'
  | 'section';

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  parentId?: string;
  signature?: string;
  role?: SymbolRole;
  heat?: number;
}

export type SymbolRole = 'entrypoint' | 'hub' | 'utility' | 'leaf' | 'datatype';

export type LinkType = 'imports' | 'calls' | 'extends' | 'implements' | 'contains';

export interface SymbolLink {
  id: string;
  fromId: string;
  toId: string;
  type: LinkType;
  confidence: number;
  line?: number;
}

export interface RawImport {
  filePath: string;
  modulePath: string;
  names: Array<{ name: string; alias?: string }>;
  isDefault: boolean;
  isWildcard: boolean;
  line: number;
}

export interface RawCall {
  filePath: string;
  enclosingSymbolId: string;
  calleeName: string;
  receiver?: string;
  line: number;
}

export interface RawHeritage {
  filePath: string;
  childName: string;
  parentName: string;
  type: 'extends' | 'implements';
  line: number;
}

export interface ExtractionResult {
  symbols: CodeSymbol[];
  imports: RawImport[];
  calls: RawCall[];
  heritage: RawHeritage[];
  exportedNames: Set<string>;
  reExports: RawReExport[];
  typeBindings: RawTypeBinding[];
  assignmentBindings: RawAssignmentBinding[];
  returnTypes: RawReturnType[];
  callResultBindings: RawCallResultBinding[];
}

export interface RawReExport {
  filePath: string;
  modulePath: string;
  names: string[];    // specific names, empty = wildcard (export * from)
  line: number;
}

export interface RawTypeBinding {
  filePath: string;
  variableName: string;  // e.g., "userService", "db", "repo"
  typeName: string;       // e.g., "UserService", "Database", "UserRepository"
  line: number;
  scope?: string;         // enclosing symbol ID for scope-aware lookup (null = module-level)
}

export interface RawAssignmentBinding {
  filePath: string;
  target: string;    // variable being assigned to (e.g., "b")
  source: string;    // identifier being assigned from (e.g., "a")
  line: number;
  scope?: string;    // enclosing symbol ID
}

export interface RawReturnType {
  filePath: string;
  functionName: string;  // function or method name
  returnType: string;    // explicit return type annotation (e.g., "User")
  line: number;
  parentName?: string;   // enclosing class name for methods
}

export interface RawCallResultBinding {
  filePath: string;
  target: string;      // variable receiving the call result (e.g., "user")
  calleeName: string;  // function being called (e.g., "getUser")
  receiver?: string;   // receiver for member calls (e.g., "service")
  line: number;
  scope?: string;      // enclosing symbol ID
}

export interface AnalysisStats {
  filesScanned: number;
  filesParsed: number;
  symbolCount: number;
  linkCount: number;
  durationMs: number;
  unresolvedImports: number;
  unresolvedCalls: number;
  externalImports: number;
  externalCalls: number;
}

export interface RepoEntry {
  rootPath: string;
  dbPath: string;
  analyzedAt: string;
  hash: string;
}
