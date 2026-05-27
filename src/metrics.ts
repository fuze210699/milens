import type { Database } from './store/db.js';
import { AnnotationStore } from './store/annotations.js';

export interface MilensMetrics {
  ter: { useful: number; total: number; ratio: number; grade: string };
  lr: { savings: number; possible: number; rate: number; grade: string };
  cqi: { score: number; grade: string; components: { coverage: number; deadCodeFree: number; securityScore: number; coupling: number; documentation: number } };
  brr: { recurring: number; totalFixed: number; rate: number; grade: string };
  tcgr: { weeklyGrowth: number; grade: string };
  dcer: { dead: number; total: number; rate: number; grade: string };
}

function grade(val: number, thresholds: number[]): string {
  if (val >= thresholds[0]) return 'Excellent';
  if (val >= thresholds[1]) return 'Good';
  if (val >= thresholds[2]) return 'Fair';
  return 'Poor';
}

export function computeMetrics(db: Database): MilensMetrics {
  const store = new AnnotationStore(db.connection);

  const usageStats = db.getToolUsageStats();
  const totalOut = usageStats.totalTokensOut + usageStats.totalTokensSaved;
  const terRatio = totalOut > 0 ? usageStats.totalTokensOut / totalOut : 1;

  const lrRate = totalOut > 0 ? usageStats.totalTokensSaved / totalOut : 0;

  const coverage = db.getTestCoverage();
  const coveragePct = coverage.exportedProductionSymbols > 0
    ? coverage.testedSymbols / coverage.exportedProductionSymbols : 0;
  const deadCode = db.findDeadCode(undefined, 100);
  const totalExported = db.getAllSymbols().filter(s => s.exported).length;
  const deadCodePct = totalExported > 0 ? deadCode.length / totalExported : 0;
  const cqi = 0.35 * coveragePct + 0.20 * (1 - deadCodePct) + 0.20 * 0.7 + 0.15 * 0.5 + 0.10 * 0.5;

  const bugs = store.recall({ key: 'bug', limit: 1000 });
  const recurring = bugs.filter(b => b.confidence >= 0.7).length;
  const brrRate = bugs.length > 0 ? recurring / bugs.length : 0;

  const weeklyAnnotations = store.recall({ key: 'test', limit: 1000 });
  const tcgrRate = weeklyAnnotations.length > 0 ? Math.min(weeklyAnnotations.length / 10, 1) * 5 : 0;

  const dcerRate = totalExported > 0 ? deadCode.length / totalExported : 0;

  return {
    ter: { useful: usageStats.totalTokensOut, total: totalOut, ratio: terRatio, grade: grade(terRatio, [0.8, 0.6, 0.4]) },
    lr: { savings: usageStats.totalTokensSaved, possible: totalOut, rate: lrRate, grade: grade(lrRate, [0.3, 0.15, 0.05]) },
    cqi: { score: cqi * 10, grade: grade(cqi * 10, [8, 6, 4]), components: { coverage: coveragePct, deadCodeFree: 1 - deadCodePct, securityScore: 0.7, coupling: 0.5, documentation: 0.5 } },
    brr: { recurring, totalFixed: bugs.length, rate: brrRate, grade: grade(1 - brrRate, [0.9, 0.75, 0.5]) },
    tcgr: { weeklyGrowth: tcgrRate, grade: grade(tcgrRate / 5, [0.8, 0.5, 0.2]) },
    dcer: { dead: deadCode.length, total: totalExported, rate: dcerRate, grade: grade(1 - dcerRate, [0.97, 0.9, 0.8]) },
  };
}

export function formatMetricsReport(metrics: MilensMetrics): string {
  const lines = [
    '╔══════════════════════════════════════╗',
    '║       Milens Metrics Report         ║',
    '╠══════════════════════════════════════╣',
    `║ TER: ${formatMetric(metrics.ter.ratio * 100, '%', metrics.ter.grade)}`,
    `║ LR:  ${formatMetric(metrics.lr.rate * 100, '%', metrics.lr.grade)}`,
    `║ CQI: ${formatMetric(metrics.cqi.score, '/10', metrics.cqi.grade)}`,
    `║ BRR: ${formatMetric(metrics.brr.rate * 100, '%', metrics.brr.grade)}`,
    `║ TCGR:${formatMetric(metrics.tcgr.weeklyGrowth, '%/wk', metrics.tcgr.grade)}`,
    `║ DCER:${formatMetric(metrics.dcer.rate * 100, '%', metrics.dcer.grade)}`,
    '╚══════════════════════════════════════╝',
  ];
  return lines.join('\n');
}

function formatMetric(val: number, suffix: string, grade: string): string {
  const v = val.toFixed(1).padStart(6);
  const g = grade.padEnd(9);
  return `${v}${suffix}  ${g}`;
}
