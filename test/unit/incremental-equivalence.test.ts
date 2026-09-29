import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { analyze } from '../../src/analyzer/engine.js';
import { Database } from '../../src/store/db.js';

interface GraphSnapshot {
  symbols: string[];
  links: string[];
}

function snapshotStructure(dbPath: string): GraphSnapshot {
  const db = new Database(dbPath);
  try {
    const symbols = db.getAllSymbols()
      .map(s => `${s.id}|${s.kind}|${s.exported ? 1 : 0}`)
      .sort();
    const links = db.getAllLinks()
      .map(l => `${l.fromId}|${l.type}|${l.toId}`)
      .sort();
    return { symbols, links };
  } finally {
    db.close();
  }
}

function snapshotMetadata(dbPath: string): string[] {
  const db = new Database(dbPath);
  try {
    return db.getAllSymbols()
      .map(s => `${s.id}|${s.role ?? ''}|${s.heat ?? 0}`)
      .sort();
  } finally {
    db.close();
  }
}

function assertReferentialIntegrity(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    const ids = new Set(db.getAllSymbols().map(s => s.id));
    for (const l of db.getAllLinks()) {
      expect(ids.has(l.fromId), `dangling link from_id: ${l.fromId}`).toBe(true);
      expect(ids.has(l.toId), `dangling link to_id: ${l.toId}`).toBe(true);
    }
    for (const s of db.getAllSymbols()) {
      if (s.parentId) {
        expect(ids.has(s.parentId), `dangling parent_id ${s.parentId} on ${s.id}`).toBe(true);
      }
    }
  } finally {
    db.close();
  }
}

