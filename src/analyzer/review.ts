import { execFileSync } from 'node:child_process';
import type { Database } from '../store/db.js';
import type { CodeSymbol } from '../types.js';
import { isTestFile } from '../utils.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SymbolRisk {
  symbol: CodeSymbol;
  dependents: number;
  tested: boolean;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
}

export interface ReviewResult {
  risk: RiskLevel;
  score: number;
  changedFiles: string[];
  symbols: SymbolRisk[];
  hotspots: SymbolRisk[];
  untestedChanges: number;
  summary: string;
}

function classifyRisk(score: number, hasUntested: boolean, hasCriticalHub: boolean): RiskLevel {
  if (hasCriticalHub || score >= 50) return 'CRITICAL';
  if (score >= 30) return 'HIGH';
  if (score >= 10) return 'MEDIUM';
  if (hasUntested) return 'MEDIUM';
  return 'LOW';
}

function scoreSymbol(sym: CodeSymbol, dependents: number, tested: boolean): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Heat contribution (how central this symbol is)
  const heat = sym.heat ?? 0;
  score += Math.min(heat * 0.3, 15);

  // Dependents contribution (blast radius)
  score += dependents * 3;
  if (dependents > 10) reasons.push(`${dependents} direct dependents`);
  else if (dependents > 5) reasons.push(`${dependents} dependents`);

  // Role-based risk
  if (sym.role === 'hub') {
    score += 10;
    reasons.push('hub function (high fan-in + fan-out)');
  }
  if (sym.role === 'entrypoint') {
    score += 5;
    reasons.push('entrypoint');
  }

  // Test coverage penalty
  if (!tested && sym.exported) {
    score *= 1.5;
    reasons.push('no test coverage');
  }

  // Exported symbols are riskier
  if (sym.exported && dependents > 0) {
    score += 3;
  }

  return { score: Math.round(score), reasons };
}

function getChangedFiles(root: string, ref: string, base?: string): string[] {
  // Validate ref to prevent injection
  const refPattern = /^[a-zA-Z0-9\/._~^\-]+$/;
  if (!refPattern.test(ref)) throw new Error('Invalid git ref');
  if (base && !refPattern.test(base)) throw new Error('Invalid git base ref');

  const diffTarget = base ? `${base}...${ref}` : ref;

  const output = execFileSync('git', ['diff', '--name-only', diffTarget], { cwd: root, encoding: 'utf-8' });
  const files = output.trim().split('\n').filter(Boolean);

  // Only include staged files when reviewing working tree (no explicit base/ref pair)
  if (!base) {
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf-8' });
    const stagedFiles = staged.trim().split('\n').filter(Boolean);
    return [...new Set([...files, ...stagedFiles])];
  }

  return [...new Set(files)];
}

function isSymbolTested(db: Database, sym: CodeSymbol): boolean {
  const incoming = db.getIncomingLinks(sym.id);
  return incoming.some(l => {
    const from = db.findSymbolById(l.fromId);
    return from && isTestFile(from.filePath);
  });
}

export function reviewPr(db: Database, root: string, ref = 'HEAD', base?: string): ReviewResult {
  let changedFiles: string[];
  try {
    changedFiles = getChangedFiles(root, ref, base);
  } catch {
    return {
      risk: 'LOW', score: 0, changedFiles: [], symbols: [],
      hotspots: [], untestedChanges: 0,
      summary: 'Not a git repository or git not available.',
    };
  }

  if (changedFiles.length === 0) {
    return {
      risk: 'LOW', score: 0, changedFiles: [], symbols: [],
      hotspots: [], untestedChanges: 0,
      summary: 'No changed files detected.',
    };
  }

  const symbolRisks: SymbolRisk[] = [];
  let untestedChanges = 0;

  for (const file of changedFiles) {
    if (isTestFile(file)) continue; // test file changes don't add risk

    const syms = db.getSymbolsByFile(file);
    for (const sym of syms) {
      const upstream = db.findUpstream(sym.id, 1);
      const dependents = upstream.length;
      const tested = isSymbolTested(db, sym);
      if (!tested && sym.exported) untestedChanges++;

      const { score, reasons } = scoreSymbol(sym, dependents, tested);
      const riskLevel = classifyRisk(score, !tested && sym.exported, sym.role === 'hub' && !tested && dependents > 10);

      symbolRisks.push({ symbol: sym, dependents, tested, riskScore: score, riskLevel, reasons });
    }
  }

  // Sort by risk descending
  symbolRisks.sort((a, b) => b.riskScore - a.riskScore);

  const totalScore = symbolRisks.reduce((sum, s) => sum + s.riskScore, 0);
  const hotspots = symbolRisks.filter(s => s.riskLevel === 'HIGH' || s.riskLevel === 'CRITICAL');
  const hasCriticalHub = symbolRisks.some(s => s.symbol.role === 'hub' && !s.tested && s.dependents > 10);
  const overallRisk = classifyRisk(totalScore, untestedChanges > 0, hasCriticalHub);

  const summaryParts: string[] = [
    `${changedFiles.length} files changed, ${symbolRisks.length} symbols affected`,
  ];
  if (hotspots.length > 0) summaryParts.push(`${hotspots.length} hotspots`);
  if (untestedChanges > 0) summaryParts.push(`${untestedChanges} untested`);
  summaryParts.push(`overall risk: ${overallRisk} (score: ${totalScore})`);

  return {
    risk: overallRisk,
    score: totalScore,
    changedFiles,
    symbols: symbolRisks,
    hotspots,
    untestedChanges,
    summary: summaryParts.join(', '),
  };
}

export function reviewSymbol(db: Database, name: string): SymbolRisk | null {
  const syms = db.findSymbolByName(name);
  if (syms.length === 0) return null;

  const sym = syms[0];
  const upstream = db.findUpstream(sym.id, 1);
  const dependents = upstream.length;
  const tested = isSymbolTested(db, sym);
  const { score, reasons } = scoreSymbol(sym, dependents, tested);
  const riskLevel = classifyRisk(score, !tested && sym.exported, sym.role === 'hub' && !tested && dependents > 10);

  return { symbol: sym, dependents, tested, riskScore: score, riskLevel, reasons };
}
