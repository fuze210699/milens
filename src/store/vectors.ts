/**
 * Vector embeddings for semantic code search.
 *
 * Two providers:
 * - Built-in TF-IDF: zero-dependency, fast, no model download. Good baseline.
 * - Neural (optional): requires `@xenova/transformers` peer dep for real semantic embeddings.
 *
 * Architecture: embeddings stored as BLOBs in SQLite, cosine similarity search.
 */

import type { Database as BetterSqlite3Database } from 'better-sqlite3';

// ── Types ──

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  init(): Promise<void>;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface SimilarResult {
  symbolId: string;
  score: number;
}

// ── Cosine similarity ──

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Built-in TF-IDF provider (zero dependencies) ──

/** Simple bag-of-words with IDF weighting. Fixed 256-dimension hash-based. */
export class TfIdfProvider implements EmbeddingProvider {
  readonly name = 'tfidf-256';
  readonly dimensions = 256;

  // Corpus stats for IDF
  private docCount = 0;
  private termDocFreq = new Map<string, number>();

  async init(): Promise<void> { /* no-op */ }

  /** Feed corpus to build IDF weights (call before embed for best results) */
  trainIdf(documents: string[]): void {
    this.docCount = documents.length;
    this.termDocFreq.clear();
    for (const doc of documents) {
      const uniqueTerms = new Set(this.tokenize(doc));
      for (const term of uniqueTerms) {
        this.termDocFreq.set(term, (this.termDocFreq.get(term) ?? 0) + 1);
      }
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const tokens = this.tokenize(text);
    const vec = new Float32Array(this.dimensions);

    // Count term frequencies
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    // Hash each term to a dimension bucket, weighted by TF-IDF
    for (const [term, count] of tf) {
      const idf = this.docCount > 0
        ? Math.log(1 + this.docCount / (1 + (this.termDocFreq.get(term) ?? 0)))
        : 1;
      const tfidf = (count / tokens.length) * idf;
      // Deterministic hash → bucket
      const bucket = this.hash(term) % this.dimensions;
      // Use +/- based on secondary hash to reduce collisions
      const sign = this.hash(term + '_sign') % 2 === 0 ? 1 : -1;
      vec[bucket] += sign * tfidf;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;

    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      // Split camelCase/PascalCase
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Split on non-alphanumeric
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 1);
  }

  private hash(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0; // unsigned
  }
}

// ── Neural provider (optional, requires @xenova/transformers) ──

export class NeuralProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private pipeline: any = null;

  constructor(
    private modelId = 'Xenova/all-MiniLM-L6-v2',
    dims = 384,
  ) {
    this.name = `neural-${modelId.split('/').pop()}`;
    this.dimensions = dims;
  }

  async init(): Promise<void> {
    try {
      // Dynamic import — package is optional peer dependency
      const mod = await import(/* webpackIgnore: true */ '@xenova/transformers' as string);
      this.pipeline = await mod.pipeline('feature-extraction', this.modelId, {
        quantized: true,
      });
    } catch {
      throw new Error(
        `Neural embeddings require @xenova/transformers. Install: npm i @xenova/transformers`
      );
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipeline) await this.init();
    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Process in small batches to avoid OOM
    const results: Float32Array[] = [];
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const outputs = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...outputs);
    }
    return results;
  }
}

// ── Embedding store (SQL operations) ──

export class EmbeddingStore {
  private stmts: {
    upsert: any;
    get: any;
    getAll: any;
    count: any;
    delete: any;
  };

  constructor(private db: BetterSqlite3Database, private dimensions: number) {
    this.stmts = {
      upsert: db.prepare(
        `INSERT INTO symbol_embeddings (symbol_id, embedding, model, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(symbol_id) DO UPDATE SET embedding = excluded.embedding, model = excluded.model, updated_at = datetime('now')`
      ),
      get: db.prepare('SELECT embedding FROM symbol_embeddings WHERE symbol_id = ?'),
      getAll: db.prepare('SELECT symbol_id, embedding FROM symbol_embeddings'),
      count: db.prepare('SELECT COUNT(*) as c FROM symbol_embeddings'),
      delete: db.prepare('DELETE FROM symbol_embeddings WHERE symbol_id = ?'),
    };
  }

  store(symbolId: string, embedding: Float32Array, model: string): void {
    const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    this.stmts.upsert.run(symbolId, buf, model);
  }

  get(symbolId: string): Float32Array | null {
    const row = this.stmts.get.get(symbolId) as any;
    if (!row) return null;
    const buf: Buffer = row.embedding;
    if (buf.byteLength < this.dimensions * 4) return null; // corrupted/mismatched
    // Copy to avoid byteOffset issues with SQLite Buffers
    const copy = new Float32Array(this.dimensions);
    copy.set(new Float32Array(buf.buffer, buf.byteOffset, this.dimensions));
    return copy;
  }

  count(): number {
    return (this.stmts.count.get() as any).c;
  }

  /** Brute-force cosine search across all stored embeddings.
   *  Uses iterate() to avoid loading all rows into a JS array at once,
   *  and maintains a bounded top-K result set during scanning. */
  searchSimilar(queryVec: Float32Array, limit: number, excludeId?: string): SimilarResult[] {
    const results: SimilarResult[] = [];
    let minScore = -Infinity;

    for (const row of this.stmts.getAll.iterate() as Iterable<any>) {
      if (excludeId && row.symbol_id === excludeId) continue;
      const buf: Buffer = row.embedding;
      if (buf.byteLength < this.dimensions * 4) continue; // skip corrupted
      // Copy to own buffer to avoid shared ArrayBuffer offset issues
      const vec = new Float32Array(this.dimensions);
      vec.set(new Float32Array(buf.buffer, buf.byteOffset, this.dimensions));
      const score = cosineSimilarity(queryVec, vec);
      if (results.length < limit) {
        results.push({ symbolId: row.symbol_id, score });
        if (results.length === limit) {
          results.sort((a, b) => b.score - a.score);
          minScore = results[results.length - 1].score;
        }
      } else if (score > minScore) {
        results[results.length - 1] = { symbolId: row.symbol_id, score };
        results.sort((a, b) => b.score - a.score);
        minScore = results[results.length - 1].score;
      }
    }

    if (results.length < limit) {
      results.sort((a, b) => b.score - a.score);
    }
    return results;
  }
}

// ── Embedding text builder ──

export function buildEmbeddingText(sym: {
  name: string;
  kind: string;
  filePath: string;
  signature?: string;
}): string {
  const parts = [sym.kind, sym.name];
  if (sym.signature) parts.push(sym.signature);
  parts.push('in', sym.filePath);
  return parts.join(' ');
}


