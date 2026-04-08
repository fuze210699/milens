import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

// web-tree-sitter types
type Parser = any;
type Language = any;

let ParserClass: any = null;
let initialized = false;
const languageCache = new Map<string, Language>();

const GRAMMAR_MAP: Record<string, string> = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  php: 'tree-sitter-php.wasm',
  vue: 'tree-sitter-vue.wasm',
  html: 'tree-sitter-html.wasm',
};

async function ensureInit(): Promise<void> {
  if (initialized) return;

  const TreeSitter = (await import('web-tree-sitter')).default;
  await TreeSitter.init();
  ParserClass = TreeSitter;
  initialized = true;
}

export async function loadLanguage(langId: string): Promise<Language> {
  if (languageCache.has(langId)) return languageCache.get(langId)!;

  await ensureInit();

  const wasmFile = GRAMMAR_MAP[langId];
  if (!wasmFile) {
    throw new Error(`Unsupported language: ${langId}`);
  }

  // Resolve WASM path from tree-sitter-wasms package
  const wasmPath = join(
    findPackageDir('tree-sitter-wasms'),
    'out',
    wasmFile,
  );

  const lang = await ParserClass.Language.load(wasmPath);
  languageCache.set(langId, lang);
  return lang;
}

export async function createParser(langId: string): Promise<Parser> {
  await ensureInit();
  const parser = new ParserClass();
  const lang = await loadLanguage(langId);
  parser.setLanguage(lang);
  return parser;
}

export async function parseSource(source: string, langId: string): Promise<any> {
  const parser = await createParser(langId);
  const tree = parser.parse(source);
  return tree;
}

function findPackageDir(packageName: string): string {
  const require = createRequire(import.meta.url);
  const resolved = require.resolve(`${packageName}/package.json`);
  return dirname(resolved);
}
