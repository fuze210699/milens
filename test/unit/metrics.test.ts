import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../src/store/db.js';
import { computeMetrics, formatMetricsReport } from '../../src/metrics.js';
import type { MilensMetrics } from '../../src/metrics.js';

function seedSymbols(db: Database, count: number, opts: { exported: boolean; filePath?: string; kind?: string }, startAt = 1): string[] {
  const ids: string[] = [];
  const stmt = db.connection.prepare(
    'INSERT INTO symbols (id, name, kind, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (let i = 0; i < count; i++) {
    const num = startAt + i;
    const id = `sym-${num}`;
    stmt.run(id, `func-${num}`, opts.kind ?? 'function', opts.filePath ?? 'src/lib/module.ts', num, num + 5, opts.exported ? 1 : 0);
    ids.push(id);
  }
  return ids;
}

function seedLinks(db: Database, fromId: string, toIds: string[]): void {
  const stmt = db.connection.prepare(
    'INSERT INTO links (id, from_id, to_id, type, confidence) VALUES (?, ?, ?, ?, ?)',
  );
  for (let i = 0; i < toIds.length; i++) {
    stmt.run(`link-${fromId}-${toIds[i]}`, fromId, toIds[i], 'calls', 1.0);
  }
}

function seedToolUsage(db: Database, rows: Array<{ tool: string; tokensOut: number; tokensSaved: number; durationMs: number }>): void {
  const stmt = db.connection.prepare(
    'INSERT INTO tool_usage (tool, tokens_out, tokens_saved, duration_ms) VALUES (?, ?, ?, ?)',
  );
  for (const r of rows) {
    stmt.run(r.tool, r.tokensOut, r.tokensSaved, r.durationMs);
  }
}

function seedAnnotations(
  db: Database,
  rows: Array<{ symbol: string; key: string; value: string; confidence: number }>,
): void {
  const stmt = db.connection.prepare(
    "INSERT INTO annotations (symbol, key, value, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
  );
  for (const r of rows) {
    stmt.run(r.symbol, r.key, r.value, r.confidence);
  }
}

function setRepoMeta(db: Database, key: string, value: string): void {
  db.connection.prepare('INSERT OR REPLACE INTO repo_meta (key, value) VALUES (?, ?)').run(key, value);
}

