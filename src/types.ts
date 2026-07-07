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
  isDynamic?: boolean;
  line: number;
}

export interface RawCall {
  filePath: string;
  enclosingSymbolId: string;
  calleeName: string;
  receiver?: string;
  line: number;
  /** True when `calleeName` was captured from an argument position (e.g. `onMounted(handler)`,
   *  a decorator argument) rather than the actual invoked function/method of a call expression.
   *  These are a weaker signal — the identifier may just be a plain local variable, not a
   *  function reference — so the resolver requires same-file/imported corroboration for them
   *  instead of the unconditional "unique name globally" fast path. */
  isArgumentRef?: boolean;
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

// ── Annotation & Memory types ──

export type AnnotationKey =
  | 'note' | 'bug' | 'security' | 'architecture'
  | 'workflow' | 'test' | 'dependency' | 'refactor';

export interface Annotation {
  id: string;
  symbol: string;
  key: AnnotationKey;
  value: string;
  agent?: string;
  sessionId?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  agent: string;
  status: 'active' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  toolCallsCount: number;
  annotationsCount: number;
  context?: string;
}

export interface EvolutionEvent {
  id: number;
  annotationId: string;
  event: 'created' | 'confidence_up' | 'confidence_down' | 'promoted' | 'demoted' | 'archived';
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

// ── Hook system types ──

export interface HookConfig {
  enabled: boolean;
  onSessionStart: boolean;
  onSessionEnd: boolean;
  onFileChange: boolean;
  onPreCommit: boolean;
  onPreCompact: boolean;
  onPostCompact: boolean;
}

export interface HookSessionContext {
  agent: string;
  sessionId: string;
  rootPath: string;
}

// ── Security types ──

export type SecurityCategory =
  | 'secrets' | 'injection' | 'unicode' | 'dangerous'
  | 'config' | 'data-leak' | 'crypto' | 'auth' | 'file-access';

export interface SecurityRule {
  id: string;
  category: SecurityCategory;
  owasp: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  name: string;
  description: string;
  patterns: RegExp[];
  fileGlob?: string;
  excludeGlob?: string;
  fix?: string;
  confidence: number;
  enabled: boolean;
}

export interface SecurityMatch {
  ruleId: string;
  category: SecurityCategory;
  severity: string;
  owasp: string;
  file: string;
  line: number;
  match: string;
  context: string;
  fix?: string;
}

export interface SecurityReport {
  summary: {
    totalScanned: number;
    findings: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    score: number;
  };
  findings: SecurityMatch[];
}

// ── Dependency audit types ──

export type Ecosystem = 'npm' | 'python' | 'rust' | 'go' | 'java' | 'unknown';

export interface DependInfo {
  name: string;
  version: string;
  ecosystem: Ecosystem;
}

export interface VulnInfo {
  id: string;
  cve?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  package: string;
  affectedVersions: string;
  fixedVersion?: string;
  description: string;
}

export interface VulnReport {
  ecosystem: Ecosystem;
  totalDependencies: number;
  vulnerableDependencies: number;
  findings: VulnInfo[];
}

// ── Cross-repo reference types ──

export interface CrossRepoEntry {
  name: string;
  visibility: 'Public' | 'Private';
  license?: string;
  role: string;
  isUpstream?: boolean;
}

export interface CrossRepoContract {
  package: string;
  version: string;
}

export interface CrossRepoDependency {
  symbol: string;
  source: string;
  usedBy: string;
}

export interface CrossRepoConfig {
  repos: CrossRepoEntry[];
  contract?: CrossRepoContract;
  dependencies?: CrossRepoDependency[];
}
