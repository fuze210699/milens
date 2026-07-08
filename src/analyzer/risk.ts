import type { Database } from '../store/db.js';
import type { CodeSymbol } from '../types.js';
import { isTestFile } from '../utils.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Count distinct calling *files* at depth 1 for a symbol, not raw link rows.
 * A file that both imports and calls a symbol produces two link rows (imports + calls)
 * for one real dependent — counting raw rows double-counts risk score and hub/critical
 * classification. This is the single source of truth for "how many dependents does X have".
 */
export function countDependentFiles(
  db: Database,
  symbolId: string,
  opts?: { excludeTestFiles?: boolean },
): { count: number; files: string[] } {
  const incoming = db.getIncomingLinks(symbolId).filter(l => l.type !== 'contains');
  const seenFiles = new Set<string>();
  const files: string[] = [];
  for (const l of incoming) {
    const from = db.findSymbolById(l.fromId);
    const filePath = from?.filePath;
    if (!filePath) continue;
    if (opts?.excludeTestFiles && isTestFile(filePath)) continue;
    if (seenFiles.has(filePath)) continue;
    seenFiles.add(filePath);
    files.push(filePath);
  }
  return { count: files.length, files };
}

export function classifyRisk(score: number, hasUntested: boolean, hasCriticalHub: boolean): RiskLevel {
  if (hasCriticalHub || score >= 50) return 'CRITICAL';
  if (score >= 30) return 'HIGH';
  if (score >= 10) return 'MEDIUM';
  if (hasUntested) return 'MEDIUM';
  return 'LOW';
}

export function scoreSymbolRisk(sym: CodeSymbol, dependents: number, tested: boolean): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const heat = sym.heat ?? 0;
  score += Math.min(heat * 0.3, 15);

  score += dependents * 3;
  if (dependents > 10) reasons.push(`${dependents} direct dependents`);
  else if (dependents > 5) reasons.push(`${dependents} dependents`);

  if (sym.role === 'hub') { score += 10; reasons.push('hub function'); }
  if (sym.role === 'entrypoint') { score += 5; reasons.push('entrypoint'); }

  if (!tested && sym.exported) { score *= 1.5; reasons.push('no test coverage'); }
  if (sym.exported && dependents > 0) score += 3;

  if (!sym.exported && dependents === 0) {
    return { score: 0, reasons: ['internal implementation detail'] };
  }

  if (!sym.exported) {
    if (dependents <= 1) {
      score = Math.round(score * 0.4);
      if (!reasons.length) reasons.push('internal (non-exported)');
    } else if (dependents <= 3) {
      score = Math.round(score * 0.65);
    }
  }

  return { score: Math.round(score), reasons };
}