describe('Metrics', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('computeMetrics', () => {
    it('returns all-zero metrics for empty database', () => {
      const metrics = computeMetrics(db);

      expect(metrics.ter.useful).toBe(0);
      expect(metrics.ter.total).toBe(0);
      expect(metrics.ter.ratio).toBe(1);
      expect(metrics.ter.grade).toBe('Excellent');

      expect(metrics.lr.savings).toBe(0);
      expect(metrics.lr.possible).toBe(0);
      expect(metrics.lr.rate).toBe(0);
      expect(metrics.lr.grade).toBe('Poor');

      expect(metrics.cqi.score).toBeCloseTo(4.65, 2);
      expect(metrics.cqi.grade).toBe('Fair');
      expect(metrics.cqi.components.coverage).toBe(0);
      expect(metrics.cqi.components.deadCodeFree).toBe(1);
      expect(metrics.cqi.components.securityScore).toBe(0.7);
      expect(metrics.cqi.components.coupling).toBe(0.5);
      expect(metrics.cqi.components.documentation).toBe(0.5);

      expect(metrics.brr.recurring).toBe(0);
      expect(metrics.brr.totalFixed).toBe(0);
      expect(metrics.brr.rate).toBe(0);
      expect(metrics.brr.grade).toBe('Excellent');

      expect(metrics.tcgr.weeklyGrowth).toBe(0);
      expect(metrics.tcgr.grade).toBe('Poor');

      expect(metrics.dcer.dead).toBe(0);
      expect(metrics.dcer.total).toBe(0);
      expect(metrics.dcer.rate).toBe(0);
      expect(metrics.dcer.grade).toBe('Excellent');

      expect(metrics.ctr.manualMinutes).toBe(45);
      expect(metrics.ctr.milensMinutes).toBe(45);
      expect(metrics.ctr.reduction).toBe(0);
      expect(metrics.ctr.grade).toBe('Poor');
    });

    it('computes correct metrics with populated data', () => {
      // 12 symbols, 10 exported (sym-1..sym-10), 2 non-exported (sym-11, sym-12)
      const exportedIds = seedSymbols(db, 10, { exported: true, filePath: 'src/lib/module.ts' });
      const nonExportedIds = seedSymbols(db, 2, {
        exported: false,
        filePath: 'src/lib/module.ts',
      }, 11);

      // Links from sym-12 to sym-1..sym-7 → 7 exported symbols have incoming links, 3 are dead (sym-8..sym-10)
      seedLinks(db, nonExportedIds[1], exportedIds.slice(0, 7));

      // Coverage via repo_meta: 10 exported production, 5 tested
      setRepoMeta(db, 'exported_production_symbols', '10');
      setRepoMeta(db, 'tested_symbols', '5');
      setRepoMeta(db, 'test_files', '3');

      // Tool usage: 700 tokens out, 300 saved → totalOut=1000
      seedToolUsage(db, [
        { tool: 'milens_query', tokensOut: 300, tokensSaved: 100, durationMs: 50 },
        { tool: 'milens_context', tokensOut: 400, tokensSaved: 200, durationMs: 100 },
      ]);

      // 8 bugs, 5 with confidence >= 0.7 → recurring
      seedAnnotations(db, [
        { symbol: 'sym-1', key: 'bug', value: 'crash on null', confidence: 0.8 },
        { symbol: 'sym-2', key: 'bug', value: 'memory leak', confidence: 0.9 },
        { symbol: 'sym-3', key: 'bug', value: 'race condition', confidence: 0.75 },
        { symbol: 'sym-4', key: 'bug', value: 'wrong type', confidence: 0.7 },
        { symbol: 'sym-5', key: 'bug', value: 'missing null check', confidence: 0.85 },
        { symbol: 'sym-6', key: 'bug', value: 'boundary error', confidence: 0.5 },
        { symbol: 'sym-7', key: 'bug', value: 'off-by-one', confidence: 0.3 },
        { symbol: 'sym-8', key: 'bug', value: 'format issue', confidence: 0.6 },
      ]);

      // 6 test annotations → TCGR
      seedAnnotations(db, [
        { symbol: 'sym-1', key: 'test', value: 'unit test added', confidence: 0.9 },
        { symbol: 'sym-2', key: 'test', value: 'integration test', confidence: 0.8 },
        { symbol: 'sym-3', key: 'test', value: 'e2e test', confidence: 0.7 },
        { symbol: 'sym-4', key: 'test', value: 'snapshot test', confidence: 0.6 },
        { symbol: 'sym-5', key: 'test', value: 'perf test', confidence: 0.5 },
        { symbol: 'sym-6', key: 'test', value: 'coverage improved', confidence: 0.4 },
      ]);

      const metrics = computeMetrics(db);

      // TER: 700 / 1000 = 0.7 → Good
      expect(metrics.ter.useful).toBe(700);
      expect(metrics.ter.total).toBe(1000);
      expect(metrics.ter.ratio).toBeCloseTo(0.7, 4);
      expect(metrics.ter.grade).toBe('Good');

      // LR: 300 / 1000 = 0.3 → Excellent
      expect(metrics.lr.savings).toBe(300);
      expect(metrics.lr.possible).toBe(1000);
      expect(metrics.lr.rate).toBeCloseTo(0.3, 4);
      expect(metrics.lr.grade).toBe('Excellent');

      // CQI: coverage=0.5, deadCodeFree=0.7 → score=5.8 → Fair
      expect(metrics.cqi.components.coverage).toBeCloseTo(0.5, 4);
      expect(metrics.cqi.components.deadCodeFree).toBeCloseTo(0.7, 4);
      expect(metrics.cqi.score).toBeCloseTo(5.8, 1);
      expect(metrics.cqi.grade).toBe('Fair');

      // BRR: 5 recurring / 8 total = 0.625 → grade(1-0.625) = Poor
      expect(metrics.brr.recurring).toBe(5);
      expect(metrics.brr.totalFixed).toBe(8);
      expect(metrics.brr.rate).toBeCloseTo(0.625, 4);
      expect(metrics.brr.grade).toBe('Poor');

      // TCGR: min(6/10, 1) * 5 = 3 → grade(3/5) = Good
      expect(metrics.tcgr.weeklyGrowth).toBeCloseTo(3, 4);
      expect(metrics.tcgr.grade).toBe('Good');

      // DCER: 3 dead / 10 total = 0.3 → grade(1-0.3) = Poor
      expect(metrics.dcer.dead).toBe(3);
      expect(metrics.dcer.total).toBe(10);
      expect(metrics.dcer.rate).toBeCloseTo(0.3, 4);
      expect(metrics.dcer.grade).toBe('Poor');

      // CTR: 13.5 / 45 → 0.7 reduction → Good
      expect(metrics.ctr.manualMinutes).toBe(45);
      expect(metrics.ctr.milensMinutes).toBeCloseTo(13.5, 1);
      expect(metrics.ctr.reduction).toBeCloseTo(0.7, 4);
      expect(metrics.ctr.grade).toBe('Good');
    });

    it('handles zero exported symbols', () => {
      seedSymbols(db, 5, { exported: false, filePath: 'src/lib/module.ts' });

      seedToolUsage(db, [
        { tool: 'milens_query', tokensOut: 200, tokensSaved: 100, durationMs: 30 },
      ]);

      seedAnnotations(db, [
        { symbol: 'sym-1', key: 'bug', value: 'issue', confidence: 0.9 },
        { symbol: 'sym-2', key: 'test', value: 'test added', confidence: 0.8 },
      ]);

      const metrics = computeMetrics(db);

      expect(metrics.dcer.dead).toBe(0);
      expect(metrics.dcer.total).toBe(0);
      expect(metrics.dcer.rate).toBe(0);
      expect(metrics.dcer.grade).toBe('Excellent');
      expect(metrics.cqi.components.coverage).toBe(0);
      expect(metrics.cqi.components.deadCodeFree).toBe(1);
    });

    it('handles zero bugs', () => {
      seedSymbols(db, 5, { exported: true, filePath: 'src/lib/module.ts' });

      seedToolUsage(db, [
        { tool: 'milens_query', tokensOut: 500, tokensSaved: 200, durationMs: 40 },
      ]);

      seedAnnotations(db, [
        { symbol: 'sym-1', key: 'test', value: 'test added', confidence: 0.9 },
      ]);

      const metrics = computeMetrics(db);

      expect(metrics.brr.recurring).toBe(0);
      expect(metrics.brr.totalFixed).toBe(0);
      expect(metrics.brr.rate).toBe(0);
      expect(metrics.brr.grade).toBe('Excellent');
    });

    it('handles zero tokens', () => {
      seedSymbols(db, 3, { exported: true, filePath: 'src/lib/module.ts' });
      setRepoMeta(db, 'exported_production_symbols', '3');
      setRepoMeta(db, 'tested_symbols', '2');

      seedAnnotations(db, [
        { symbol: 'sym-1', key: 'bug', value: 'issue', confidence: 0.9 },
      ]);

      const metrics = computeMetrics(db);

      expect(metrics.ter.useful).toBe(0);
      expect(metrics.ter.total).toBe(0);
      expect(metrics.ter.ratio).toBe(1);
      expect(metrics.ter.grade).toBe('Excellent');

      expect(metrics.lr.savings).toBe(0);
      expect(metrics.lr.possible).toBe(0);
      expect(metrics.lr.rate).toBe(0);
      expect(metrics.lr.grade).toBe('Poor');

      expect(metrics.ctr.manualMinutes).toBe(45);
      expect(metrics.ctr.milensMinutes).toBe(45);
      expect(metrics.ctr.reduction).toBe(0);
      expect(metrics.ctr.grade).toBe('Poor');
    });
  });

  describe('formatMetricsReport', () => {
    it('produces expected format with all 7 metrics', () => {
      const metrics: MilensMetrics = {
        ter: { useful: 700, total: 1000, ratio: 0.7, grade: 'Good' },
        lr: { savings: 300, possible: 1000, rate: 0.3, grade: 'Excellent' },
        cqi: { score: 5.8, grade: 'Fair', components: { coverage: 0.5, deadCodeFree: 0.7, securityScore: 0.7, coupling: 0.5, documentation: 0.5 } },
        brr: { recurring: 5, totalFixed: 8, rate: 0.625, grade: 'Poor' },
        tcgr: { weeklyGrowth: 3, grade: 'Good' },
        dcer: { dead: 3, total: 10, rate: 0.3, grade: 'Poor' },
        ctr: { manualMinutes: 45, milensMinutes: 13.5, reduction: 0.7, grade: 'Good' },
      };

      const report = formatMetricsReport(metrics);

      expect(report).toContain('Milens Metrics Report');

      expect(report).toContain('TER:');
      expect(report).toContain('LR:');
      expect(report).toContain('CQI:');
      expect(report).toContain('BRR:');
      expect(report).toContain('TCGR:');
      expect(report).toContain('DCER:');
      expect(report).toContain('CTR:');

      expect(report).toContain('70.0%');
      expect(report).toContain('30.0%');
      expect(report).toContain('5.8/10');
      expect(report).toContain('62.5%');
      expect(report).toContain('3.0%/wk');

      expect(report).toContain('Good');
      expect(report).toContain('Excellent');
      expect(report).toContain('Fair');
      expect(report).toContain('Poor');

      const lines = report.split('\n');
      expect(lines.length).toBe(11);
      expect(lines[0]).toContain('╔');
      expect(lines[1]).toContain('Milens Metrics Report');
      expect(lines[2]).toContain('╠');
      expect(lines[10]).toContain('╚');
    });

    it('formats all-Poor metrics correctly', () => {
      const metrics: MilensMetrics = {
        ter: { useful: 0, total: 100, ratio: 0, grade: 'Poor' },
        lr: { savings: 0, possible: 100, rate: 0, grade: 'Poor' },
        cqi: { score: 2.0, grade: 'Poor', components: { coverage: 0, deadCodeFree: 0.5, securityScore: 0.7, coupling: 0.5, documentation: 0.5 } },
        brr: { recurring: 10, totalFixed: 10, rate: 1.0, grade: 'Poor' },
        tcgr: { weeklyGrowth: 0, grade: 'Poor' },
        dcer: { dead: 10, total: 10, rate: 1.0, grade: 'Poor' },
        ctr: { manualMinutes: 45, milensMinutes: 45, reduction: 0, grade: 'Poor' },
      };

      const report = formatMetricsReport(metrics);

      expect(report).toContain('0.0%');
      expect(report).toContain('100.0%');
      expect(report).toContain('2.0/10');
      expect(report).toContain('0.0%/wk');

      for (const line of report.split('\n').filter(l => l.includes('Poor'))) {
        expect(line).toContain('Poor');
      }
    });

    it('formats all-Excellent metrics correctly', () => {
      const metrics: MilensMetrics = {
        ter: { useful: 100, total: 100, ratio: 1.0, grade: 'Excellent' },
        lr: { savings: 100, possible: 100, rate: 1.0, grade: 'Excellent' },
        cqi: { score: 9.5, grade: 'Excellent', components: { coverage: 1.0, deadCodeFree: 1.0, securityScore: 0.7, coupling: 0.5, documentation: 0.5 } },
        brr: { recurring: 0, totalFixed: 10, rate: 0, grade: 'Excellent' },
        tcgr: { weeklyGrowth: 5, grade: 'Excellent' },
        dcer: { dead: 0, total: 10, rate: 0, grade: 'Excellent' },
        ctr: { manualMinutes: 45, milensMinutes: 0, reduction: 1.0, grade: 'Excellent' },
      };

      const report = formatMetricsReport(metrics);

      expect(report).toContain('100.0%');
      expect(report).toContain('9.5/10');
      expect(report).toContain('5.0%/wk');

      let excellentCount = 0;
      for (const line of report.split('\n')) {
        if (line.includes('Excellent')) excellentCount++;
      }
      expect(excellentCount).toBe(7);
    });
  });
});
