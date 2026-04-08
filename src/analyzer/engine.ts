import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanFiles } from './scanner.js';
import { langForFile } from '../parser/languages.js';
import { getParser, loadLanguage } from '../parser/loader.js';
import { extractFromTree, clearQueryCache } from '../parser/extract.js';
import { extractVueScript } from '../parser/lang-vue.js';
import { resolveLinks } from './resolver.js';
import { Database } from '../store/db.js';
import type { CodeSymbol, ExtractionResult, RawImport, RawCall, RawHeritage, AnalysisStats } from '../types.js';
import type { LangSpec } from '../parser/extract.js';

interface EngineOptions {
  rootPath: string;
  dbPath: string;
  verbose?: boolean;
  force?: boolean;
  aliases?: Record<string, string>;
}

export async function analyze(opts: EngineOptions): Promise<AnalysisStats> {
  const t0 = Date.now();
  const rootPath = resolve(opts.rootPath);
  const db = new Database(opts.dbPath);
  const aliases = opts.aliases ?? {};

  if (opts.force) db.clear();

  // Phase 1: Scan files
  const files = scanFiles(rootPath, opts.verbose);
  if (opts.verbose) console.log(`[scan] Found ${files.length} source files`);

  // Phase 2: Group files by language for cache-friendly processing
  const langGroups = new Map<string, Array<{ relativePath: string; absolutePath: string; spec: LangSpec }>>();
  for (const file of files) {
    const spec = langForFile(file.relativePath);
    if (!spec) continue;
    const group = langGroups.get(spec.wasmName) ?? [];
    group.push({ ...file, spec });
    langGroups.set(spec.wasmName, group);
  }

  // Phase 3: Parse & extract — process each language group together
  // This keeps the same parser/language/compiled queries hot in cache
  const symbolsByFile = new Map<string, CodeSymbol[]>();
  const allSymbols: CodeSymbol[] = [];
  const allImports: RawImport[] = [];
  const allCalls: RawCall[] = [];
  const allHeritage: RawHeritage[] = [];
  const resolvedImportPaths = new Map<string, string>();
  let filesParsed = 0;

  for (const [wasmName, group] of langGroups) {
    // Pre-load parser + language once per group
    const parser = await getParser(wasmName);
    const lang = await loadLanguage(wasmName);

    for (const file of group) {
      const source = readFileSync(file.absolutePath, 'utf-8');

      // Skip unchanged files (incremental)
      if (!opts.force && db.isFileUpToDate(file.relativePath, source)) {
        if (opts.verbose) console.log(`[skip] ${file.relativePath} (unchanged)`);
        continue;
      }

      try {
        const result = parseFile(source, file.relativePath, file.spec, parser, lang);
        if (!result) continue;

        symbolsByFile.set(file.relativePath, result.symbols);
        allSymbols.push(...result.symbols);
        allImports.push(...result.imports);
        allCalls.push(...result.calls);
        allHeritage.push(...result.heritage);

        // Resolve import paths eagerly
        for (const imp of result.imports) {
          const resolved = file.spec.resolveImport(imp.modulePath, imp.filePath, rootPath, aliases);
          if (resolved) {
            resolvedImportPaths.set(`${imp.filePath}::${imp.modulePath}`, resolved);
          }
        }

        db.upsertFileHash(file.relativePath, source);
        filesParsed++;
        if (opts.verbose) console.log(`[parse] ${file.relativePath}: ${result.symbols.length} symbols`);
      } catch (err) {
        if (opts.verbose) console.error(`[error] ${file.relativePath}: ${err}`);
      }
    }
  }

  // Phase 4: Resolve cross-file links
  const links = resolveLinks({
    symbolsByFile,
    allSymbols,
    imports: allImports,
    calls: allCalls,
    heritage: allHeritage,
    resolvedImportPaths,
  });
  if (opts.verbose) console.log(`[link] Resolved ${links.length} relationships`);

  // Phase 5: Persist to database in single transaction
  db.transaction(() => {
    db.clearSymbolsAndLinks();
    for (const sym of allSymbols) db.insertSymbol(sym);
    for (const link of links) db.insertLink(link);
    db.rebuildSearch();
  });

  const stats: AnalysisStats = {
    filesScanned: files.length,
    filesParsed,
    symbolCount: allSymbols.length,
    linkCount: links.length,
    durationMs: Date.now() - t0,
  };

  if (opts.verbose) {
    console.log(`[done] ${stats.symbolCount} symbols, ${stats.linkCount} links in ${stats.durationMs}ms`);
  }

  db.close();
  return stats;
}

function parseFile(
  source: string,
  filePath: string,
  spec: LangSpec,
  parser: import('web-tree-sitter').default,
  lang: import('web-tree-sitter').default.Language,
): ExtractionResult | null {
  let code = source;
  let lineOffset = 0;

  // Vue SFC: extract <script> block
  if (spec.id === 'vue') {
    const script = extractVueScript(source);
    if (!script) return null;
    code = script.content;
    lineOffset = script.lineOffset;
  }

  const tree = parser.parse(code);
  const result = extractFromTree(tree, lang, spec, filePath);

  // Adjust line numbers for Vue offset
  if (lineOffset > 0) {
    for (const sym of result.symbols) {
      sym.startLine += lineOffset;
      sym.endLine += lineOffset;
    }
    for (const imp of result.imports) imp.line += lineOffset;
    for (const call of result.calls) call.line += lineOffset;
  }

  return result;
}
