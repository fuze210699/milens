import { readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { scanFiles, type ScannedFile } from './scanner.js';
import { langForFile, supportedExtensions } from '../parser/languages.js';
import { getParser, loadLanguage } from '../parser/loader.js';
import { extractFromTree, clearQueryCache } from '../parser/extract.js';
import { extractVueScript, extractVueTemplateRefs, extractVueCompositionApi, extractVueTemplateAst } from '../parser/lang-vue.js';
import { extractHtmlScripts, extractHtmlRefs, extractHtmlLinks } from '../parser/lang-html.js';
import { extractMarkdown } from '../parser/lang-md.js';
import { resolveLinks, resolveLinksWithStats } from './resolver.js';
import { resolveWithScopes, diffResolutions } from './scope-resolver.js';
import { enrichMetadata } from './enrich.js';
import { isTestFile } from '../utils.js';
import { Database } from '../store/db.js';
import { TfIdfProvider, EmbeddingStore, buildEmbeddingText } from '../store/vectors.js';
import { ProgressPhase, type ProgressReporter } from '../ui/progress.js';
import type { CodeSymbol, ExtractionResult, RawImport, RawCall, RawHeritage, RawReExport, RawTypeBinding, RawAssignmentBinding, RawReturnType, RawCallResultBinding, AnalysisStats } from '../types.js';
import type Parser from 'web-tree-sitter';
import type { LangSpec } from '../parser/extract.js';

// ── Cross-phase Tree Cache ──
// Caches parsed syntax trees between parse and resolution phases
// so scope-based resolvers can re-use trees without re-parsing.
const treeCache = new Map<string, Parser.Tree>();
export function getCachedTree(filePath: string): Parser.Tree | undefined {
  return treeCache.get(filePath);
}
export function clearTreeCache(): void {
  treeCache.clear();
}

// ── Async batch file reader ──
// Reads multiple files concurrently with concurrency limit to avoid fd exhaustion
const READ_CONCURRENCY = 32;

async function readFilesAsync(paths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  for (let i = 0; i < paths.length; i += READ_CONCURRENCY) {
    const batch = paths.slice(i, i + READ_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (p) => {
        const content = await readFile(p, 'utf-8');
        return { path: p, content };
      })
    );
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value.path, result.value.content);
      }
    }
  }
  return results;
}

// ── Import resolution cache ──
// Caches resolveImport results to avoid repeated path resolution for the same module
class ImportResolveCache {
  private cache = new Map<string, string | null>();

