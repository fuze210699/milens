import type Parser from 'web-tree-sitter';
import type { CodeSymbol, RawImport, RawCall, RawHeritage, RawReExport, RawTypeBinding, RawAssignmentBinding, RawReturnType, RawCallResultBinding, ExtractionResult, SymbolKind } from '../types.js';

// ── Declarative language specification ──

export interface LangSpec {
  id: string;
  extensions: string[];
  wasmName: string;
  allTopLevelExported?: boolean; // Python: all top-level symbols exported when __all__ absent
  uppercaseExported?: boolean;   // Go: uppercase first letter = exported
  mroStrategy?: 'first-wins' | 'c3' | 'ruby-mixin' | 'none'; // Method resolution order for inheritance
  importSemantics?: 'named' | 'wildcard-leaf' | 'wildcard-transitive' | 'namespace'; // How imports expose symbols
  /** Determine whether a symbol is exported (overrides allTopLevelExported/uppercaseExported) */
  isExported?: (symbol: CodeSymbol) => boolean;
  queries: {
    functions?: string;
    classes?: string;
    methods?: string;
    interfaces?: string;
    enums?: string;
    structs?: string;
    traits?: string;
    modules?: string;
    types?: string;
    variables?: string;
    imports?: string;
    calls?: string;
    exports?: string;
    reExports?: string;
    heritage?: string;
    typeBindings?: string;
    assignmentChains?: string;
    returnTypes?: string;
    callResultBindings?: string;
  };
  resolveImport(raw: string, fromFile: string, root: string, aliases: Record<string, string>): string | null;
}

// ── Compiled query cache: compile once per (language, queryString) ──
// Key = langId + "|" + queryString, Value = compiled Query (or null if invalid)
const queryCache = new Map<string, Parser.Query | null>();

// Assign a unique numeric ID to each Language instance (ptr/toString are unreliable)
const langIds = new WeakMap<Parser.Language, number>();
let nextLangId = 0;

function getLangId(lang: Parser.Language): number {
  let id = langIds.get(lang);
  if (id === undefined) {
    id = nextLangId++;
    langIds.set(lang, id);
  }
  return id;
}

function getOrCompileQuery(lang: Parser.Language, queryStr: string): Parser.Query | null {
  const cacheKey = `${getLangId(lang)}|${queryStr}`;
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey)!;

  try {
    const q = lang.query(queryStr);
    queryCache.set(cacheKey, q);
    return q;
  } catch {
    queryCache.set(cacheKey, null);
    return null;
  }
}

export function clearQueryCache(): void {
  queryCache.clear();
}

// ── Helpers (stateless, hoisted out of hot path) ──

function captureText(match: Parser.QueryMatch, captureName: string): string | undefined {
  const captures = match.captures;
  for (let i = 0; i < captures.length; i++) {
    if (captures[i].name === captureName) return captures[i].node.text;
  }
}

function captureNode(match: Parser.QueryMatch, captureName: string): Parser.SyntaxNode | undefined {
  const captures = match.captures;
  for (let i = 0; i < captures.length; i++) {
    if (captures[i].name === captureName) return captures[i].node;
  }
}

// ── Import name extraction from AST ──

function collectImportNames(defNode: Parser.SyntaxNode): Array<{ name: string; alias?: string }> {
  const names: Array<{ name: string; alias?: string }> = [];
  walkImportNames(defNode, names);

  // Dynamic imports: const { join: joinPath } = await import('node:path')
  // The defNode is the call_expression(import(...)) — walk up to find destructuring
  if (names.length === 0 && defNode.type === 'call_expression') {
    let cur: Parser.SyntaxNode | null = defNode.parent;
    while (cur && cur.type !== 'variable_declarator' && cur.type !== 'lexical_declaration') {
      cur = cur.parent;
    }
    if (cur?.type === 'variable_declarator') {
      const pattern = cur.childForFieldName('name');
      if (pattern?.type === 'object_pattern') {
        collectObjectPatternNames(pattern, names);
      }
    }
  }

  // Destructured require: const { execFileSync: execFile } = require('node:child_process')
  // The defNode is the lexical_declaration — find variable_declarator with object_pattern
  if (names.length === 0 && defNode.type === 'lexical_declaration') {
    for (let i = 0; i < defNode.namedChildCount; i++) {
      const varDecl = defNode.namedChild(i)!;
      if (varDecl.type === 'variable_declarator') {
        const pattern = varDecl.childForFieldName('name');
        if (pattern?.type === 'object_pattern') {
          collectObjectPatternNames(pattern, names);
        }
      }
    }
  }

  return names;
}