describe('incremental == full graph equivalence oracle', () => {
  const tmpDir = join(import.meta.dirname, '..', 'tmp', 'equiv');
  const dbPath = join(tmpDir, '.milens', 'incr.db');
  const coldDbPath = join(tmpDir, '.milens', 'cold.db');

  const writeBaseProject = (): void => {
    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    writeFileSync(join(tmpDir, 'src', 'utils.ts'),
      'import { add } from "./math";\nexport function double(x: number): number {\n  return add(x, x);\n}\n');
    writeFileSync(join(tmpDir, 'src', 'index.ts'),
      'import { double } from "./utils";\nexport function run(n: number): number {\n  return double(n);\n}\n');
  };

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(join(tmpDir, '.milens'), { recursive: true });
    writeBaseProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full re-index is deterministic (same input → same graph)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });
    const a = snapshotStructure(dbPath);
    await analyze({ rootPath: tmpDir, dbPath, force: true });
    const b = snapshotStructure(dbPath);
    expect(b).toEqual(a);
  });

  it('watcher-style full rebuild after an edit equals a cold full index', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    writeFileSync(join(tmpDir, 'src', 'utils.ts'),
      'import { add } from "./math";\nexport function double(x: number): number {\n  return add(x, x) + 0;\n}\n');

    // Watcher path (F1): full rebuild, no targeted files list.
    await analyze({ rootPath: tmpDir, dbPath, force: true });
    const incremental = snapshotStructure(dbPath);

    // Cold index of the final on-disk state into a separate DB.
    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotStructure(coldDbPath);

    expect(incremental).toEqual(cold);
  });

  it('non-force incremental add-file produces the same structure as a cold full index', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    writeFileSync(join(tmpDir, 'src', 'consumer.ts'),
      'import { run } from "./index";\nexport function main(): number {\n  return run(21);\n}\n');

    await analyze({ rootPath: tmpDir, dbPath, force: false });
    const incremental = snapshotStructure(dbPath);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotStructure(coldDbPath);

    expect(incremental).toEqual(cold);
  });

  it('regenerates cross-file links from persisted facts of an unchanged caller (Fact Store, audit2 #2)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    // Remove the utils→math.add link to prove it gets regenerated, not merely survives.
    let db = new Database(dbPath);
    const utilsToAdd = db.getAllLinks().find(l =>
      l.type === 'calls' && l.fromId.includes('utils.ts') && l.toId.includes('math.ts'));
    expect(utilsToAdd).toBeDefined();
    db.getRawDb().prepare('DELETE FROM links WHERE id = ?').run(utilsToAdd!.id);
    expect(db.getAllLinks().some(l => l.id === utilsToAdd!.id)).toBe(false);
    db.close();

    // Body-only edit to math.ts (the callee); utils.ts is NOT re-parsed.
    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  const s = a + b;\n  return s;\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: false });

    db = new Database(dbPath);
    try {
      const regenerated = db.getAllLinks().some(l =>
        l.type === 'calls' && l.fromId.includes('utils.ts') && l.toId.includes('math.ts'));
      expect(regenerated).toBe(true);
    } finally {
      db.close();
    }
  });

  it('non-force whole-repo incremental prunes symbols/facts of a deleted file', async () => {
    writeFileSync(join(tmpDir, 'src', 'gone.ts'),
      'export function goneFn(): number {\n  return 42;\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    let db = new Database(dbPath);
    expect(db.getAllSymbols().some(s => s.name === 'goneFn')).toBe(true);
    expect(db.getFileFacts('src/gone.ts')).not.toBeNull();
    db.close();

    rmSync(join(tmpDir, 'src', 'gone.ts'), { force: true });
    await analyze({ rootPath: tmpDir, dbPath, force: false });

    db = new Database(dbPath);
    try {
      expect(db.getAllSymbols().some(s => s.name === 'goneFn')).toBe(false);
      expect(db.getFileFacts('src/gone.ts')).toBeNull();
      expect(db.getAllLinks().some(l => l.fromId.includes('gone.ts') || l.toId.includes('gone.ts'))).toBe(false);
    } finally {
      db.close();
    }
  });

  it('renaming a symbol leaves no dangling links after non-force incremental (matches cold)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    // Rename add→sum in math.ts AND update its caller utils.ts in the same batch.
    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function sum(a: number, b: number): number {\n  return a + b;\n}\n');
    writeFileSync(join(tmpDir, 'src', 'utils.ts'),
      'import { sum } from "./math";\nexport function double(x: number): number {\n  return sum(x, x);\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: false });
    const incremental = snapshotStructure(dbPath);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotStructure(coldDbPath);

    expect(incremental).toEqual(cold);
    // No link should reference the removed add symbol.
    const dbi = new Database(dbPath);
    try {
      expect(dbi.getAllLinks().some(l => l.toId.includes('function:add') || l.fromId.includes('function:add'))).toBe(false);
    } finally {
      dbi.close();
    }
  });

  it('force --files targeted re-index keeps cross-file links intact (matches cold)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    // Body-only edit to math.ts, re-index ONLY that file with force+files.
    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  const r = a + b;\n  return r;\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: true, files: ['src/math.ts'] });
    const targeted = snapshotStructure(dbPath);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotStructure(coldDbPath);

    expect(targeted).toEqual(cold);
    const dbi = new Database(dbPath);
    try {
      expect(dbi.getAllLinks().some(l => l.type === 'calls' && l.fromId.includes('utils.ts') && l.toId.includes('math.ts'))).toBe(true);
    } finally {
      dbi.close();
    }
  });

  it('keeps external inheritance target symbols after non-force incremental (no dangling #external)', async () => {
    writeFileSync(join(tmpDir, 'src', 'err.ts'),
      'export class MyErr extends Error {\n  code = 1;\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    let db = new Database(dbPath);
    const extLink = db.getAllLinks().find(l => l.type === 'extends' && l.toId.startsWith('#external:'));
    expect(extLink).toBeDefined();
    expect(db.findSymbolById(extLink!.toId)).not.toBeNull();
    db.close();

    // Change an unrelated file; err.ts is loaded from facts (not re-parsed).
    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  return a + b + 0;\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: false });

    db = new Database(dbPath);
    try {
      const link = db.getAllLinks().find(l => l.type === 'extends' && l.toId.startsWith('#external:'));
      expect(link).toBeDefined();
      expect(db.findSymbolById(link!.toId)).not.toBeNull();
    } finally {
      db.close();
    }
  });

  it('updates parse_error_files on a non-force incremental (not just full scan)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });
    let db = new Database(dbPath);
    expect(parseInt(db.getMeta('parse_error_files') ?? '0', 10)).toBe(0);
    db.close();

    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function add(: number {\n  return \n}\nconst x = = = ;\n');
    await analyze({ rootPath: tmpDir, dbPath, force: false });

    db = new Database(dbPath);
    try {
      expect(parseInt(db.getMeta('parse_error_files') ?? '0', 10)).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });

  it('clears the graph when every source file is deleted (last-file cleanup)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });
    let db = new Database(dbPath);
    expect(db.getAllSymbols().length).toBeGreaterThan(0);
    db.close();

    rmSync(join(tmpDir, 'src', 'math.ts'), { force: true });
    rmSync(join(tmpDir, 'src', 'utils.ts'), { force: true });
    rmSync(join(tmpDir, 'src', 'index.ts'), { force: true });
    await analyze({ rootPath: tmpDir, dbPath, force: false });

    db = new Database(dbPath);
    try {
      expect(db.getAllSymbols().length).toBe(0);
      expect(db.getAllLinks().length).toBe(0);
      expect(db.getAllFileFacts().size).toBe(0);
    } finally {
      db.close();
    }
  });

  it('persists per-file facts to the store on index', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });
    const db = new Database(dbPath);
    try {
      const facts = db.getFileFacts('src/utils.ts');
      expect(facts).not.toBeNull();
      expect(facts.calls.some((c: any) => c.calleeName === 'add')).toBe(true);
      expect(facts.imports.some((i: any) => i.modulePath === './math')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('FTS index stays queryable after a non-force incremental (no full rebuild)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    writeFileSync(join(tmpDir, 'src', 'consumer.ts'),
      'import { run } from "./index";\nexport function uniqueConsumerFn(): number {\n  return run(21);\n}\n');

    await analyze({ rootPath: tmpDir, dbPath, force: false });

    const db = new Database(dbPath);
    try {
      const found = db.searchSymbols('uniqueConsumerFn', 5);
      expect(found.some(s => s.name === 'uniqueConsumerFn')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('non-force incremental metadata equals cold full index (F2)', async () => {
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    writeFileSync(join(tmpDir, 'src', 'utils.ts'),
      'import { add } from "./math";\nexport function double(x: number): number {\n  const y = add(x, x);\n  return y;\n}\n');

    await analyze({ rootPath: tmpDir, dbPath, force: false });
    const incremental = snapshotMetadata(dbPath);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotMetadata(coldDbPath);

    expect(incremental).toEqual(cold);
  });

  it('deleting the nearer of two duplicate-named symbols matches cold (Phase 4 live-path filter)', async () => {
    writeFileSync(join(tmpDir, 'src', 'a.ts'),
      'export class Widget {\n  render(): void {}\n}\n');
    writeFileSync(join(tmpDir, 'src', 'b.ts'),
      'export class Widget {\n  render(): void {}\n}\n');
    writeFileSync(join(tmpDir, 'src', 'use.ts'),
      'import { Widget } from "./a";\nexport function go(): void {\n  new Widget().render();\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    // Delete a.ts (the imported/nearer candidate) but leave use.ts unchanged (it still imports "./a").
    rmSync(join(tmpDir, 'src', 'a.ts'), { force: true });
    await analyze({ rootPath: tmpDir, dbPath, force: false });
    const incremental = snapshotStructure(dbPath);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotStructure(coldDbPath);

    expect(incremental).toEqual(cold);
    assertReferentialIntegrity(dbPath);
    const dbi = new Database(dbPath);
    try {
      expect(dbi.getAllLinks().some(l => l.fromId.includes('a.ts') || l.toId.includes('a.ts'))).toBe(false);
    } finally {
      dbi.close();
    }
  });

  it('holds referential integrity + cold-equality after a rename with a duplicate name', async () => {
    writeFileSync(join(tmpDir, 'src', 'dup.ts'),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    // Rename the original math.add → sum (dup.ts still exports a same-named add), update caller.
    writeFileSync(join(tmpDir, 'src', 'math.ts'),
      'export function sum(a: number, b: number): number {\n  return a + b;\n}\n');
    writeFileSync(join(tmpDir, 'src', 'utils.ts'),
      'import { sum } from "./math";\nexport function double(x: number): number {\n  return sum(x, x);\n}\n');
    await analyze({ rootPath: tmpDir, dbPath, force: false });
    const incremental = snapshotStructure(dbPath);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = snapshotStructure(coldDbPath);

    expect(incremental).toEqual(cold);
    assertReferentialIntegrity(dbPath);
  });

  it('keeps Vue symbol IDs stable under a line shift (matches cold)', async () => {
    const vueBody =
      '<template>\n  <input ref="inputEl" />\n  <MyChild @click="onClick" />\n</template>\n' +
      '<script setup lang="ts">\nconst props = defineProps<{ label: string }>();\nfunction onClick(): void {}\n</script>\n' +
      '<style scoped>\n.box { color: red; }\n</style>\n';
    writeFileSync(join(tmpDir, 'src', 'Comp.vue'), vueBody);
    await analyze({ rootPath: tmpDir, dbPath, force: true });

    let db = new Database(dbPath);
    const before = db.getAllSymbols().filter(s => s.filePath === 'src/Comp.vue').map(s => s.id).sort();
    db.close();
    expect(before.length).toBeGreaterThan(0);

    // Prepend blank lines: every symbol shifts down, IDs must not change.
    writeFileSync(join(tmpDir, 'src', 'Comp.vue'), '\n\n\n' + vueBody);
    await analyze({ rootPath: tmpDir, dbPath, force: false });

    db = new Database(dbPath);
    const after = db.getAllSymbols().filter(s => s.filePath === 'src/Comp.vue').map(s => s.id).sort();
    db.close();
    expect(after).toEqual(before);

    await analyze({ rootPath: tmpDir, dbPath: coldDbPath, force: true });
    const cold = new Database(coldDbPath);
    const coldIds = cold.getAllSymbols().filter(s => s.filePath === 'src/Comp.vue').map(s => s.id).sort();
    cold.close();
    expect(after).toEqual(coldIds);
    assertReferentialIntegrity(dbPath);
  });

  it('records parse errors in meta so incomplete files are detectable (F7)', async () => {
    writeFileSync(join(tmpDir, 'src', 'broken.ts'),
      'export function broken(: number {\n  return \n}\nconst x = = = ;\n');

    await analyze({ rootPath: tmpDir, dbPath, force: true });

    const db = new Database(dbPath);
    try {
      const count = parseInt(db.getMeta('parse_error_files') ?? '0', 10);
      expect(count).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });
});
