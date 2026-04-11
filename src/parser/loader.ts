import Parser from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

let initialized = false;
const parserCache = new Map<string, Parser>();
const langCache = new Map<string, Parser.Language>();

function wasmDir(): string {
  if (process.env.MILENS_WASM_DIR) return process.env.MILENS_WASM_DIR;
  const req = createRequire(import.meta.url);
  return join(dirname(req.resolve('tree-sitter-wasms/package.json')), 'out');
}

export async function initTreeSitter(): Promise<void> {
  if (initialized) return;
  await Parser.init();
  initialized = true;
}

export async function loadLanguage(wasmName: string): Promise<Parser.Language> {
  const cached = langCache.get(wasmName);
  if (cached) return cached;

  await initTreeSitter();
  const wasmPath = join(wasmDir(), `${wasmName}.wasm`);
  const lang = await Parser.Language.load(wasmPath);
  langCache.set(wasmName, lang);
  return lang;
}

export async function getParser(wasmName: string): Promise<Parser> {
  const cached = parserCache.get(wasmName);
  if (cached) return cached;

  const lang = await loadLanguage(wasmName);
  const parser = new Parser();
  parser.setLanguage(lang);
  parserCache.set(wasmName, parser);
  return parser;
}
