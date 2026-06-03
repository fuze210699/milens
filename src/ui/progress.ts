import type { AnalysisStats } from '../types.js';

export enum ProgressPhase {
  PARSE = 'parse',
  RESOLVE = 'resolve',
  ENRICH = 'enrich',
  PERSIST = 'persist',
}

export interface ProgressReporter {
  startPhase(phase: ProgressPhase, total: number): void;
  tick(label?: string): void;
  endPhase(): void;
  done(stats: AnalysisStats): void;
  finalize(): void;
}

export function createProgressReporter(): ProgressReporter {
  let currentPhase: ProgressPhase | null = null;
  let total: number = 0;
  let completed: number = 0;

  function renderBar(): string {
    if (total === 0) return '';
    const pct = Math.min(100, Math.round((completed / total) * 100));
    const barWidth = 30;
    const filled = Math.round((completed / total) * barWidth);
    const empty = barWidth - filled;
    return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${pct}%`;
  }

  return {
    startPhase(phase: ProgressPhase, t: number): void {
      currentPhase = phase;
      total = t;
      completed = 0;
      process.stderr.write(`\n${phase.padEnd(10)} ${renderBar()}`);
    },

    tick(label?: string): void {
      completed++;
      const labelStr = label ? ` ${label}` : '';
      process.stderr.write(`\r${(currentPhase ?? '').padEnd(10)} ${renderBar()}${labelStr}`);
    },

    endPhase(): void {
      completed = total;
      process.stderr.write(`\r${(currentPhase ?? '').padEnd(10)} ${renderBar()}\n`);
      currentPhase = null;
    },

    done(stats: AnalysisStats): void {
      process.stderr.write(`\nDone: ${stats.symbolCount} symbols, ${stats.linkCount} links, ${stats.filesParsed} files parsed (${stats.durationMs}ms)\n`);
    },

    finalize(): void {
      process.stderr.write('\n');
    },
  };
}
