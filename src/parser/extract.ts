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

  // Helper: run a query and get matches
  function runQuery(queryStr: string) {
    try {
      const q = lang.query(queryStr);
      return q.matches(tree.rootNode);
    } catch {
      return [];
    }
  }

  function captureText(match: Parser.QueryMatch, captureName: string): string | undefined {
    const c = match.captures.find(c => c.name === captureName);
    return c?.node.text;
  }

  function captureNode(match: Parser.QueryMatch, captureName: string): Parser.SyntaxNode | undefined {
    return match.captures.find(c => c.name === captureName)?.node;
  }

  function makeSymbolId(kind: SymbolKind, name: string, line: number): string {
    return `${filePath}#${kind}:${name}:${line}`;
  }

  // ── Extract symbol definitions ──

  const symbolQueryTypes: Array<{ key: keyof typeof spec.queries; kind: SymbolKind }> = [
    { key: 'functions', kind: 'function' },
    { key: 'classes', kind: 'class' },
    { key: 'methods', kind: 'method' },
    { key: 'interfaces', kind: 'interface' },
    { key: 'enums', kind: 'enum' },
    { key: 'structs', kind: 'struct' },
    { key: 'traits', kind: 'trait' },
  ];

  for (const { key, kind } of symbolQueryTypes) {
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

      // For methods, find parent class
      if (kind === 'method') {
        const parentClass = symbols.find(
          s => (s.kind === 'class' || s.kind === 'struct' || s.kind === 'trait') &&
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

  // ── Extract calls ──

  if (spec.queries.calls) {
    for (const match of runQuery(spec.queries.calls)) {
      const callee = captureText(match, 'callee');
      const defNode = captureNode(match, 'def');
      if (!callee || !defNode) continue;

      const callLine = defNode.startPosition.row + 1;
      const receiver = captureText(match, 'receiver');

      // Find enclosing symbol
      const enclosing = symbols.find(
        s => s.startLine <= callLine && s.endLine >= callLine
      );

      calls.push({
        filePath,
        enclosingSymbolId: enclosing?.id ?? `${filePath}#module:_top:0`,
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
