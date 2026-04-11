#!/usr/bin/env node
/**
 * Build standalone milens binary (no Node.js required to run).
 *
 * Usage:
 *   node scripts/build-standalone.mjs                  # current platform
 *   node scripts/build-standalone.mjs --target win     # Windows x64
 *   node scripts/build-standalone.mjs --target linux   # Linux x64
 *   node scripts/build-standalone.mjs --target macos   # macOS x64
 *   node scripts/build-standalone.mjs --target all     # all platforms
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, existsSync, readdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const STANDALONE_DIR = join(ROOT, 'standalone');
const BUNDLE_DIR = join(STANDALONE_DIR, 'bundle');

// WASM files needed at runtime
const WASM_NAMES = [
  'tree-sitter-tsx',
  'tree-sitter-javascript',
  'tree-sitter-python',
  'tree-sitter-java',
  'tree-sitter-go',
  'tree-sitter-rust',
  'tree-sitter-php',
  'tree-sitter-ruby',
];

// Parse CLI args
const args = process.argv.slice(2);
const targetArg = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'current';

const PKG_TARGETS = {
  win:   'node22-win-x64',
  linux: 'node22-linux-x64',
  macos: 'node22-macos-x64',
};

function resolveTargets(target) {
  if (target === 'all') return Object.values(PKG_TARGETS);
  if (target === 'current') {
    const plat = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'macos' : 'linux';
    return [PKG_TARGETS[plat]];
  }
  if (PKG_TARGETS[target]) return [PKG_TARGETS[target]];
  console.error(`Unknown target: ${target}. Use: win, linux, macos, all`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

// ── Step 1: Compile TypeScript ──
console.log('\n🔨 Step 1: Compiling TypeScript...');
run('npx tsc');

// ── Step 2: Bundle with esbuild to single CJS file ──
console.log('\n📦 Step 2: Bundling with esbuild...');
mkdirSync(BUNDLE_DIR, { recursive: true });

// esbuild bundles all JS into one file, but we mark better-sqlite3 as external
// because it has a native .node addon that can't be bundled.
// Banner provides import.meta.url shim for CJS (esbuild creates empty import_meta objects)
const importMetaBanner = `var __bundled_import_meta_url = require("url").pathToFileURL(__filename).href;`;

run([
  'npx esbuild dist/cli.js',
  '--bundle',
  '--platform=node',
  '--target=node20',
  '--format=cjs',
  `--outfile=${join(BUNDLE_DIR, 'cli.cjs')}`,
  '--external:better-sqlite3',
  // web-tree-sitter uses Emscripten patterns that don't bundle well
  '--external:web-tree-sitter',
  `--banner:js=${JSON.stringify(importMetaBanner)}`,
].join(' '));

// Post-process: replace empty import_meta objects with real URL shim
// esbuild emits `import_meta = {};` etc. — we replace with the URL value
{
  let bundleCode = readFileSync(join(BUNDLE_DIR, 'cli.cjs'), 'utf-8');
  bundleCode = bundleCode.replace(
    /\bimport_meta\d*\s*=\s*\{\s*\}/g,
    (match) => match.replace('{}', '{ url: __bundled_import_meta_url }'),
  );
  writeFileSync(join(BUNDLE_DIR, 'cli.cjs'), bundleCode);
  console.log('  ✓ Patched import.meta.url shim into bundle');
}

// ── Step 3: Copy runtime assets ──
console.log('\n📂 Step 3: Copying runtime assets...');

// 3a. schema.sql
const schemaSource = join(ROOT, 'src', 'store', 'schema.sql');
const schemaDest = join(BUNDLE_DIR, 'schema.sql');
copyFileSync(schemaSource, schemaDest);
console.log('  ✓ schema.sql');

// 3b. WASM files for tree-sitter languages
const wasmOutDir = join(BUNDLE_DIR, 'wasm');
mkdirSync(wasmOutDir, { recursive: true });

const treeSitterWasmsDir = join(ROOT, 'node_modules', 'tree-sitter-wasms', 'out');
for (const name of WASM_NAMES) {
  const src = join(treeSitterWasmsDir, `${name}.wasm`);
  if (existsSync(src)) {
    copyFileSync(src, join(wasmOutDir, `${name}.wasm`));
    console.log(`  ✓ ${name}.wasm`);
  } else {
    console.warn(`  ⚠ ${name}.wasm not found, skipping`);
  }
}

// 3c. web-tree-sitter module (external in esbuild, so pkg needs it in node_modules)
const webTsDir = join(ROOT, 'node_modules', 'web-tree-sitter');
const webTsDest = join(BUNDLE_DIR, 'node_modules', 'web-tree-sitter');
mkdirSync(webTsDest, { recursive: true });
for (const f of ['tree-sitter.js', 'tree-sitter.wasm', 'package.json', 'tree-sitter-web.d.ts']) {
  if (existsSync(join(webTsDir, f))) {
    copyFileSync(join(webTsDir, f), join(webTsDest, f));
  }
}
console.log('  ✓ web-tree-sitter module (js + wasm)');

// 3d. better-sqlite3 native addon
const betterSqliteBuild = join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release');
if (existsSync(betterSqliteBuild)) {
  const nativeDir = join(BUNDLE_DIR, 'build', 'Release');
  mkdirSync(nativeDir, { recursive: true });
  for (const f of readdirSync(betterSqliteBuild)) {
    if (f.endsWith('.node')) {
      copyFileSync(join(betterSqliteBuild, f), join(nativeDir, f));
      console.log(`  ✓ ${f} (native addon)`);
    }
  }
}

// 3e. better-sqlite3 package.json (needed by bindings resolution)
const bsq3Dir = join(ROOT, 'node_modules', 'better-sqlite3');
const bsq3PkgDest = join(BUNDLE_DIR, 'node_modules', 'better-sqlite3');
mkdirSync(bsq3PkgDest, { recursive: true });
cpSync(bsq3Dir, bsq3PkgDest, {
  recursive: true,
  filter: (src) => {
    // Only copy what's needed: package.json, lib/, build/Release/, prebuilds/
    const rel = src.replace(bsq3Dir, '').replace(/\\/g, '/');
    if (rel === '') return true;
    if (rel.startsWith('/package.json')) return true;
    if (rel.startsWith('/lib')) return true;
    if (rel.startsWith('/build')) return true;
    if (rel.startsWith('/prebuilds')) return true;
    return false;
  }
});

// Also copy bindings package (used by better-sqlite3 to find .node)
const bindingsDir = join(ROOT, 'node_modules', 'bindings');
if (existsSync(bindingsDir)) {
  cpSync(bindingsDir, join(BUNDLE_DIR, 'node_modules', 'bindings'), { recursive: true });
}
const fileUriDir = join(ROOT, 'node_modules', 'file-uri-to-path');
if (existsSync(fileUriDir)) {
  cpSync(fileUriDir, join(BUNDLE_DIR, 'node_modules', 'file-uri-to-path'), { recursive: true });
}
console.log('  ✓ better-sqlite3 native module tree');

// ── Step 4: Create wrapper entry point ──
// The wrapper resolves asset paths relative to the executable (pkg snapshot or real FS)
console.log('\n🔧 Step 4: Creating entry point wrapper...');

const milensVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;

const wrapperCode = `#!/usr/bin/env node
'use strict';

// Standalone milens binary entry point
// Patches asset resolution to work inside pkg snapshot

const path = require('path');

// Detect if running inside pkg
const isPkg = typeof process.pkg !== 'undefined';
const exeDir = isPkg ? path.dirname(process.execPath) : __dirname;

// Inject version so cli/server don't need to read package.json from snapshot
process.env.MILENS_VERSION = process.env.MILENS_VERSION || '${milensVersion}';

// Patch schema.sql resolution: inject MILENS_SCHEMA_PATH env var
// so db.ts can find schema.sql even inside pkg snapshot
process.env.MILENS_SCHEMA_PATH = isPkg
  ? path.join(path.dirname(process.execPath), 'schema.sql')
  : path.join(__dirname, 'schema.sql');

// Patch WASM dir for tree-sitter languages
process.env.MILENS_WASM_DIR = isPkg
  ? path.join(path.dirname(process.execPath), 'wasm')
  : path.join(__dirname, 'wasm');

// Now load the bundled CLI
require('./cli.cjs');
`;

writeFileSync(join(BUNDLE_DIR, 'entry.cjs'), wrapperCode);

// ── Step 5: Create package.json for pkg ──
const pkgConfig = {
  name: 'milens-standalone',
  version: milensVersion,
  bin: 'entry.cjs',
  pkg: {
    assets: [
      'cli.cjs',
      'schema.sql',
      'wasm/**/*.wasm',
      'node_modules/web-tree-sitter/**/*',
      'node_modules/better-sqlite3/**/*',
      'node_modules/bindings/**/*',
      'node_modules/file-uri-to-path/**/*',
      'build/**/*.node',
    ],
    outputPath: join(STANDALONE_DIR, 'out'),
  },
};
writeFileSync(join(BUNDLE_DIR, 'package.json'), JSON.stringify(pkgConfig, null, 2));

