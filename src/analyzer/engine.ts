import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanFiles } from './scanner.js';
import { langForFile } from '../parser/languages.js';
import { getParser, loadLanguage } from '../parser/loader.js';
import { extractFromTree, clearQueryCache } from '../parser/extract.js';
import { extractVueScript, extractVueTemplateRefs } from '../parser/lang-vue.js';
import { resolveLinks, resolveLinksWithStats } from './resolver.js';
import { enrichMetadata } from './enrich.js';
import { Database } from '../store/db.js';
import type { CodeSymbol, ExtractionResult, RawImport, RawCall, RawHeritage, RawReExport, AnalysisStats } from '../types.js';
import type Parser from 'web-tree-sitter';
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
  const allReExports: RawReExport[] = [];
  const resolvedImportPaths = new Map<string, string>();
  const parsedFiles = new Set<string>();
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
        allReExports.push(...result.reExports);

        // Resolve import paths eagerly
        for (const imp of result.imports) {
          const resolved = file.spec.resolveImport(imp.modulePath, imp.filePath, rootPath, aliases);
          if (resolved) {
            resolvedImportPaths.set(`${imp.filePath}::${imp.modulePath}`, resolved);
          }
        }

        // Resolve re-export paths
        for (const re of result.reExports) {
          const resolved = file.spec.resolveImport(re.modulePath, re.filePath, rootPath, aliases);
          if (resolved) {
            resolvedImportPaths.set(`${re.filePath}::${re.modulePath}`, resolved);
          }
        }

        db.upsertFileHash(file.relativePath, source);
        parsedFiles.add(file.relativePath);
        filesParsed++;
        if (opts.verbose) console.log(`[parse] ${file.relativePath}: ${result.symbols.length} symbols`);
      } catch (err) {
        if (opts.verbose) console.error(`[error] ${file.relativePath}: ${err}`);
      }
    }
  }

  // Phase 4: Load unchanged files' symbols for cross-file resolution
  if (!opts.force) {
    for (const [, group] of langGroups) {
      for (const file of group) {
        if (!parsedFiles.has(file.relativePath)) {
          const existing = db.getSymbolsByFile(file.relativePath);
          if (existing.length > 0) {
            symbolsByFile.set(file.relativePath, existing);
            allSymbols.push(...existing);
          }
        }
      }
    }
  }

  // Phase 5: Resolve cross-file links
  const resolution = resolveLinksWithStats({
    symbolsByFile,
    allSymbols,
    imports: allImports,
    calls: allCalls,
    heritage: allHeritage,
    reExports: allReExports,
    resolvedImportPaths,
  });
  const links = resolution.links;
  if (opts.verbose) {
    console.log(`[link] Resolved ${links.length} relationships`);
    if (resolution.unresolvedImports > 0 || resolution.unresolvedCalls > 0) {
      console.log(`[link] ⚠ ${resolution.unresolvedImports} unresolved imports, ${resolution.unresolvedCalls} unresolved calls (internal)`);
    }
    if (resolution.externalImports > 0 || resolution.externalCalls > 0) {
      console.log(`[link] ✓ ${resolution.externalImports} external imports, ${resolution.externalCalls} external calls (expected)`);
    }
  }

  // Phase 6: Enrich — compute roles, heat, zones from resolved graph
  const enriched = enrichMetadata({ symbols: allSymbols, links });
  if (opts.verbose) console.log(`[enrich] Computed metadata for ${allSymbols.length} symbols, ${enriched.zones.size} zones`);

  // Phase 6.5: Test coverage — count symbols referenced from test files
  const testFileSymbolIds = new Set<string>();
  const testFiles = new Set<string>();
  for (const sym of allSymbols) {
    if (isTestFile(sym.filePath)) {
      testFileSymbolIds.add(sym.id);
      testFiles.add(sym.filePath);
    }
  }
  const testedSymbolIds = new Set<string>();
  for (const link of links) {
    if (link.type === 'contains') continue;
    // Link from test file symbol → production symbol
    const fromIsTest = testFileSymbolIds.has(link.fromId) ||
      [...testFiles].some(f => link.fromId.startsWith(f + '#'));
    if (fromIsTest && !testFileSymbolIds.has(link.toId)) {
      testedSymbolIds.add(link.toId);
    }
  }
  const exportedProduction = allSymbols.filter(s => s.exported && !isTestFile(s.filePath));

  // Phase 7: Persist to database in single transaction
  db.transaction(() => {
    if (opts.force) {
      db.clearSymbolsAndLinks();
    } else {
      for (const fp of parsedFiles) db.deleteFileData(fp);
    }
    for (const sym of allSymbols) {
      if (opts.force || parsedFiles.has(sym.filePath)) db.insertSymbol(sym);
    }
    for (const link of links) db.insertLink(link);
    for (const [filePath, zone] of enriched.zones) db.setFileZone(filePath, zone);
    db.setMeta('unresolved_imports', String(resolution.unresolvedImports));
    db.setMeta('unresolved_calls', String(resolution.unresolvedCalls));
    db.setMeta('external_imports', String(resolution.externalImports));
    db.setMeta('external_calls', String(resolution.externalCalls));
    db.setMeta('test_files', String(testFiles.size));
    db.setMeta('tested_symbols', String(testedSymbolIds.size));
    db.setMeta('exported_production_symbols', String(exportedProduction.length));
    db.rebuildSearch();
  });

  const stats: AnalysisStats = {
    filesScanned: files.length,
    filesParsed,
    symbolCount: allSymbols.length,
    linkCount: links.length,
    durationMs: Date.now() - t0,
    unresolvedImports: resolution.unresolvedImports,
    unresolvedCalls: resolution.unresolvedCalls,
    externalImports: resolution.externalImports,
    externalCalls: resolution.externalCalls,
  };

  if (opts.verbose) {
    console.log(`[done] ${stats.symbolCount} symbols, ${stats.linkCount} links in ${stats.durationMs}ms`);
  }

  clearQueryCache();
  db.close();
  return stats;
}

function parseFile(
  source: string,
  filePath: string,
  spec: LangSpec,
  parser: Parser,
  lang: Parser.Language,
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

  // Vue SFC: also extract references from <template> block
  if (spec.id === 'vue') {
    const templateCalls = extractVueTemplateRefs(source, filePath);
    result.calls.push(...templateCalls);
  }

  return result;
}

/** Check if a file path looks like a test/spec file */
function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    /^tests?[/\\]/.test(filePath) ||
    /__tests__[/\\]/.test(filePath) ||
    /_test\.(go|py|rb|rs|java|php)$/.test(filePath) ||
    /^test_.*\.py$/.test(filePath.split('/').pop() ?? '');
}
