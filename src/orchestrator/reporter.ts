import type { ReviewResult, SymbolRisk } from '../analyzer/review.js';
import type { CodeSymbol } from '../types.js';

export interface OrchestratorReport {
  cycleNumber: number;
  changedFiles: string[];
  review: ReviewResult;
  coverageGaps: CodeSymbol[];
  deadSymbols: CodeSymbol[];
  durationMs: number;
}

export interface ReportOptions {
  useEmoji?: boolean;
}

export function formatReport(report: OrchestratorReport, opts: ReportOptions = {}): string {
  const lines: string[] = [];
  const e = (icon: string) => opts.useEmoji ? icon : '';

  lines.push(`--- Orchestrator Cycle #${report.cycleNumber} ---`);
  lines.push(`Changed: ${report.changedFiles.length} files, ${report.review.symbols.length} symbols affected`);
  lines.push(`Risk: ${report.review.risk} (score: ${report.review.score})`);

  if (report.review.hotspots.length > 0) {
    lines.push('');
    lines.push(`${e('!')} ${report.review.hotspots.length} HIGH/CRITICAL risk symbols:`);
    for (const h of report.review.hotspots.slice(0, 10)) {
      lines.push(`  - ${h.symbol.name} [${h.symbol.kind}] in ${h.symbol.filePath}:${h.symbol.startLine}`);
      lines.push(`    Risk: ${h.riskLevel} | Score: ${h.riskScore} | ${h.reasons.join(', ')}`);
    }
  }

  if (report.review.untestedChanges > 0) {
    lines.push('');
    lines.push(`${e('*')} ${report.review.untestedChanges} untested exported symbol(s) changed`);
  }

  if (report.coverageGaps.length > 0) {
    lines.push('');
    lines.push(`${e('?')} ${report.coverageGaps.length} test coverage gaps:`);
    for (const s of report.coverageGaps.slice(0, 5)) {
      lines.push(`  - ${s.name} [${s.kind}] in ${s.filePath}:${s.startLine} (heat: ${s.heat ?? 0})`);
    }
  }

  if (report.deadSymbols.length > 0) {
    lines.push('');
    lines.push(`${e('x')} ${report.deadSymbols.length} potentially dead symbols:`);
    for (const s of report.deadSymbols.slice(0, 5)) {
      lines.push(`  - ${s.name} [${s.kind}] in ${s.filePath}:${s.startLine}`);
    }
  }

  if (!report.review.hotspots.length && !report.coverageGaps.length && !report.deadSymbols.length) {
    lines.push(`\n${e('v')} No issues detected. All clear.`);
  }

  return lines.join('\n');
}