  resolve(
    spec: LangSpec,
    modulePath: string,
    fromFile: string,
    rootPath: string,
    aliases: Record<string, string>,
  ): string | null {
    // fromDir-based key: same module from same directory resolves identically
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/') + 1);
    const key = `${fromDir}::${modulePath}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const resolved = spec.resolveImport(modulePath, fromFile, rootPath, aliases);
    this.cache.set(key, resolved);
    return resolved;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ── Chunk-based processing ──
// Group files into byte-budget chunks to bound peak memory
const CHUNK_BYTE_BUDGET = 20 * 1024 * 1024; // 20MB source per chunk

interface FileWithSpec {
  relativePath: string;
  absolutePath: string;
  size: number;
  spec: LangSpec;
}

interface EngineOptions {
  rootPath: string;
  dbPath: string;
  verbose?: boolean;
  force?: boolean;
  aliases?: Record<string, string>;
  embeddings?: boolean;
  files?: string[];
  onProgress?: ProgressReporter;
}

function buildChunks(files: FileWithSpec[]): FileWithSpec[][] {
  const chunks: FileWithSpec[][] = [];
  let current: FileWithSpec[] = [];
  let currentBytes = 0;
  for (const file of files) {
    if (current.length > 0 && currentBytes + file.size > CHUNK_BYTE_BUDGET) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function scanFilesWithFilter(rootPath: string, filePaths: string[], verbose = false): ScannedFile[] {
  const exts = new Set(supportedExtensions());
  const results: ScannedFile[] = [];
  for (const relPath of filePaths) {
    const abs = resolve(rootPath, relPath);
    try {
      const stat = statSync(abs);
      if (!stat.isFile()) continue;
    } catch { continue; }
    const ext = '.' + relPath.split('.').pop()?.toLowerCase();
    if (exts.has(ext)) {
      results.push({ relativePath: relPath.replace(/\\/g, '/'), absolutePath: abs });
    }
  }
  if (verbose) console.log(`[scan] Filtered to ${results.length} of ${filePaths.length} specified files`);
  return results;
}

export async function analyze(opts: EngineOptions): Promise<AnalysisStats> {
  const t0 = Date.now();
  const rootPath = resolve(opts.rootPath);
  const db = new Database(opts.dbPath);
  const aliases = opts.aliases ?? {};
  const reporter = opts.onProgress;

  // Phase 1: Scan files (or use explicit file list for incremental)
  const files = opts.files && opts.files.length > 0
    ? scanFilesWithFilter(rootPath, opts.files, opts.verbose)
    : scanFiles(rootPath, opts.verbose);
  if (opts.verbose) console.error(`[scan] Found ${files.length} source files`);

  // Phase 2: Group files by language for cache-friendly processing
  const langGroups = new Map<string, FileWithSpec[]>();
  for (const file of files) {
    const spec = langForFile(file.relativePath);
    if (!spec) continue;
    const group = langGroups.get(spec.wasmName) ?? [];
    group.push({ ...file, size: 0, spec });  // size populated during read
    langGroups.set(spec.wasmName, group);
  }

  // Phase 2.5: Separate document files (regex-based, no tree-sitter)
  const docGroup = langGroups.get('');
  if (docGroup) langGroups.delete('');

  // Phase 3: Parse & extract — process each language group together
  // This keeps the same parser/language/compiled queries hot in cache
  const symbolsByFile = new Map<string, CodeSymbol[]>();
  const allSymbols: CodeSymbol[] = [];
  const allImports: RawImport[] = [];
  const allCalls: RawCall[] = [];
  const allHeritage: RawHeritage[] = [];
  const allReExports: RawReExport[] = [];
  const allTypeBindings: RawTypeBinding[] = [];
  const allAssignmentBindings: RawAssignmentBinding[] = [];
  const allReturnTypes: RawReturnType[] = [];
  const allCallResultBindings: RawCallResultBinding[] = [];
  const resolvedImportPaths = new Map<string, string>();
  const parsedFiles = new Set<string>();
  const importCache = new ImportResolveCache();
  let filesParsed = 0;

  // Count total files for progress
  let totalToParse = 0;
  if (docGroup) totalToParse += docGroup.length;
  for (const [, group] of langGroups) totalToParse += group.length;
  reporter?.startPhase(ProgressPhase.PARSE, totalToParse);

  // Process document files (no tree-sitter needed) — batch read
  if (docGroup) {
    const docContents = await readFilesAsync(docGroup.map(f => f.absolutePath));

    for (const file of docGroup) {
      const source = docContents.get(file.absolutePath);
      if (!source) continue;

      if (!opts.force && db.isFileUpToDate(file.relativePath, source)) {
        if (opts.verbose) console.error(`[skip] ${file.relativePath} (unchanged)`);
        continue;
      }

      try {
        const result = parseDocFile(source, file.relativePath, file.spec);
        if (!result) continue;

        symbolsByFile.set(file.relativePath, result.symbols);
        allSymbols.push(...result.symbols);
        allImports.push(...result.imports);

        for (const imp of result.imports) {
          const resolved = importCache.resolve(file.spec, imp.modulePath, imp.filePath, rootPath, aliases);
          if (resolved) {
            resolvedImportPaths.set(`${imp.filePath}::${imp.modulePath}`, resolved);
          }
        }

        db.upsertFileHash(file.relativePath, source);
        parsedFiles.add(file.relativePath);
        filesParsed++;
        reporter?.tick(file.relativePath);
        if (opts.verbose) console.error(`[parse] ${file.relativePath}: ${result.symbols.length} symbols`);
      } catch (err) {
        if (opts.verbose) console.error(`[error] ${file.relativePath}: ${err}`);
      }
    }
  }

  for (const [wasmName, group] of langGroups) {
    // Pre-load parser + language once per group
    const parser = await getParser(wasmName);
    const lang = await loadLanguage(wasmName);

    // Chunk-based processing: read content in byte-budget chunks
    // to bound peak memory for large repos
    for (const file of group) {
      try {
        const stat = readFileSync(file.absolutePath).length;
        file.size = stat;
      } catch { file.size = 0; }
    }
    const chunks = buildChunks(group);

    for (const chunk of chunks) {
      // Batch-read all files in this chunk asynchronously
      const chunkContents = await readFilesAsync(chunk.map(f => f.absolutePath));

      for (const file of chunk) {
        const source = chunkContents.get(file.absolutePath);
        if (!source) continue;

        // Skip unchanged files (incremental)
        if (!opts.force && db.isFileUpToDate(file.relativePath, source)) {
          if (opts.verbose) console.error(`[skip] ${file.relativePath} (unchanged)`);
          reporter?.tick();
          continue;
        }

        try {
          const result = await parseFile(source, file.relativePath, file.spec, parser, lang);
          if (!result) continue;

          symbolsByFile.set(file.relativePath, result.symbols);
          allSymbols.push(...result.symbols);
          allImports.push(...result.imports);
          allCalls.push(...result.calls);
          allHeritage.push(...result.heritage);
          allReExports.push(...result.reExports);
          allTypeBindings.push(...result.typeBindings);
          allAssignmentBindings.push(...result.assignmentBindings);
          allReturnTypes.push(...result.returnTypes);
          allCallResultBindings.push(...result.callResultBindings);

          // Resolve import paths eagerly (cached)
          for (const imp of result.imports) {
            const resolved = importCache.resolve(file.spec, imp.modulePath, imp.filePath, rootPath, aliases);
            if (opts.verbose) console.error(`[resolve] ${imp.filePath}::${imp.modulePath} => ${resolved ?? 'NULL'}`);
            if (resolved) {
              resolvedImportPaths.set(`${imp.filePath}::${imp.modulePath}`, resolved);
            }
          }

          // Resolve re-export paths (cached)
          for (const re of result.reExports) {
            const resolved = importCache.resolve(file.spec, re.modulePath, re.filePath, rootPath, aliases);
            if (resolved) {
              resolvedImportPaths.set(`${re.filePath}::${re.modulePath}`, resolved);
            }
          }

          db.upsertFileHash(file.relativePath, source);
          parsedFiles.add(file.relativePath);
          filesParsed++;
          reporter?.tick(file.relativePath);
          if (opts.verbose) console.error(`[parse] ${file.relativePath}: ${result.symbols.length} symbols`);
        } catch (err) {
          if (opts.verbose) console.error(`[error] ${file.relativePath}: ${err}`);
        }
      }
      // chunkContents goes out of scope → GC can reclaim source strings
    }
  }

  reporter?.endPhase();

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
  reporter?.startPhase(ProgressPhase.RESOLVE, 1);
  const perFileImportSemantics = new Map<string, 'named' | 'wildcard-leaf' | 'wildcard-transitive' | 'namespace'>();
  const perFileMroStrategy = new Map<string, 'first-wins' | 'c3' | 'ruby-mixin' | 'none'>();
  for (const [, group] of langGroups) {
    for (const file of group) {
      if (file.spec.importSemantics) {
        perFileImportSemantics.set(file.relativePath, file.spec.importSemantics);
      }
      if (file.spec.mroStrategy) {
        perFileMroStrategy.set(file.relativePath, file.spec.mroStrategy);
      }
    }
  }
  const resolution = resolveLinksWithStats({
    symbolsByFile,
    allSymbols,
    imports: allImports,
    calls: allCalls,
    heritage: allHeritage,
    reExports: allReExports,
    typeBindings: allTypeBindings,
    assignmentBindings: allAssignmentBindings,
    returnTypes: allReturnTypes,
    callResultBindings: allCallResultBindings,
    resolvedImportPaths,
    perFileImportSemantics,
    perFileMroStrategy,
  });
  const links = resolution.links;
  if (opts.verbose) {
    console.error(`[link] Resolved ${links.length} relationships`);
    if (resolution.unresolvedImports > 0 || resolution.unresolvedCalls > 0) {
      console.error(`[link] ⚠ ${resolution.unresolvedImports} unresolved imports, ${resolution.unresolvedCalls} unresolved calls (internal)`);
    }
    if (resolution.externalImports > 0 || resolution.externalCalls > 0) {
      console.error(`[link] ✓ ${resolution.externalImports} external imports, ${resolution.externalCalls} external calls (expected)`);
    }
  }
  reporter?.endPhase();

  // Phase 5.5: Dual-path resolution — compare legacy vs scope-based
  try {
    const scopeT0 = Date.now();
    if (opts.verbose) console.error(`[dual] Starting scope-based resolution (${allSymbols.length} symbols, ${allCalls.length} calls, ${allImports.length} imports)...`);
    const scopeResolution = resolveWithScopes({
      symbolsByFile,
      allSymbols,
      imports: allImports,
      calls: allCalls,
      heritage: allHeritage,
      reExports: allReExports,
      typeBindings: allTypeBindings,
      assignmentBindings: allAssignmentBindings,
      returnTypes: allReturnTypes,
      callResultBindings: allCallResultBindings,
      resolvedImportPaths,
      perFileImportSemantics,
      perFileMroStrategy,
      treeCache,
    });
    if (opts.verbose) console.error(`[dual] Scope resolution completed in ${Date.now() - scopeT0}ms (${scopeResolution.links.length} links)`);
    const diffs = diffResolutions(resolution, scopeResolution);
    if (opts.verbose) {
      const matchPct = resolution.links.length > 0
        ? ((resolution.links.length - diffs.length) / resolution.links.length * 100).toFixed(1)
        : '0.0';
      console.error(`[dual] Legacy: ${resolution.links.length} links, Scope: ${scopeResolution.links.length} links, Diff: ${diffs.length} (${matchPct}% match)`);
    }
  } catch (err) {
    if (opts.verbose) console.error(`[dual] Scope resolution failed (non-fatal): ${err}`);
  }

  // Release raw extraction data — no longer needed after resolution
  allImports.length = 0;
  allCalls.length = 0;
  allHeritage.length = 0;
  allReExports.length = 0;
  allTypeBindings.length = 0;
  allAssignmentBindings.length = 0;
  allReturnTypes.length = 0;
  allCallResultBindings.length = 0;
  resolvedImportPaths.clear();
  importCache.clear();

  // Phase 6: Enrich — compute roles, heat, zones from resolved graph
  reporter?.startPhase(ProgressPhase.ENRICH, 1);
  const enriched = enrichMetadata({ symbols: allSymbols, links });
  if (opts.verbose) console.error(`[enrich] Computed metadata for ${allSymbols.length} symbols, ${enriched.zones.size} zones`);
  reporter?.endPhase();

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
  reporter?.startPhase(ProgressPhase.PERSIST, 1);
  db.transaction(() => {
    if (opts.force) {
      if (opts.files && opts.files.length > 0) {
        db.clearFiles(opts.files);
      } else {
        db.clear();
      }
    } else {
      for (const fp of parsedFiles) db.deleteFileData(fp);
    }
    for (const sym of allSymbols) {
      if (opts.force || parsedFiles.has(sym.filePath)) db.insertSymbol(sym);
    }
    // Incremental: update role/heat for unchanged files (enrichment recomputes all)
    if (!opts.force) {
      for (const sym of allSymbols) {
        if (!parsedFiles.has(sym.filePath)) {
          db.updateSymbolMetadata(sym.id, sym.role ?? 'leaf', sym.heat ?? 0);
        }
      }
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
  reporter?.endPhase();

  // Phase 8: Generate embeddings (optional)
  if (opts.embeddings) {
    const provider = new TfIdfProvider();
    const texts = allSymbols.map(s => buildEmbeddingText({
      name: s.name, kind: s.kind, filePath: s.filePath, signature: s.signature,
    }));
    provider.trainIdf(texts);
    await provider.init();

    const store = new EmbeddingStore(db.connection, provider.dimensions);
    const EMBED_BATCH = 200;
    let embedded = 0;
    for (let i = 0; i < allSymbols.length; i += EMBED_BATCH) {
      const batch = allSymbols.slice(i, i + EMBED_BATCH);
      const batchTexts = texts.slice(i, i + EMBED_BATCH);
      const vecs = await provider.embedBatch(batchTexts);
      db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          store.store(batch[j].id, vecs[j], provider.name);
        }
      });
      embedded += batch.length;
    }
    if (opts.verbose) console.error(`[embed] Generated ${embedded} embeddings (${provider.name})`);
  }

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
    console.error(`[done] ${stats.symbolCount} symbols, ${stats.linkCount} links in ${stats.durationMs}ms`);
  }

  reporter?.done(stats);
  reporter?.finalize();

  clearQueryCache();
  clearTreeCache();
  try {
    db.close();
  } finally {
    // ensure close even on error
  }
  return stats;
}

async function parseFile(
  source: string,
  filePath: string,
  spec: LangSpec,
  parser: Parser,
  lang: Parser.Language,
): Promise<ExtractionResult | null> {
  let code = source;
  let lineOffset = 0;

  // HTML: extract inline <script> blocks, parse as JS, merge refs
  if (spec.id === 'html') {
    const result: ExtractionResult = {
      symbols: [], imports: [], calls: [], heritage: [], exportedNames: new Set(), reExports: [], typeBindings: [], assignmentBindings: [], returnTypes: [], callResultBindings: [],
    };

    // Parse HTML with tree-sitter to get calls (class refs, etc.)
    const htmlTree = parser.parse(source);
    const treeResult = extractFromTree(htmlTree, lang, spec, filePath);
    result.symbols.push(...treeResult.symbols);
    result.calls.push(...treeResult.calls);
    result.imports.push(...treeResult.imports);
    result.heritage.push(...treeResult.heritage);
    result.reExports.push(...treeResult.reExports);
    result.typeBindings.push(...treeResult.typeBindings);
    result.assignmentBindings.push(...treeResult.assignmentBindings);
    result.returnTypes.push(...treeResult.returnTypes);
    result.callResultBindings.push(...treeResult.callResultBindings);
    for (const n of treeResult.exportedNames) result.exportedNames.add(n);

    // Extract inline <script> blocks and parse as JS
    const jsParser = await getParser('tree-sitter-javascript');
    const jsLang = await loadLanguage('tree-sitter-javascript');
    const jsSpec = (await import('../parser/lang-js.js')).default;

    const scripts = extractHtmlScripts(source);
    for (const script of scripts) {
      const tree = jsParser.parse(script.content);
      const extracted = extractFromTree(tree, jsLang, jsSpec, filePath);

      // Adjust line numbers for script offset
      for (const sym of extracted.symbols) {
        sym.startLine += script.lineOffset;
        sym.endLine += script.lineOffset;
      }
      for (const imp of extracted.imports) imp.line += script.lineOffset;
      for (const call of extracted.calls) call.line += script.lineOffset;

      result.symbols.push(...extracted.symbols);
      result.imports.push(...extracted.imports);
      result.calls.push(...extracted.calls);
      result.heritage.push(...extracted.heritage);
      result.reExports.push(...extracted.reExports);
      result.typeBindings.push(...extracted.typeBindings);
      result.assignmentBindings.push(...extracted.assignmentBindings);
      result.returnTypes.push(...extracted.returnTypes);
      result.callResultBindings.push(...extracted.callResultBindings);
      for (const n of extracted.exportedNames) result.exportedNames.add(n);
    }

    // Extract <script src="..."> and <link href="..."> as imports
    const htmlRefs = extractHtmlRefs(source, filePath);
    result.imports.push(...htmlRefs);

    // Extract <a href>, <form action>, <img src>, <link icon> references
    const htmlLinks = extractHtmlLinks(source, filePath);
    result.imports.push(...htmlLinks);

    // Prefix class attribute calls with . for cross-language CSS symbol resolution
    const classNames = new Set<string>();
    const classRe = /\bclass\s*=\s*["']([^"']+)["']/gi;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = classRe.exec(source)) !== null) {
      for (const cls of cMatch[1].split(/\s+/).filter(Boolean)) {
        classNames.add(cls);
      }
    }
    for (const call of result.calls) {
      if (classNames.has(call.calleeName)) {
        call.calleeName = `.${call.calleeName}`;
      }
    }

    // Ensure _top module symbol exists for import/call link tracking
    result.symbols.push({
      id: `${filePath}#module:_top:0`,
      name: '_top',
      kind: 'module',
      filePath,
      startLine: 0,
      endLine: 0,
      exported: false,
    });

    return result;
  }

  // Vue SFC: extract <script> block
  if (spec.id === 'vue') {
    const script = extractVueScript(source);
    if (!script) return null;
    code = script.content;
    lineOffset = script.lineOffset;
  }

  const tree = parser.parse(code);
  treeCache.set(filePath, tree);
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

  // Vue SFC: also extract references from <template> block (AST-based, with regex fallback)
  if (spec.id === 'vue') {
    let templateCalls: RawCall[] = [];
    let templateSymbols: CodeSymbol[] = [];

    // Try AST-based parsing with tree-sitter-html
    try {
      const htmlParser = await getParser('tree-sitter-html');
      const astResult = extractVueTemplateAst(htmlParser, source, filePath);
      templateCalls = astResult.calls;
      templateSymbols = astResult.symbols;
    } catch {
      // Fallback to regex-based extraction
      templateCalls = extractVueTemplateRefs(source, filePath);
    }

    result.calls.push(...templateCalls);
    // Merge template symbols (refs, etc.) avoiding duplicates
    const existingIds = new Set(result.symbols.map(s => s.id));
    for (const sym of templateSymbols) {
      if (!existingIds.has(sym.id)) {
        result.symbols.push(sym);
        existingIds.add(sym.id);
      }
    }

    // Synthesize a component symbol from filename (e.g. CalendarView.vue → CalendarView)
    const fileName = filePath.split('/').pop()?.replace(/\.vue$/, '');
    if (fileName) {
      const componentId = `${filePath}#class:${fileName}:1`;
      const componentSym: CodeSymbol = {
        id: componentId,
        name: fileName,
        kind: 'class',
        filePath,
        startLine: 1,
        endLine: source.split('\n').length,
        exported: true,
      };
      result.symbols.unshift(componentSym);

      // Mark all top-level symbols as children of the component
      for (const sym of result.symbols) {
        if (sym.id !== componentId && !sym.parentId) {
          sym.parentId = componentId;
        }
      }
    }

    // Extract Composition API symbols: defineProps child props, defineEmits event names
    const compApiSyms = extractVueCompositionApi(code, filePath, lineOffset);
    if (compApiSyms.length > 0) {
      const existingIds = new Set(result.symbols.map(s => s.id));
      for (const sym of compApiSyms) {
        if (!existingIds.has(sym.id)) {
          result.symbols.push(sym);
        }
      }
    }

    // Extract CSS class/ID selectors from <style> blocks
    const styleSymbols = extractVueStyles(source, filePath);
    if (styleSymbols.length > 0) {
      const existingIds = new Set(result.symbols.map(s => s.id));
      for (const sym of styleSymbols) {
        if (!existingIds.has(sym.id)) {
          result.symbols.push(sym);
        }
      }
    }
  }

  // Ruby: process attr_accessor/attr_reader/attr_writer → create virtual methods (reader + writer)
  if (spec.id === 'ruby') {
    const attrRe = /\b(attr_accessor|attr_reader|attr_writer)\s+(:[a-z_]\w*(?:\s*,\s*:[a-z_]\w*)*)/g;
    const attrCalls: Array<{ type: string; names: string[]; line: number }> = [];
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(source)) !== null) {
      const lineNum = source.slice(0, am.index).split('\n').length;
      const names = am[2].split(',').map(n => n.trim().replace(/^:/, ''));
      attrCalls.push({ type: am[1], names, line: lineNum });
    }

    if (attrCalls.length > 0) {
      const attrLines = new Set(attrCalls.map(a => a.line));
      const attrNames = new Set(attrCalls.flatMap(a => a.names));
      result.symbols = result.symbols.filter(s => {
        if (s.kind === 'method' && attrLines.has(s.startLine) &&
            (attrNames.has(s.name) || attrNames.has(s.name.replace(/=$/, '')))) {
          return false;
        }
        return true;
      });

      for (const ac of attrCalls) {
        const parentClass = result.symbols.find(
          s => (s.kind === 'class' || s.kind === 'module') &&
               s.startLine <= ac.line && s.endLine >= ac.line
        );

        for (const name of ac.names) {
          if (ac.type === 'attr_accessor' || ac.type === 'attr_reader') {
            const id = `${filePath}#method:${name}:${ac.line}`;
            if (!result.symbols.some(s => s.id === id)) {
              result.symbols.push({
                id,
                name,
                kind: 'method',
                filePath,
                startLine: ac.line,
                endLine: ac.line,
                exported: true,
                parentId: parentClass?.id,
              });
            }
          }
          if (ac.type === 'attr_accessor' || ac.type === 'attr_writer') {
            const writerName = `${name}=`;
            const writerId = `${filePath}#method:${writerName}:${ac.line}`;
            if (!result.symbols.some(s => s.id === writerId)) {
              result.symbols.push({
                id: writerId,
                name: writerName,
                kind: 'method',
                filePath,
                startLine: ac.line,
                endLine: ac.line,
                exported: true,
                parentId: parentClass?.id,
              });
        }
      }
    }
    }

    // Rails DSL detection: associations, scopes, validations, callbacks
    if (filePath.includes('/app/models/') || filePath.includes('/app/controllers/')) {
      const className = result.symbols.find(s => s.kind === 'class')?.name;

      // Model associations → heritage links
      const assocRe = /\b(has_many|has_one|belongs_to|has_and_belongs_to_many)\s+:(\w[\w]*)/g;
      let aMatch: RegExpExecArray | null;
      while ((aMatch = assocRe.exec(source)) !== null) {
        const targetName = aMatch[2];
        const parentName = targetName.charAt(0).toUpperCase() + targetName.slice(1).replace(/s$/, '');
        const lineNum = source.slice(0, aMatch.index).split('\n').length;
        result.heritage.push({
          filePath,
          childName: className || basename(filePath, '.rb'),
          parentName,
          type: 'implements',
          line: lineNum,
        });
      }

      // Scopes → method symbols
      const scopeRe = /\bscope\s+:(\w[\w]*)/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = scopeRe.exec(source)) !== null) {
        const scopeName = sMatch[1];
        const lineNum = source.slice(0, sMatch.index).split('\n').length;
        const scopeClass = result.symbols.find(
          s => (s.kind === 'class' || s.kind === 'module') &&
               s.startLine <= lineNum && s.endLine >= lineNum
        );
        const scopeId = `${filePath}#method:${scopeName}:${lineNum}`;
        if (!result.symbols.some(s => s.id === scopeId)) {
          result.symbols.push({
            id: scopeId,
            name: scopeName,
            kind: 'method',
            filePath,
            startLine: lineNum,
            endLine: lineNum,
            exported: true,
            parentId: scopeClass?.id,
          });
        }
      }

      // before_action/after_action/around_action → call links to methods
      const callbackRe = /\b(before_action|after_action|around_action)\s+:(\w[\w?!]*)/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = callbackRe.exec(source)) !== null) {
        const callbackMethod = cMatch[2];
        const lineNum = source.slice(0, cMatch.index).split('\n').length;
        result.calls.push({
          filePath,
          enclosingSymbolId: result.symbols.find(s => s.kind === 'class' && s.startLine <= lineNum && s.endLine >= lineNum)?.id ?? `${filePath}#module:_top:0`,
          calleeName: callbackMethod,
          line: lineNum,
        });
      }
    }

    // Export detection — mark methods after `private`/`protected` as not exported
    const lines = source.split('\n');
    const classSymbols = result.symbols.filter(s => s.kind === 'class');
    for (const cls of classSymbols) {
      let inPrivate = false;
      for (let lineNum = cls.startLine; lineNum <= cls.endLine; lineNum++) {
        const line = lines[lineNum - 1]?.trim() || '';
        if (/^(private|protected)\b/.test(line) && !line.includes('def ')) {
          inPrivate = true;
        } else if (/^(public)\b/.test(line) && !line.includes('def ')) {
          inPrivate = false;
        } else if (inPrivate) {
          const methodSyms = result.symbols.filter(
            s => s.kind === 'method' && s.startLine === lineNum && s.parentId === cls.id
          );
          for (const sym of methodSyms) {
            sym.exported = false;
          }
        }
      }
    }
  }
  }

  // CSS: prefix class selectors with . and id selectors with # for cross-language linking
  if (spec.id === 'css') {
    const classNames = new Set<string>();
    const idNames = new Set<string>();

    const classRe = /\.([a-zA-Z_][\w-]*)\s*[{,\s]/g;
    let cm: RegExpExecArray | null;
    while ((cm = classRe.exec(source)) !== null) classNames.add(cm[1]);

    const idRe = /#([a-zA-Z_][\w-]*)\s*[{,\s]/g;
    let im: RegExpExecArray | null;
    while ((im = idRe.exec(source)) !== null) idNames.add(im[1]);

    for (const sym of result.symbols) {
      if (sym.kind !== 'variable' || sym.name.startsWith('--')) continue;

      if (classNames.has(sym.name)) {
        const oldName = sym.name;
        const newName = `.${oldName}`;
        sym.name = newName;
        sym.id = sym.id.replace(`#variable:${oldName}:`, `#variable:${newName}:`);
      } else if (idNames.has(sym.name)) {
        const oldName = sym.name;
        const newName = `#${oldName}`;
        sym.name = newName;
        sym.id = sym.id.replace(`#variable:${oldName}:`, `#variable:${newName}:`);
      }
    }
  }

  // Go: exported = first letter uppercase
  if (spec.id === 'go') {
    for (const sym of result.symbols) {
      if (/^[A-Z]/.test(sym.name)) sym.exported = true;
    }
  }

  // Java: mark all public symbols as exported (simplified — all top-level classes are public by convention)
  if (spec.id === 'java') {
    for (const sym of result.symbols) {
      if (sym.kind === 'class' || sym.kind === 'interface' || sym.kind === 'enum') {
        sym.exported = true;
      }
    }
  }

  // Ensure _top module symbol exists for import/call link tracking
  result.symbols.push({
    id: `${filePath}#module:_top:0`,
    name: '_top',
    kind: 'module',
    filePath,
    startLine: 0,
    endLine: 0,
    exported: false,
  });

  return result;
}

