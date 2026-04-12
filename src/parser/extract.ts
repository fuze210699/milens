import type Parser from 'web-tree-sitter';
import type { CodeSymbol, RawImport, RawCall, RawHeritage, RawReExport, RawTypeBinding, ExtractionResult, SymbolKind } from '../types.js';

// ── Declarative language specification ──

export interface LangSpec {
  id: string;
  extensions: string[];
  wasmName: string;
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
  return names;
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

  for (const { key, kind } of SYMBOL_QUERY_TYPES) {
    const queryStr = spec.queries[key];
    if (!queryStr) continue;

    for (const match of runQuery(queryStr)) {
      const name = captureText(match, 'name');
      const defNode = captureNode(match, 'def');
      if (!name || !defNode) continue;

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

      imports.push({
        filePath,
        modulePath: cleanSource,
        names,
        isDefault: false,
        isWildcard: names.length === 0,
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

  // ── Extract type bindings (variable → type mappings) ──

  if (spec.queries.typeBindings) {
    const seen = new Map<string, number>(); // varName → line (dedup: last wins)
    for (const match of runQuery(spec.queries.typeBindings)) {
      const varName = captureText(match, 'var');
      const typeName = captureText(match, 'type');
      if (!varName || !typeName) continue;

      const defNode = captureNode(match, 'var');
      const line = defNode ? defNode.startPosition.row + 1 : 0;

      // Deduplicate: prefer type annotation over new expression (later match wins)
      const existingLine = seen.get(varName);
      if (existingLine !== undefined && existingLine === line) continue;
      seen.set(varName, line);

      typeBindings.push({ filePath, variableName: varName, typeName, line });
    }
  }

  return { symbols, imports, calls, heritage, exportedNames, reExports, typeBindings };
}
