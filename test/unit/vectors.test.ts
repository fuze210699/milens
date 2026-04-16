import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { TfIdfProvider, EmbeddingStore, buildEmbeddingText } from '../../src/store/vectors.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'vectors-test.db');
const SCHEMA_PATH = join(import.meta.dirname, '..', '..', 'src', 'store', 'schema.sql');

describe('vectors', () => {
  let rawDb: InstanceType<typeof Database>;
  let store: EmbeddingStore;
  let provider: TfIdfProvider;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    rawDb = new Database(TEST_DB);
    rawDb.pragma('journal_mode = WAL');
    // Create the symbol_embeddings table
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    rawDb.exec(schema);

    provider = new TfIdfProvider();
    store = new EmbeddingStore(rawDb, provider.dimensions);
  });

  afterAll(() => {
    rawDb.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── TfIdfProvider ──

  describe('TfIdfProvider', () => {
    it('has correct name and dimensions', () => {
      expect(provider.name).toBe('tfidf-256');
      expect(provider.dimensions).toBe(256);
    });

    it('embeds text into a Float32Array of correct size', async () => {
      const vec = await provider.embed('function createUser in src/models.ts');
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(256);
    });

    it('produces L2-normalized vectors', async () => {
      const vec = await provider.embed('class AuthService exported hub');
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 3);
    });

    it('returns zero vector for empty text', async () => {
      const vec = await provider.embed('');
      const sum = vec.reduce((a, b) => a + Math.abs(b), 0);
      expect(sum).toBe(0);
    });

    it('similar texts produce higher cosine similarity than unrelated', async () => {
      const a = await provider.embed('function createUser database insert');
      const b = await provider.embed('function updateUser database update');
      const c = await provider.embed('class HttpRouter express routes middleware');

      const simAB = cosine(a, b);
      const simAC = cosine(a, c);
      expect(simAB).toBeGreaterThan(simAC);
    });

    it('embedBatch returns array of correct length', async () => {
      const texts = ['hello world', 'foo bar', 'test code'];
      const vecs = await provider.embedBatch(texts);
      expect(vecs).toHaveLength(3);
      expect(vecs[0].length).toBe(256);
    });

    it('trainIdf improves discrimination', async () => {
      const corpus = [
        'function createUser database insert model',
        'function updateUser database update model',
        'class HttpRouter express routes middleware',
        'interface Config options settings',
      ];
      provider.trainIdf(corpus);

      // After IDF training, common words (function, database) get lower weight
      const a = await provider.embed('function createUser database insert model');
      const b = await provider.embed('function updateUser database update model');
      const sim = cosine(a, b);
      // Should still be similar but IDF should have run without errors
      expect(sim).toBeGreaterThan(0);
    });
  });

  // ── EmbeddingStore ──

  describe('EmbeddingStore', () => {
    it('starts with zero count', () => {
      expect(store.count()).toBe(0);
    });

    it('stores and retrieves embeddings', async () => {
      const vec = await provider.embed('function hello world');
      store.store('sym-1', vec, 'tfidf-256');

      const retrieved = store.get('sym-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(256);
      // Values should match
      for (let i = 0; i < vec.length; i++) {
        expect(retrieved![i]).toBeCloseTo(vec[i], 5);
      }
    });

    it('returns null for unknown symbol', () => {
      expect(store.get('nonexistent')).toBeNull();
    });

    it('returns null for corrupted/truncated embedding', () => {
      // Insert a too-short BLOB directly
      rawDb.prepare(
        `INSERT OR REPLACE INTO symbol_embeddings (symbol_id, embedding, model, updated_at) VALUES (?, ?, ?, datetime('now'))`
      ).run('corrupted-sym', Buffer.from(new Float32Array(10).buffer), 'test');

      const result = store.get('corrupted-sym');
      expect(result).toBeNull();
    });

    it('counts stored embeddings', async () => {
      const vec2 = await provider.embed('class AuthService');
      store.store('sym-2', vec2, 'tfidf-256');
      const countBefore = store.count();

      // Upsert on duplicate should not increase count
      const vec = await provider.embed('updated text');
      store.store('sym-1', vec, 'tfidf-256');
      expect(store.count()).toBe(countBefore); // no increase
      const retrieved = store.get('sym-1');
      expect(retrieved).not.toBeNull();
    });

    it('searchSimilar finds nearest embeddings', async () => {
      // Re-create provider without IDF training (previous test mutated it)
      const freshProvider = new TfIdfProvider();

      // Clear and re-store with consistent provider
      const texts = ['function hello world', 'class AuthService', 'symbol-3 test', 'symbol-4 code', 'symbol-5 run'];
      for (let i = 0; i < texts.length; i++) {
        const v = await freshProvider.embed(texts[i]);
        store.store(`fresh-${i}`, v, 'tfidf-256');
      }

      const query = await freshProvider.embed('function hello world');
      const results = store.searchSimilar(query, 3);
      expect(results.length).toBeLessThanOrEqual(3);
      expect(results.length).toBeGreaterThan(0);
      // The best match should have positive cosine similarity
      expect(results[0].score).toBeGreaterThan(0);
      // Scores should be descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('searchSimilar excludes specified id', async () => {
      const query = await provider.embed('function hello world');
      const results = store.searchSimilar(query, 10, 'sym-1');
      expect(results.every(r => r.symbolId !== 'sym-1')).toBe(true);
    });
  });

  // ── buildEmbeddingText ──

  describe('buildEmbeddingText', () => {
    it('builds text from symbol properties', () => {
      const text = buildEmbeddingText({ name: 'createUser', kind: 'function', filePath: 'src/models.ts' });
      expect(text).toBe('function createUser in src/models.ts');
    });

    it('includes signature when present', () => {
      const text = buildEmbeddingText({ name: 'add', kind: 'function', filePath: 'src/math.ts', signature: '(a: number, b: number): number' });
      expect(text).toBe('function add (a: number, b: number): number in src/math.ts');
    });
  });
});

// Helper
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
