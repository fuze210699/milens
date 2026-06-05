/**
 * Generate release-stats.json from the milens database.
 * Called from .github/workflows/release-stats.yml on each release.
 *
 * Usage: node scripts/generate-release-stats.js [--root <path>]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = new URL('.', import.meta.url).pathname;

function parseArgs() {
  const args = process.argv.slice(2);
  let root = resolve('.');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = resolve(args[++i]);
    }
  }
  return { root };
}

async function main() {
  const { root } = parseArgs();
  const dbPath = join(root, '.milens', 'milens.db');
  const pkgPath = join(root, 'package.json');

  const { Database } = await import('../dist/store/db.js');

  const db = new Database(dbPath);
  const summary = db.getCodebaseSummary();
  db.close();

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  const stats = {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    symbols: summary.symbols,
    links: summary.links,
    files: summary.files,
    coveragePct: summary.coveragePct,
    domains: summary.domains.length,
    topHubs: summary.topHubs.slice(0, 10).map(h => ({
      name: h.name,
      kind: h.kind,
      file: h.filePath,
      heat: h.heat,
    })),
  };

  const outPath = join(root, 'release-stats.json');
  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.log('release-stats.json generated:', JSON.stringify(stats));
}

main().catch(err => {
  console.error('Failed to generate release-stats.json:', err.message);
  process.exit(1);
});
