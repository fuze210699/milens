import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../../src/store/db.js';
import { AnnotationStore } from '../../src/store/annotations.js';
import {
  boostConfidence,
  decayConfidence,
  getStaleAnnotations,
  promoteSecurityAnnotations,
  runDecayPass,
  autoPromote,
} from '../../src/store/confidence.js';

const TEST_DB = join(import.meta.dirname, '..', 'tmp', 'test-confidence.db');
const SKILL_DIR = join(import.meta.dirname, '..', 'tmp', 'skills-output');

describe('Confidence', () => {
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
    try { rmSync(SKILL_DIR, { recursive: true, force: true }); } catch {}
  });

  beforeEach(() => {
    db.connection.prepare('DELETE FROM evolution_log').run();
    db.connection.prepare('DELETE FROM annotations').run();
  });

  // ── helpers ──

  function setConfidence(id: string, confidence: number): void {
    db.connection.prepare('UPDATE annotations SET confidence = ? WHERE id = ?').run(confidence, id);
  }

  function setUpdatedAt(id: string, updatedAt: string): void {
    db.connection.prepare('UPDATE annotations SET updated_at = ? WHERE id = ?').run(updatedAt, id);
  }

  function countEvolutionEvents(annotationId: string, event?: string): number {
    if (event) {
      const row = db.connection
        .prepare('SELECT COUNT(*) as c FROM evolution_log WHERE annotation_id = ? AND event = ?')
        .get(annotationId, event) as any;
      return row.c;
    }
    const row = db.connection
      .prepare('SELECT COUNT(*) as c FROM evolution_log WHERE annotation_id = ?')
      .get(annotationId) as any;
    return row.c;
  }

  // ── boostConfidence ──

  describe('boostConfidence', () => {
    it('should boost confidence and log event', () => {
      const ann = store.annotate('boostSym', 'note', 'test');
      setConfidence(ann.id, 0.5);
      boostConfidence(store, ann.id);
      expect(countEvolutionEvents(ann.id, 'confidence_up')).toBe(1);
    });

    it('should persist boosted confidence', () => {
      const ann = store.annotate('boostPersist', 'note', 'test');
      setConfidence(ann.id, 0.5);
      boostConfidence(store, ann.id);
      const recalled = store.recall({ limit: 1000 });
      const updated = recalled.find(a => a.id === ann.id);
      expect(updated).toBeDefined();
      expect(updated!.confidence).toBe(0.6);
    });

    it('should clamp confidence at 1.0', () => {
      const ann = store.annotate('clampSym', 'note', 'test');
      setConfidence(ann.id, 0.95);
      boostConfidence(store, ann.id);
      expect(countEvolutionEvents(ann.id, 'confidence_up')).toBe(1);
    });

    it('should not log event when confidence already at 1.0', () => {
      const ann = store.annotate('maxSym', 'note', 'test');
      setConfidence(ann.id, 1.0);
      boostConfidence(store, ann.id);
      expect(countEvolutionEvents(ann.id, 'confidence_up')).toBe(0);
    });

    it('should accept custom increment', () => {
      const ann = store.annotate('customSym', 'note', 'test');
      setConfidence(ann.id, 0.5);
      boostConfidence(store, ann.id, 0.3);
      expect(countEvolutionEvents(ann.id, 'confidence_up')).toBe(1);
    });

    it('should handle missing annotation gracefully', () => {
      expect(() => boostConfidence(store, 'nonexistent-id')).not.toThrow();
    });
  });

  // ── decayConfidence ──

  describe('decayConfidence', () => {
    it('should decay confidence and log event', () => {
      const ann = store.annotate('decaySym', 'note', 'test');
      setConfidence(ann.id, 0.5);
      decayConfidence(store, ann.id);
      expect(countEvolutionEvents(ann.id, 'confidence_down')).toBe(1);
    });

    it('should persist decayed confidence', () => {
      const ann = store.annotate('decayPersist', 'note', 'test');
      setConfidence(ann.id, 0.5);
      decayConfidence(store, ann.id);
      const recalled = store.recall({ limit: 1000 });
      const updated = recalled.find(a => a.id === ann.id);
      expect(updated).toBeDefined();
      expect(updated!.confidence).toBe(0.4);
    });

    it('should clamp confidence at 0.0', () => {
      const ann = store.annotate('floorSym', 'note', 'test');
      setConfidence(ann.id, 0.05);
      decayConfidence(store, ann.id);
      expect(countEvolutionEvents(ann.id, 'confidence_down')).toBe(1);
    });

    it('should not log event when confidence already at 0.0', () => {
      const ann = store.annotate('zeroSym', 'note', 'test');
      setConfidence(ann.id, 0.0);
      decayConfidence(store, ann.id);
      expect(countEvolutionEvents(ann.id, 'confidence_down')).toBe(0);
    });

    it('should accept custom decrement', () => {
      const ann = store.annotate('customDecaySym', 'note', 'test');
      setConfidence(ann.id, 0.5);
      decayConfidence(store, ann.id, 0.3);
      expect(countEvolutionEvents(ann.id, 'confidence_down')).toBe(1);
    });

    it('should handle missing annotation gracefully', () => {
      expect(() => decayConfidence(store, 'nonexistent-id')).not.toThrow();
    });
  });

  // ── getStaleAnnotations ──

  describe('getStaleAnnotations', () => {
    it('should delegate to store.getStaleAnnotations', () => {
      const ann = store.annotate('staleSym', 'note', 'stale');
      setConfidence(ann.id, 0.2);
      setUpdatedAt(ann.id, '2020-01-01 00:00:00');

      const result = getStaleAnnotations(store, 30, 0.5);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some(a => a.id === ann.id)).toBe(true);
    });

    it('should use default parameters', () => {
      const result = getStaleAnnotations(store);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should not include recent annotations', () => {
      store.annotate('recentSym', 'note', 'recent');
      const result = getStaleAnnotations(store, 30, 0.5);
      expect(result.length).toBe(0);
    });
  });

  // ── promoteSecurityAnnotations ──

  describe('promoteSecurityAnnotations', () => {
    it('should return empty when no security annotations', () => {
      const result = promoteSecurityAnnotations(store, '/test/root');
      expect(result.promoted).toBe(0);
      expect(result.content).toBe('');
    });

    it('should return empty when no high-confidence security annotations', () => {
      const ann = store.annotate('lowSec', 'security', 'some issue');
      setConfidence(ann.id, 0.3);
      const result = promoteSecurityAnnotations(store, '/test/root');
      expect(result.promoted).toBe(0);
      expect(result.content).toBe('');
    });

    it('should promote high-confidence security annotations', () => {
      const ann1 = store.annotate('testFn', 'security', 'Some vulnerability');
      setConfidence(ann1.id, 0.85);

      const ann2 = store.annotate('criticalFn', 'security', 'Critical issue');
      setConfidence(ann2.id, 0.95);

      const result = promoteSecurityAnnotations(store, '/test/root');
      expect(result.promoted).toBe(2);
      expect(result.content).toContain('Auto-generated Security Rules');
      expect(result.content).toContain('testFn');
      expect(result.content).toContain('criticalFn');
      expect(result.content).toContain('CRITICAL');
      expect(result.content).toContain('MEDIUM');
    });

    it('should log promotion events', () => {
      const ann = store.annotate('promoFn', 'security', 'promotable rule');
      setConfidence(ann.id, 0.9);

      promoteSecurityAnnotations(store, '/test/root');
      expect(countEvolutionEvents(ann.id, 'promoted')).toBe(1);
    });
  });

  // ── runDecayPass ──

  describe('runDecayPass', () => {
    it('should handle no stale annotations', () => {
      const result = runDecayPass(store);
      expect(result.decayed).toBe(0);
      expect(result.archived).toBe(0);
    });

    it('should archive stale low-confidence annotations', () => {
      const ann = store.annotate('archiveMe', 'note', 'low conf');
      setConfidence(ann.id, 0.2);
      setUpdatedAt(ann.id, '2020-01-01 00:00:00');

      const result = runDecayPass(store);
      expect(result.archived).toBe(1);
      expect(result.decayed).toBe(0);
    });

    it('should decay stale medium-confidence annotations', () => {
      const ann = store.annotate('decayMe', 'note', 'medium conf');
      setConfidence(ann.id, 0.5);
      setUpdatedAt(ann.id, '2020-01-01 00:00:00');

      const result = runDecayPass(store);
      expect(result.decayed).toBe(1);
    });

    it('should reduce stored confidence after two decay passes', () => {
      const ann = store.annotate('decayTwice', 'note', 'test');
      setConfidence(ann.id, 0.5);
      setUpdatedAt(ann.id, '2020-01-01 00:00:00');

      runDecayPass(store);
      setUpdatedAt(ann.id, '2020-01-01 00:00:00');
      runDecayPass(store);

      const recalled = store.recall({ limit: 1000 });
      const updated = recalled.find(a => a.id === ann.id);
      expect(updated).toBeDefined();
      expect(updated!.confidence).toBeCloseTo(0.3);
    });

    it('should keep high-confidence recently-updated annotations', () => {
      const ann = store.annotate('keepMe', 'note', 'high conf recent');
      setConfidence(ann.id, 0.95);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000)
        .toISOString().replace('T', ' ').slice(0, 19);
      setUpdatedAt(ann.id, sixtyDaysAgo);

      const result = runDecayPass(store);
      expect(result.decayed).toBe(0);
      expect(result.archived).toBe(0);
    });
  });

  // ── autoPromote ──

  describe('autoPromote', () => {
    const rootPath = join(import.meta.dirname, '..', 'tmp', 'skills-output');

    afterEach(() => {
      try { rmSync(rootPath, { recursive: true, force: true }); } catch {}
    });

    it('should return null for low confidence', () => {
      const result = autoPromote(
        {
          symbol: 'testFn',
          key: 'security',
          value: 'Some rule',
          confidence: 0.3,
          agent: 'test',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        rootPath,
      );
      expect(result).toBeNull();
    });

    it('should return null for confidence just below threshold', () => {
      const result = autoPromote(
        {
          symbol: 'borderFn',
          key: 'bug',
          value: 'borderline',
          confidence: 0.79,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        rootPath,
      );
      expect(result).toBeNull();
    });

    it('should create skill file for high confidence', () => {
      const result = autoPromote(
        {
          symbol: 'testFn',
          key: 'security',
          value: 'Some rule content',
          confidence: 0.9,
          agent: 'test-agent',
          createdAt: '2024-01-01',
          updatedAt: '2024-06-01',
        },
        rootPath,
      );
      expect(result).not.toBeNull();
      expect(result).toContain('milens-security');

      const skillPath = join(result!, 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);

      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('SECURITY: testFn');
      expect(content).toContain('Auto-promoted by milens');
      expect(content).toContain('Confidence: 90%');
      expect(content).toContain('Some rule content');
      expect(content).toContain('- **Symbol:** `testFn`');
    });

    it('should create different key directories based on annotation key', () => {
      const result = autoPromote(
        {
          symbol: 'bugFn',
          key: 'bug',
          value: 'A bug pattern',
          confidence: 0.95,
          agent: 'agent',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        rootPath,
      );
      expect(result).toContain('milens-bug');
      expect(existsSync(join(result!, 'SKILL.md'))).toBe(true);
    });
  });
});
