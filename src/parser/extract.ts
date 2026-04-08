import type Parser from 'web-tree-sitter';
import type { CodeSymbol, RawImport, RawCall, RawHeritage, ExtractionResult, SymbolKind } from '../types.js';

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
    imports?: string;
    calls?: string;
    exports?: string;
    heritage?: string;
  };
  resolveImport(raw: string, fromFile: string, root: string, aliases: Record<string, string>): string | null;
}

// ── Compiled query cache: compile once per (language, queryString) ──
// Key = langPtr + "|" + queryString, Value = compiled Query (or null if invalid)
const queryCache = new Map<string, Parser.Query | null>();

function getOrCompileQuery(lang: Parser.Language, queryStr: string): Parser.Query | null {
  // Use the language pointer address as part of cache key (each Language instance is unique per WASM)
  const cacheKey = `${(lang as any).ptr ?? lang.toString()}|${queryStr}`;
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
];

// Container kinds for method → parent resolution
const CONTAINER_KINDS = new Set<SymbolKind>(['class', 'struct', 'trait']);

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

      const cleanSource = source.replace(/^['"]|['"]$/g, '');
      const itemNode = captureNode(match, 'item');
      const names: Array<{ name: string; alias?: string }> = [];
      if (itemNode) {
        names.push({ name: itemNode.text });
      }

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
      const parent = captureText(match, 'parent');
      if (!child || !parent) continue;

      const defNode = captureNode(match, 'def');
      heritage.push({
        filePath,
        childName: child,
        parentName: parent,
        type: 'extends',
        line: defNode?.startPosition.row ? defNode.startPosition.row + 1 : 0,
      });
    }
  }

  return { symbols, imports, calls, heritage, exportedNames };
}
