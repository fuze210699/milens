import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { AnnotationStore } from '../../src/store/annotations.js';
import type { AnnotationKey } from '../../src/types.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'test-annotations.db');

describe('AnnotationStore', () => {
  let db: Database;
  let store: AnnotationStore;

  beforeAll(() => {
    mkdirSync(join(import.meta.dirname, '..', 'tmp'), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
    // Patch: annotations table uses TEXT ids (UUIDs), repoint to matching schema
    db.connection.exec(`
      DROP TABLE IF EXISTS annotations;
      CREATE TABLE annotations (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        agent TEXT,
        session_id TEXT,
        confidence REAL DEFAULT 0.5,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_annotations_symbol ON annotations(symbol, key);
      CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id);
    `);
    db.connection.exec(`
      DROP TABLE IF EXISTS evolution_log;
      CREATE TABLE evolution_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        annotation_id TEXT NOT NULL,
        event TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_evolution_annotation ON evolution_log(annotation_id);
    `);
    store = new AnnotationStore(db.connection);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  describe('annotate', () => {
    it('creates a new annotation with default confidence 0.5', () => {
      const ann = store.annotate('mySymbol', 'note', 'this is a note');
      expect(ann.id).toBeDefined();
      expect(ann.symbol).toBe('mySymbol');
      expect(ann.key).toBe('note');
      expect(ann.value).toBe('this is a note');
      expect(ann.confidence).toBe(0.5);
    });

    it('boosts confidence by 0.1 when annotating same symbol+key with same value', () => {
      const ann1 = store.annotate('boostTest', 'bug', 'a bug');
      expect(ann1.confidence).toBe(0.5);

      const ann2 = store.annotate('boostTest', 'bug', 'a bug');
      expect(ann2.confidence).toBeCloseTo(0.6, 5);

      const ann3 = store.annotate('boostTest', 'bug', 'a bug');
      expect(ann3.confidence).toBeCloseTo(0.7, 5);

      const ann4 = store.annotate('boostTest', 'bug', 'a bug');
      expect(ann4.confidence).toBeCloseTo(0.8, 5);
    });

    it('resets confidence to 0.5 when annotating same symbol+key with different value', () => {
      store.annotate('resetTest', 'workflow', 'old value');
      store.annotate('resetTest', 'workflow', 'old value');
      store.annotate('resetTest', 'workflow', 'old value');

      const ann = store.annotate('resetTest', 'workflow', 'new value');
      expect(ann.confidence).toBe(0.5);
      expect(ann.value).toBe('new value');
    });

    it('caps confidence at 1.0 after many same-value updates', () => {
      store.annotate('capTest', 'architecture', 'arch');
      store.annotate('capTest', 'architecture', 'arch');
      store.annotate('capTest', 'architecture', 'arch');
      store.annotate('capTest', 'architecture', 'arch');
      store.annotate('capTest', 'architecture', 'arch');
      const ann = store.annotate('capTest', 'architecture', 'arch');
      expect(ann.confidence).toBeLessThanOrEqual(1.0);
    });

    it('throws on invalid annotation key', () => {
      expect(() => store.annotate('s', 'invalidKey' as AnnotationKey, 'v'))
        .toThrow(/Invalid annotation key/);
    });

    it('accepts all valid annotation keys', () => {
      const validKeys: AnnotationKey[] = ['note', 'bug', 'security', 'architecture', 'workflow', 'test', 'dependency', 'refactor'];
      for (const key of validKeys) {
        const ann = store.annotate(`validKey_${key}`, key, 'value');
        expect(ann.key).toBe(key);
      }
    });

    it('stores optional agent and sessionId', () => {
      const ann = store.annotate('optTest', 'note', 'value', { agent: 'myAgent', sessionId: 'session-1' });
      expect(ann.agent).toBe('myAgent');
      expect(ann.sessionId).toBe('session-1');
    });
  });

  describe('recall', () => {
    beforeEach(() => {
      store.annotate('recallSymA', 'note', 'valueA1', { agent: 'agentA' });
      store.annotate('recallSymA', 'bug', 'valueA2', { agent: 'agentA' });
      store.annotate('recallSymB', 'note', 'valueB1', { agent: 'agentB' });
    });

    it('returns all annotations when no filters provided', () => {
      const results = store.recall();
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by symbol', () => {
      const results = store.recall({ symbol: 'recallSymA' });
      expect(results.length).toBe(2);
      expect(results.every(r => r.symbol === 'recallSymA')).toBe(true);
    });

    it('filters by key', () => {
      const results = store.recall({ key: 'note' });
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.key === 'note')).toBe(true);
    });

    it('filters by symbol and key combination', () => {
      const results = store.recall({ symbol: 'recallSymA', key: 'note' });
      expect(results.length).toBe(1);
      expect(results[0].symbol).toBe('recallSymA');
      expect(results[0].key).toBe('note');
    });

    it('filters by agent', () => {
      const results = store.recall({ agent: 'agentA' });
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.agent === 'agentA')).toBe(true);
    });

    it('filters by sessionId', () => {
      store.annotate('sessionSym', 'note', 'value', { sessionId: 'recallSession' });
      const results = store.recall({ sessionId: 'recallSession' });
      expect(results.length).toBe(1);
      expect(results[0].sessionId).toBe('recallSession');
    });

    it('respects limit parameter', () => {
      store.annotate('limitSym', 'note', 'v1');
      store.annotate('limitSym', 'bug', 'v2');
      store.annotate('limitSym', 'security', 'v3');
      store.annotate('limitSym', 'architecture', 'v4');
      const results = store.recall({ symbol: 'limitSym', limit: 2 });
      expect(results.length).toBe(2);
    });

    it('boosts confidence on recall', () => {
      const ann = store.annotate('boostRecall', 'note', 'test recall boost');
      expect(ann.confidence).toBe(0.5);

      store.recall({ symbol: 'boostRecall', key: 'note' });

      const results = store.recall({ symbol: 'boostRecall', key: 'note' });
      expect(results[0].confidence).toBeCloseTo(0.55, 5);
    });
  });

  describe('session lifecycle', () => {
    it('sessionStart returns a session id', () => {
      const sessionId = store.sessionStart('testAgent');
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('sessionEnd completes a session and returns stats', () => {
      const sessionId = store.sessionStart('testAgent');
      store.annotate('endSessionA', 'note', 'value', { sessionId });
      store.annotate('endSessionB', 'bug', 'value2', { sessionId });

      const result = store.sessionEnd(sessionId);
      expect(result.sessionId).toBe(sessionId);
      expect(result.status).toBe('completed');
      expect(result.annotationCount).toBe(2);
    });

    it('sessionEnd uses custom status when provided', () => {
      const sessionId = store.sessionStart('testAgent');
      const result = store.sessionEnd(sessionId, 'failed');
      expect(result.status).toBe('failed');
    });

    it('sessionEnd throws for non-existent session', () => {
      expect(() => store.sessionEnd('non-existent-id')).toThrow(/Session not found/);
    });

    it('sessionContext returns session metadata and annotations', () => {
      const sessionId = store.sessionStart('contextAgent');
      store.annotate('ctxSym', 'note', 'ctx value', { sessionId, agent: 'contextAgent' });

      const ctx = store.sessionContext(sessionId);
      expect(ctx.session).toBeDefined();
      expect(ctx.session.agent).toBe('contextAgent');
      expect(ctx.session.status).toBe('active');
      expect(ctx.annotations.length).toBeGreaterThanOrEqual(1);
      expect(ctx.annotationCount).toBe(1);
      expect(ctx.toolCallsCount).toBe(0);
    });

    it('sessionContext returns annotations via recall', () => {
      const sessionId = store.sessionStart('ctxAgent2');
      store.annotate('ctxSym2', 'note', 'value1', { sessionId });
      store.annotate('ctxSym2', 'bug', 'value2', { sessionId });

      const ctx = store.sessionContext(sessionId);
      expect(ctx.annotations.length).toBe(2);
    });

    it('sessionContext throws for non-existent session', () => {
      expect(() => store.sessionContext('non-existent-id')).toThrow(/Session not found/);
    });
  });

  describe('handoff', () => {
    it('ends fromSession and creates new session', () => {
      const fromSessionId = store.sessionStart('sourceAgent');
      store.annotate('handoffSym', 'note', 'handoff note', { sessionId: fromSessionId });
      store.annotate('handoffSym', 'bug', 'handoff bug', { sessionId: fromSessionId });

      const result = store.handoff(fromSessionId, 'targetAgent', 'handoff context');
      expect(result.newSessionId).toBeDefined();
      expect(result.newSessionId).not.toBe(fromSessionId);
      expect(result.annotationsCopied).toBe(2);
    });

    it('handoff throws for non-existent session', () => {
      expect(() => store.handoff('non-existent-id', 'target', 'ctx'))
        .toThrow(/Session not found/);
    });

    it('handoff creates new session with correct agent', () => {
      const fromSessionId = store.sessionStart('sourceAgent');
      const result = store.handoff(fromSessionId, 'targetAgent', 'my context');

      const newCtx = store.sessionContext(result.newSessionId);
      expect(newCtx.session.agent).toBe('targetAgent');
      expect(newCtx.session.status).toBe('active');
      expect(newCtx.session.context).toBe('my context');
    });
  });

  describe('getPromotableAnnotations', () => {
    it('returns annotations with confidence >= 0.8', () => {
      store.annotate('promoOk', 'note', 'promo value');
      store.annotate('promoOk', 'note', 'promo value');
      store.annotate('promoOk', 'note', 'promo value');
      store.annotate('promoOk', 'note', 'promo value');
      store.annotate('promoOk', 'note', 'promo value');

      const promotable = store.getPromotableAnnotations();
      const matching = promotable.filter(a => a.symbol === 'promoOk');
      expect(matching.length).toBe(1);
      expect(matching[0].confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('does not return annotations with confidence below 0.8', () => {
      store.annotate('lowPromo', 'note', 'low value');

      const promotable = store.getPromotableAnnotations();
      const matching = promotable.filter(a => a.symbol === 'lowPromo');
      expect(matching.length).toBe(0);
    });
  });

  describe('getStaleAnnotations', () => {
    it('returns annotations older than daysOld with confidence below threshold', () => {
      const ann = store.annotate('staleTest', 'note', 'stale value');

      db.connection.prepare("UPDATE annotations SET updated_at = datetime('now', '-10 days') WHERE id = ?").run(ann.id);

      const stale = store.getStaleAnnotations(5, 0.6);
      const matching = stale.filter(a => a.id === ann.id);
      expect(matching.length).toBe(1);
    });

    it('does not return annotations with confidence above threshold', () => {
      const ann = store.annotate('staleHigh', 'note', 'high confidence');
      store.annotate('staleHigh', 'note', 'high confidence');
      store.annotate('staleHigh', 'note', 'high confidence');
      store.annotate('staleHigh', 'note', 'high confidence');

      db.connection.prepare("UPDATE annotations SET updated_at = datetime('now', '-10 days') WHERE id = ?").run(ann.id);

      const stale = store.getStaleAnnotations(5, 0.6);
      const matching = stale.filter(a => a.id === ann.id);
      expect(matching.length).toBe(0);
    });

    it('does not return recent annotations', () => {
      store.annotate('staleRecent', 'note', 'recent value');

      const stale = store.getStaleAnnotations(30, 0.6);
      const matching = stale.filter(a => a.symbol === 'staleRecent');
      expect(matching.length).toBe(0);
    });
  });

  describe('archiveAnnotation', () => {
    it('sets confidence to 0', () => {
      const ann = store.annotate('archiveTest', 'note', 'archive me');
      store.archiveAnnotation(ann.id);

      const recalled = store.recall({ symbol: 'archiveTest', key: 'note' });
      expect(recalled[0].confidence).toBe(0);
    });

    it('throws on non-existent annotation id', () => {
      expect(() => store.archiveAnnotation('non-existent-ann-id'))
        .toThrow(/Annotation not found/);
    });
  });

  describe('getAnnotationCount', () => {
    it('returns total number of annotations', () => {
      const before = store.getAnnotationCount();
      store.annotate('countTest1', 'note', 'val');
      store.annotate('countTest2', 'note', 'val');
      const after = store.getAnnotationCount();
      expect(after).toBe(before + 2);
    });
  });
});