/** Extract destructured names from an object_pattern: { join: joinPath, existsSync } */
function collectObjectPatternNames(pattern: Parser.SyntaxNode, out: Array<{ name: string; alias?: string }>): void {
  for (let i = 0; i < pattern.namedChildCount; i++) {
    const child = pattern.namedChild(i)!;
    if (child.type === 'pair_pattern') {
      // { original: alias } → use alias as the imported name (that's what's called in code)
      const key = child.childForFieldName('key');
      const value = child.childForFieldName('value');
      if (value?.type === 'identifier') {
        out.push({ name: value.text, alias: key?.text });
      }
    } else if (child.type === 'shorthand_property_identifier_pattern') {
      // { existsSync } → name == alias
      out.push({ name: child.text });
    }
  }
}

/** Detect default import: `import Foo from '...'` has an identifier directly under import_clause */
function isDefaultImportNode(defNode: Parser.SyntaxNode): boolean {
  const clauses = defNode.type === 'import_clause'
    ? [defNode]
    : defNode.descendantsOfType('import_clause');
  for (const clause of clauses) {
    for (let i = 0; i < clause.childCount; i++) {
      if (clause.child(i)!.type === 'identifier') return true;
    }
  }
  return false;
}

function walkImportNames(node: Parser.SyntaxNode, out: Array<{ name: string; alias?: string }>): void {
  // TS/JS: import { Foo, Bar as B }
  if (node.type === 'import_specifier') {
    const n = node.childForFieldName('name');
    const a = node.childForFieldName('alias');
    if (n) out.push({ name: n.text, alias: a?.text });
    return;
  }
  // TS/JS: default import (identifier directly under import_clause)
  if (node.type === 'identifier' && node.parent?.type === 'import_clause') {
    out.push({ name: node.text });
    return;
  }
  // Python: from x import Foo, Bar as B
  if (node.type === 'import_from_statement') {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i)!;
      if (child === node.childForFieldName('module_name')) continue;
      if (child.type === 'dotted_name') out.push({ name: child.text });
      else if (child.type === 'aliased_import') {
        const n = child.childForFieldName('name');
        const a = child.childForFieldName('alias');
        if (n) out.push({ name: n.text, alias: a?.text });
      }
    }
    return;
  }
  // Recurse for other node types (import_clause, named_imports, etc.)
  for (let i = 0; i < node.namedChildCount; i++) {
    walkImportNames(node.namedChild(i)!, out);
  }
}

// ── Heritage type detection from AST ancestry ──

function detectHeritageType(node: Parser.SyntaxNode): 'extends' | 'implements' {
  let cur: Parser.SyntaxNode | null = node.parent;
  while (cur) {
    const t = cur.type;
    if (t === 'implements_clause' || t === 'super_interfaces' || t === 'class_interface_clause' || t === 'impl_item') {
      return 'implements';
    }
    if (t === 'extends_clause' || t === 'superclass' || t === 'base_clause') {
      return 'extends';
    }
    cur = cur.parent;
  }
  return 'extends';
}

// ── Enclosing symbol lookup via sorted spans + binary search ──

interface Span { startLine: number; endLine: number; id: string }

function buildSpanIndex(symbols: CodeSymbol[]): Span[] {
  const spans: Span[] = [];
  for (const s of symbols) {
    if (s.kind === 'function' || s.kind === 'method' || s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait') {
      spans.push({ startLine: s.startLine, endLine: s.endLine, id: s.id });
    }
  }
  // Sort by startLine desc so we find the innermost (tightest) enclosing first
  spans.sort((a, b) => b.startLine - a.startLine);
  return spans;
}

function findEnclosing(spans: Span[], line: number): string | undefined {
  // Linear scan on pre-sorted array — tightest match wins (innermost symbol)
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i];
    if (sp.startLine <= line && sp.endLine >= line) return sp.id;
  }
}

// ── Symbol query type mapping (constant) ──

const SYMBOL_QUERY_TYPES: ReadonlyArray<{ key: keyof LangSpec['queries']; kind: SymbolKind }> = [
  { key: 'functions', kind: 'function' },
  { key: 'classes', kind: 'class' },
  { key: 'methods', kind: 'method' },
  { key: 'interfaces', kind: 'interface' },
  { key: 'enums', kind: 'enum' },
  { key: 'structs', kind: 'struct' },
  { key: 'traits', kind: 'trait' },
  { key: 'modules', kind: 'module' },
  { key: 'types', kind: 'type' },
  { key: 'variables', kind: 'variable' },
];

// Container kinds for method → parent resolution
const CONTAINER_KINDS = new Set<SymbolKind>(['class', 'struct', 'trait', 'module']);

// ── Universal symbol extractor ──

