import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../../src/analyzer/engine.js';
import { Database } from '../../src/store/db.js';
import { loadAliases } from '../../src/analyzer/config.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const TMP = join(import.meta.dirname, '..', 'tmp');

describe('Vue SFC import tracking (integration)', () => {
  const dbPaths: string[] = [];

  afterAll(() => {
    for (const p of dbPaths) {
      if (existsSync(p)) unlinkSync(p);
    }
  });

  it('loads aliases from jsconfig.json', () => {
    const aliases = loadAliases(join(FIXTURES, 'vue-project'));
    expect(aliases['@']).toBe('src');
  });

  it('loads aliases from tsconfig.json references', () => {
    const aliases = loadAliases(join(FIXTURES, 'vue-project-refs'));
    expect(aliases['@']).toBe('src');
  });

  it('tracks Vue → JS imports via @ alias (jsconfig)', async () => {
    const rootPath = join(FIXTURES, 'vue-project');
    const dbPath = join(TMP, 'vue-jsconfig.db');
    dbPaths.push(dbPath);
    mkdirSync(TMP, { recursive: true });
    if (existsSync(dbPath)) unlinkSync(dbPath);

    const aliases = loadAliases(rootPath);
    const stats = await analyze({ rootPath, dbPath, force: true, aliases });

    expect(stats.symbolCount).toBeGreaterThan(0);
    expect(stats.linkCount).toBeGreaterThan(0);

    const db = new Database(dbPath);

    // Verify composable is indexed
    const composables = db.findSymbolByName('useClipboard');
    expect(composables.length).toBeGreaterThan(0);
    const fn = composables.find(s => s.kind === 'function');
    expect(fn).toBeDefined();

    // Verify _top module for Vue file exists
    const topModules = db.findSymbolByName('_top');
    const vueTop = topModules.find(s => s.filePath.endsWith('TestView.vue'));
    expect(vueTop).toBeDefined();

    // Verify upstream: Vue file should appear as dependent of useClipboard
    const upstream = db.findUpstream(fn!.id, 3);
    expect(upstream.length).toBeGreaterThan(0);
    expect(upstream.some(u => u.symbol.filePath.endsWith('TestView.vue'))).toBe(true);
    expect(upstream.some(u => u.via === 'imports')).toBe(true);

    db.close();
  });

  it('tracks Vue → JS imports via @ alias (tsconfig references)', async () => {
    const rootPath = join(FIXTURES, 'vue-project-refs');
    const dbPath = join(TMP, 'vue-tsrefs.db');
    dbPaths.push(dbPath);
    mkdirSync(TMP, { recursive: true });
    if (existsSync(dbPath)) unlinkSync(dbPath);

    const aliases = loadAliases(rootPath);
    const stats = await analyze({ rootPath, dbPath, force: true, aliases });

    expect(stats.symbolCount).toBeGreaterThan(0);

    const db = new Database(dbPath);
    const composables = db.findSymbolByName('useClipboard');
    const fn = composables.find(s => s.kind === 'function');
    expect(fn).toBeDefined();

    const upstream = db.findUpstream(fn!.id, 3);
    expect(upstream.length).toBeGreaterThan(0);
    expect(upstream.some(u => u.symbol.filePath.endsWith('TestView.vue'))).toBe(true);

    db.close();
  });
});
