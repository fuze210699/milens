import { readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scanFiles, type ScannedFile } from './scanner.js';
import { langForFile, supportedExtensions } from '../parser/languages.js';
import { getParser, loadLanguage } from '../parser/loader.js';
import { extractFromTree, clearQueryCache } from '../parser/extract.js';
import { extractVueScript, extractVueTemplateRefs } from '../parser/lang-vue.js';
import { extractHtmlScripts, extractHtmlRefs } from '../parser/lang-html.js';
import { extractMarkdown } from '../parser/lang-md.js';
import { resolveLinks, resolveLinksWithStats } from './resolver.js';
import { enrichMetadata } from './enrich.js';
import { isTestFile } from '../utils.js';
import { Database } from '../store/db.js';
import { TfIdfProvider, EmbeddingStore, buildEmbeddingText } from '../store/vectors.js';
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

  if (opts.force) {
    if (opts.files && opts.files.length > 0) {
      db.clearFiles(opts.files);
    } else {
      db.clear();
    }
  }

  // Phase 1: Scan files (or use explicit file list for incremental)
  const files = opts.files && opts.files.length > 0
    ? scanFilesWithFilter(rootPath, opts.files, opts.verbose)
    : scanFiles(rootPath, opts.verbose);
  if (opts.verbose) console.log(`[scan] Found ${files.length} source files`);

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

  // Process document files (no tree-sitter needed) — batch read
  if (docGroup) {
    const docContents = await readFilesAsync(docGroup.map(f => f.absolutePath));

    for (const file of docGroup) {
      const source = docContents.get(file.absolutePath);
      if (!source) continue;

      if (!opts.force && db.isFileUpToDate(file.relativePath, source)) {
        if (opts.verbose) console.log(`[skip] ${file.relativePath} (unchanged)`);
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
        if (opts.verbose) console.log(`[parse] ${file.relativePath}: ${result.symbols.length} symbols`);
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
          if (opts.verbose) console.log(`[skip] ${file.relativePath} (unchanged)`);
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
            if (opts.verbose) console.log(`[resolve] ${imp.filePath}::${imp.modulePath} => ${resolved ?? 'NULL'}`);
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
          if (opts.verbose) console.log(`[parse] ${file.relativePath}: ${result.symbols.length} symbols`);
        } catch (err) {
          if (opts.verbose) console.error(`[error] ${file.relativePath}: ${err}`);
        }
      }
      // chunkContents goes out of scope → GC can reclaim source strings
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
  const perFileImportSemantics = new Map<string, 'named' | 'wildcard-leaf' | 'wildcard-transitive' | 'namespace'>();
  for (const [, group] of langGroups) {
    for (const file of group) {
      if (file.spec.importSemantics) {
        perFileImportSemantics.set(file.relativePath, file.spec.importSemantics);
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
    if (opts.verbose) console.log(`[embed] Generated ${embedded} embeddings (${provider.name})`);
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
    console.log(`[done] ${stats.symbolCount} symbols, ${stats.linkCount} links in ${stats.durationMs}ms`);
  }

  clearQueryCache();
  clearTreeCache();
  db.close();
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
    const jsParser = await getParser('tree-sitter-javascript');
    const jsLang = await loadLanguage('tree-sitter-javascript');
    const jsSpec = (await import('../parser/lang-js.js')).default;

    const result: ExtractionResult = {
      symbols: [], imports: [], calls: [], heritage: [], exportedNames: new Set(), reExports: [], typeBindings: [], assignmentBindings: [], returnTypes: [], callResultBindings: [],
    };

    // Extract inline <script> blocks and parse as JS
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

  // Vue SFC: also extract references from <template> block
  if (spec.id === 'vue') {
    const templateCalls = extractVueTemplateRefs(source, filePath);
    result.calls.push(...templateCalls);

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