export function extractFromTree(
  tree: Parser.Tree,
  lang: Parser.Language,
  spec: LangSpec,
  filePath: string,
): ExtractionResult {
  const symbols: CodeSymbol[] = [];
  const imports: RawImport[] = [];
  const calls: RawCall[] = [];
  const heritage: RawHeritage[] = [];
  const reExports: RawReExport[] = [];
  const typeBindings: RawTypeBinding[] = [];
  const assignmentBindings: RawAssignmentBinding[] = [];
  const returnTypes: RawReturnType[] = [];
  const callResultBindings: RawCallResultBinding[] = [];
  const exportedNames = new Set<string>();

  const root = tree.rootNode;

  function runQuery(queryStr: string): Parser.QueryMatch[] {
    const q = getOrCompileQuery(lang, queryStr);
    return q ? q.matches(root) : [];
  }

  function makeSymbolId(kind: SymbolKind, name: string, line: number): string {
    return `${filePath}#${kind}:${name}:${line}`;
  }

  // ── Extract symbol definitions ──

  const seenSymbolKeys = new Set<string>();
    for (const { key, kind } of SYMBOL_QUERY_TYPES) {
    const queryStr = spec.queries[key];
    if (!queryStr) continue;

    for (const match of runQuery(queryStr)) {
      const name = captureText(match, 'name');
      const defNode = captureNode(match, 'def');
      if (!name || !defNode) continue;

      // Filter: if query captures @_attr (Ruby attr_reader/writer/accessor), verify method name
      const attrCapture = captureText(match, '_attr');
      if (attrCapture && attrCapture !== 'attr_reader' && attrCapture !== 'attr_writer' && attrCapture !== 'attr_accessor') continue;

      // Skip duplicate: same name+line already captured with a higher-priority kind
      const symKey = `${name}:${defNode.startPosition.row + 1}`;
      if (seenSymbolKeys.has(symKey)) continue;
      seenSymbolKeys.add(symKey);

      const sym: CodeSymbol = {
        id: makeSymbolId(kind, name, defNode.startPosition.row + 1),
        name,
        kind,
        filePath,
        startLine: defNode.startPosition.row + 1,
        endLine: defNode.endPosition.row + 1,
        exported: false,
      };

      // For methods, find parent class/struct/trait
      if (kind === 'method') {
        const parentClass = symbols.find(
          s => CONTAINER_KINDS.has(s.kind) &&
               s.startLine <= sym.startLine && s.endLine >= sym.endLine
        );
        if (parentClass) sym.parentId = parentClass.id;
      }

      symbols.push(sym);
    }
  }

  // ── Extract exports ──

  if (spec.queries.exports) {
    for (const match of runQuery(spec.queries.exports)) {
      // Filter: if query captures @_all (Python __all__), verify identifier text
      const allCapture = captureText(match, '_all');
      if (allCapture && allCapture !== '__all__') continue;

      const name = captureText(match, 'name');
      if (name) exportedNames.add(name);
    }
  }

  // Mark exported symbols
  for (const sym of symbols) {
    if (exportedNames.has(sym.name)) sym.exported = true;
  }

  // Per-language export detection via isExported callback (preferred)
  if (spec.isExported) {
    for (const sym of symbols) {
      if (spec.isExported(sym)) sym.exported = true;
    }
  }

  // Languages like Python: all top-level symbols are exported when no explicit __all__
  if (spec.allTopLevelExported && exportedNames.size === 0 && !spec.isExported) {
    for (const sym of symbols) {
      if (!sym.name.startsWith('_') && sym.kind !== 'module') sym.exported = true;
    }
  }

  // Go convention: uppercase first letter = exported
  if (spec.uppercaseExported && !spec.isExported) {
    for (const sym of symbols) {
      if (sym.name[0] && sym.name[0] === sym.name[0].toUpperCase() && /[A-Z]/.test(sym.name[0])) {
        sym.exported = true;
      }
    }
  }

  // ── Extract imports ──

  if (spec.queries.imports) {
    for (const match of runQuery(spec.queries.imports)) {
      const source = captureText(match, 'source');
      const defNode = captureNode(match, 'def');
      if (!source || !defNode) continue;

      // Filter: if query captures @_req (require() pattern), verify identifier text
      const reqCapture = captureText(match, '_req');
      if (reqCapture && reqCapture !== 'require' && reqCapture !== 'require_relative') continue;

      const cleanSource = source.replace(/^['"]|['"]$/g, '');
      const names = collectImportNames(defNode);
      const isDef = isDefaultImportNode(defNode);

      imports.push({
        filePath,
        modulePath: cleanSource,
        names,
        isDefault: isDef,
        isWildcard: !isDef && names.length === 0,
        line: defNode.startPosition.row + 1,
      });
    }
  }

  // ── Extract calls (with span index for fast enclosing lookup) ──

  if (spec.queries.calls) {
    const spans = buildSpanIndex(symbols);

    for (const match of runQuery(spec.queries.calls)) {
      const callee = captureText(match, 'callee');
      const defNode = captureNode(match, 'def');
      if (!callee || !defNode) continue;

      const callLine = defNode.startPosition.row + 1;
      const receiver = captureText(match, 'receiver');

      calls.push({
        filePath,
        enclosingSymbolId: findEnclosing(spans, callLine) ?? `${filePath}#module:_top:0`,
        calleeName: callee,
        receiver,
        line: callLine,
      });
    }
  }

  // ── Extract heritage (extends/implements) ──

  if (spec.queries.heritage) {
    for (const match of runQuery(spec.queries.heritage)) {
      const child = captureText(match, 'child');
      const parentNode = captureNode(match, 'parent');
      if (!child || !parentNode) continue;

      // Filter: if query captures @_inc (Ruby include/extend/prepend), verify method name
      const incCapture = captureText(match, '_inc');
      if (incCapture && incCapture !== 'include' && incCapture !== 'extend' && incCapture !== 'prepend') continue;

      const defNode = captureNode(match, 'def');
      heritage.push({
        filePath,
        childName: child,
        parentName: parentNode.text,
        type: incCapture ? 'implements' : detectHeritageType(parentNode),
        line: defNode?.startPosition.row ? defNode.startPosition.row + 1 : 0,
      });
    }
  }

  // ── Extract re-exports (export { X } from './y', export * from './y') ──

  if (spec.queries.reExports) {
    for (const match of runQuery(spec.queries.reExports)) {
      const source = captureText(match, 'source');
      const defNode = captureNode(match, 'def');
      if (!source || !defNode) continue;

      const cleanSource = source.replace(/^['"]|['"]$/g, '');
      const names: string[] = [];

      // Collect re-exported names from export_clause
      for (const capture of match.captures) {
        if (capture.name === 'name') names.push(capture.node.text);
      }

      reExports.push({
        filePath,
        modulePath: cleanSource,
        names,
        line: defNode.startPosition.row + 1,
      });
    }
  }

  // ── Extract type bindings (variable → type mappings, scope-aware) ──

  if (spec.queries.typeBindings) {
    const bindingSpans = buildSpanIndex(symbols);
    const seen = new Map<string, number>(); // "scope::varName" → line (dedup: last wins)
    for (const match of runQuery(spec.queries.typeBindings)) {
      const varName = captureText(match, 'var');
      const typeName = captureText(match, 'type');
      if (!varName || !typeName) continue;

      const defNode = captureNode(match, 'var');
      const line = defNode ? defNode.startPosition.row + 1 : 0;

      // Scope: find enclosing function/method/class for this binding
      const scope = findEnclosing(bindingSpans, line);

      // Deduplicate per scope: prefer type annotation over new expression (later match wins)
      const dedupKey = `${scope ?? ''}::${varName}`;
      const existingLine = seen.get(dedupKey);
      if (existingLine !== undefined && existingLine === line) continue;
      seen.set(dedupKey, line);

      typeBindings.push({ filePath, variableName: varName, typeName, line, scope });
    }
  }

  // ── Extract assignment chains (variable = identifier, for type propagation) ──

  if (spec.queries.assignmentChains) {
    const chainSpans = buildSpanIndex(symbols);
    for (const match of runQuery(spec.queries.assignmentChains)) {
      const target = captureText(match, 'target');
      const source = captureText(match, 'source');
      if (!target || !source) continue;

      const defNode = captureNode(match, 'target');
      const line = defNode ? defNode.startPosition.row + 1 : 0;
      const scope = findEnclosing(chainSpans, line);

      assignmentBindings.push({ filePath, target, source, line, scope });
    }
  }

  // ── Extract return types (function → return type annotation) ──

  if (spec.queries.returnTypes) {
    for (const match of runQuery(spec.queries.returnTypes)) {
      const name = captureText(match, 'name');
      const returnType = captureText(match, 'returnType');
      if (!name || !returnType) continue;

      const defNode = captureNode(match, 'name');
      const line = defNode ? defNode.startPosition.row + 1 : 0;

      // For methods, find parent class name
      const parentName = captureText(match, 'className');

      returnTypes.push({ filePath, functionName: name, returnType, line, parentName });
    }
  }

  // ── Extract call result bindings (const x = func()) ──

  if (spec.queries.callResultBindings) {
    const crSpans = buildSpanIndex(symbols);
    for (const match of runQuery(spec.queries.callResultBindings)) {
      const target = captureText(match, 'var');
      const calleeName = captureText(match, 'callee');
      if (!target || !calleeName) continue;

      const defNode = captureNode(match, 'var');
      const line = defNode ? defNode.startPosition.row + 1 : 0;
      const scope = findEnclosing(crSpans, line);
      const receiver = captureText(match, 'receiver');

      callResultBindings.push({ filePath, target, calleeName, receiver, line, scope });
    }
  }

  return { symbols, imports, calls, heritage, exportedNames, reExports, typeBindings, assignmentBindings, returnTypes, callResultBindings };
}