function parseDocFile(source: string, filePath: string, spec: LangSpec): ExtractionResult | null {
  if (spec.id === 'markdown') {
    const result = extractMarkdown(source, filePath);
    // Ensure _top module symbol exists for import link tracking
    result.symbols.push({
      id: `${filePath}#module:_top:0`,
      name: '_top',
      kind: 'module',
      filePath,
      startLine: 0,
      endLine: 0,
      exported: false,
    });
    return result;
  }
  return null;
}

function extractVueStyles(source: string, filePath: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const styleRe = /<style(\s+[^>]*)?>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(source)) !== null) {
    const attrs = m[1] || '';
    const isScoped = /\bscoped\b/i.test(attrs);
    const content = m[2];
    const fullMatchStart = m.index;
    const tagEnd = m[0].indexOf('>') + 1;
    const contentStart = fullMatchStart + tagEnd;
    const lineOffset = source.slice(0, contentStart).split('\n').length;

    // Extract class selectors: .className
    const classRe = /\.([a-zA-Z_][\w-]*)\s*[{,\s]/g;
    let cm: RegExpExecArray | null;
    while ((cm = classRe.exec(content)) !== null) {
      const clsLine = lineOffset + content.slice(0, cm.index).split('\n').length - 1;
      const name = `.${cm[1]}`;
      symbols.push({
        id: `${filePath}#variable:${name}:${clsLine}`,
        name,
        kind: 'variable',
        filePath,
        startLine: clsLine,
        endLine: clsLine,
        exported: !isScoped,
      });
    }

    // Extract ID selectors: #idName
    const idRe = /#([a-zA-Z_][\w-]*)\s*[{,\s]/g;
    let im: RegExpExecArray | null;
    while ((im = idRe.exec(content)) !== null) {
      const idLine = lineOffset + content.slice(0, im.index).split('\n').length - 1;
      const name = `#${im[1]}`;
      symbols.push({
        id: `${filePath}#variable:${name}:${idLine}`,
        name,
        kind: 'variable',
        filePath,
        startLine: idLine,
        endLine: idLine,
        exported: !isScoped,
      });
    }
  }
  return symbols;
}