// ── Step 6: Build with pkg ──
const targets = resolveTargets(targetArg);
console.log(`\n🚀 Step 6: Building standalone binary for: ${targets.join(', ')}...`);

const outDir = join(STANDALONE_DIR, 'out');
mkdirSync(outDir, { recursive: true });

for (const target of targets) {
  const outName = target.includes('win') ? 'milens.exe' : 'milens';
  const platDir = join(outDir, target.split('-').slice(1).join('-'));
  mkdirSync(platDir, { recursive: true });

  run([
    `npx @yao-pkg/pkg ${join(BUNDLE_DIR, 'entry.cjs')}`,
    `--target ${target}`,
    `--output ${join(platDir, outName)}`,
    '--compress GZip',
  ].join(' '));

  // Copy runtime assets alongside binary (pkg can't always embed native + wasm)
  copyFileSync(schemaDest, join(platDir, 'schema.sql'));
  cpSync(wasmOutDir, join(platDir, 'wasm'), { recursive: true });

  // Copy native addon for the target platform
  if (existsSync(join(BUNDLE_DIR, 'build'))) {
    cpSync(join(BUNDLE_DIR, 'build'), join(platDir, 'build'), { recursive: true });
  }
  if (existsSync(join(BUNDLE_DIR, 'node_modules'))) {
    cpSync(join(BUNDLE_DIR, 'node_modules'), join(platDir, 'node_modules'), { recursive: true });
  }

  console.log(`  ✓ ${target} → ${join(platDir, outName)}`);
}

console.log(`\n✅ Standalone build complete! Output: ${outDir}`);
console.log('\nTo use: copy the entire platform folder to the target machine.');
console.log('No Node.js installation required.\n');
