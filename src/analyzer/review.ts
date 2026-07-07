import { execFileSync } from 'node:child_process';
import type { Database } from '../store/db.js';
import type { CodeSymbol } from '../types.js';
import { isTestFile } from '../utils.js';
import { countDependentFiles, scoreSymbolRisk, classifyRisk } from './risk.js';
import type { RiskLevel } from './risk.js';

export type { RiskLevel };

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

// ── Helpers ──

function isFixtureOrTest(file: string): boolean {
  return isTestFile(file) ||
    /(^|[\/\\])test[\/\\]fixtures[\/\\]/.test(file) ||
    /(^|[\/\\])fixtures[\/\\]/.test(file);
}

function isNonSourceFile(file: string): boolean {
  if (!file.startsWith('src/')) return true;
  return /\.(md|json|lock|yml|yaml|toml)$/.test(file) ||
    /\/\.milens\//.test(file) ||
    /\/node_modules\//.test(file);
}

// ── Git helpers ──

function getChangedFiles(root: string, ref: string, base?: string): string[] {
  const refPattern = /^[a-zA-Z0-9\/._~^\-]+$/;
  if (!refPattern.test(ref)) throw new Error('Invalid git ref');
  if (base && !refPattern.test(base)) throw new Error('Invalid git base ref');

  const diffTarget = base ? `${base}...${ref}` : ref;

  const output = execFileSync('git', ['diff', '--name-only', diffTarget], { cwd: root, encoding: 'utf-8' });
  const files = output.trim().split('\n').filter(Boolean);
  const sourceFiles = files.filter(f => !isFixtureOrTest(f) && !isNonSourceFile(f));

  if (!base) {
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', ref], { cwd: root, encoding: 'utf-8' });
    const stagedFiles = staged.trim().split('\n').filter(Boolean)
      .filter(f => !isFixtureOrTest(f) && !isNonSourceFile(f));
    // Also include unstaged working tree changes (for pre-commit review)
    const unstaged = execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf-8' });
    const unstagedFiles = unstaged.trim().split('\n').filter(Boolean)
      .filter(f => !isFixtureOrTest(f) && !isNonSourceFile(f));
    return [...new Set([...sourceFiles, ...stagedFiles, ...unstagedFiles])];
  }
  return [...new Set(sourceFiles)];
}

function getChangedLineRanges(root: string, file: string, ref: string, base?: string): Array<[number, number]> {
  try {
    const diffTarget = base ? `${base}...${ref}` : ref;
    const output = execFileSync(
      'git', ['diff', '--unified=0', diffTarget, '--', file],
      { cwd: root, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );
    const ranges: Array<[number, number]> = [];
    const re = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      const start = parseInt(m[1], 10);
      const count = m[2] ? parseInt(m[2], 10) : 1;
      ranges.push([start, start + count - 1]);
    }
    return ranges;
  } catch {
    return [];
  }
}

/**
 * Fix 1+2: Get file content at a specific git commit.
 */
function gitShow(root: string, commit: string, file: string): string {
  try {
    return execFileSync('git', ['show', `${commit}:${file}`], {
      cwd: root, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

/**
 * Fix 1+2: Extract symbol names from source code using language-aware regex.
 * Returns a Set of {name, kind} strings like "function:greet", "class:User".
 */
function extractSymbolNames(source: string, file: string): Set<string> {
  const names = new Set<string>();
  const ext = file.split('.').pop()?.toLowerCase();

  // TypeScript / JavaScript
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'vue') {
    const re = /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1] === 'function' || m[1] === 'class' || m[1] === 'const' || m[1] === 'let') continue;
      names.add(m[1]);
    }
    // Vue SFC: also match template-level symbols
    // (already covered by TS patterns for <script> blocks)
  }

  // Python
  else if (ext === 'py') {
    const re = /^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      names.add(m[1] || m[2]);
    }
  }

  // Ruby
  else if (ext === 'rb' || ext === 'rake') {
    // class/module/def
    const re = /^\s*(?:class|module)\s+(\w+)|^\s*def\s+(?:self\.)?(\w+[?!]?)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      names.add(m[1] || m[2]);
    }
  }

  // Go
  else if (ext === 'go') {
    const re = /^\s*(?:func|type)\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1] !== 'func' && m[1] !== 'type') names.add(m[1]);
    }
  }

  // Rust
  else if (ext === 'rs') {
    const re = /^\s*(?:pub\s+)?(?:fn|struct|enum|trait|impl)\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      names.add(m[1]);
    }
  }

  // Java / PHP
  else if (ext === 'java' || ext === 'php') {
    const re = /^\s*(?:public|private|protected|static)?\s*(?:class|interface|enum)\s+(\w+)|function\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      names.add(m[1] || m[2]);
    }
  }

  // CSS
  else if (ext === 'css') {
    const classRe = /\.([a-zA-Z_][\w-]*)\s*[{,\s]/g;
    const idRe = /#([a-zA-Z_][\w-]*)\s*[{,\s]/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(source)) !== null) names.add(`.${m[1]}`);
    while ((m = idRe.exec(source)) !== null) names.add(`#${m[1]}`);
  }

  // HTML
  else if (ext === 'html' || ext === 'htm') {
    const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = idRe.exec(source)) !== null) names.add(m[1]);
  }

  return names;
}

/**
 * Fix 1+2: For historical mode, diff symbol names between two commits using git show.
 * Returns Set of symbol names that were added, removed, or modified.
 */
function getChangedSymbolNames(root: string, file: string, base: string, ref: string): { names: Set<string>; isNewFile: boolean } {
  try {
    const oldSource = gitShow(root, base, file);
    const newSource = gitShow(root, ref, file);

    // File doesn't exist in base → entirely new → all symbols are "changed"
    if (!oldSource && newSource) {
      const names = extractSymbolNames(newSource, file);
      return { names, isNewFile: true };
    }

    // File doesn't exist in ref → deleted → all symbols were removed
    if (oldSource && !newSource) {
      const names = extractSymbolNames(oldSource, file);
      return { names, isNewFile: true };
    }

    if (!oldSource || !newSource) return { names: new Set(), isNewFile: false };

    const oldNames = extractSymbolNames(oldSource, file);
    const newNames = extractSymbolNames(newSource, file);

    const changed = new Set<string>();
    for (const n of newNames) if (!oldNames.has(n)) changed.add(n);
    for (const n of oldNames) if (!newNames.has(n)) changed.add(n);
    return { names: changed, isNewFile: false };
  } catch {
    return { names: new Set(), isNewFile: false };
  }
}

// ── Test coverage ──

function isSymbolTested(db: Database, sym: CodeSymbol): boolean {
  const incoming = db.getIncomingLinks(sym.id);
  const directlyTested = incoming.some(l => {
    const from = db.findSymbolById(l.fromId);
    return from && isTestFile(from.filePath);
  });
  if (directlyTested) return true;

  // Fix 4: Indirect coverage via parent function
  if (!sym.exported && sym.parentId) {
    const parentSym = db.findSymbolById(sym.parentId);
    if (parentSym && isSymbolTested(db, parentSym)) return true;
  }
  return false;
}

// ── Main ──

export function reviewPr(db: Database, root: string, ref = 'HEAD', base?: string): ReviewResult {
  let changedFiles: string[];
  try {
    changedFiles = getChangedFiles(root, ref, base);
  } catch {
    return { risk: 'LOW', score: 0, changedFiles: [], symbols: [],
      hotspots: [], untestedChanges: 0,
      summary: 'Not a git repository or git not available.' };
  }

  if (changedFiles.length === 0) {
    return { risk: 'LOW', score: 0, changedFiles: [], symbols: [],
      hotspots: [], untestedChanges: 0,
      summary: 'No changed files detected.' };
  }

  const symbolRisks: SymbolRisk[] = [];
  let untestedChanges = 0;

  for (const file of changedFiles) {
    if (isTestFile(file)) continue;
    if (isFixtureOrTest(file)) continue;
    if (isNonSourceFile(file)) continue;

    const syms = db.getSymbolsByFile(file);

    // Determine which symbols changed
    let changedNames: Set<string> | null = null;
    const isHistorical = !!base;

    if (isHistorical) {
      // Fix 1+2: Historical mode — diff symbol names between commits via git show
      const result = getChangedSymbolNames(root, file, base!, ref);
      changedNames = result.names;
      // If file is entirely new or deleted, include ALL symbols from that file
      if (result.isNewFile && changedNames.size === 0) {
        // getAll symbols — fallback: regex couldn't extract names, include all
        changedNames = null;
      }
    } else {
      // Fix 1: Working tree mode — line overlap filter
      const changedRanges = getChangedLineRanges(root, file, ref);
      if (changedRanges.length > 0) {
        changedNames = new Set(
          syms
            .filter(s => changedRanges.some(([rStart, rEnd]) => s.startLine <= rEnd && s.endLine >= rStart))
            .map(s => s.name)
        );
      }
      // If no ranges, changedNames stays null → include all symbols (conservative fallback)
    }

    for (const sym of syms) {
      if (sym.kind === 'module') continue;

      // Fix 1+2: Only include symbols whose name is in the changed set
      if (changedNames !== null && !changedNames.has(sym.name)) continue;

      const dependents = countDependentFiles(db, sym.id).count;
      const tested = isSymbolTested(db, sym);
      if (!tested && sym.exported) untestedChanges++;

      const { score, reasons } = scoreSymbolRisk(sym, dependents, tested);
      const riskLevel = classifyRisk(score, !tested && sym.exported, sym.role === 'hub' && !tested && dependents > 10);

      symbolRisks.push({ symbol: sym, dependents, tested, riskScore: score, riskLevel, reasons });
    }
  }

  // Fix 4: Cross-file impact — flag callers of changed high-risk symbols
  const changedIds = new Set(symbolRisks.map(s => s.symbol.id));
  const impactRisks: SymbolRisk[] = [];
  for (const sr of symbolRisks) {
    if (sr.riskLevel === 'HIGH' || sr.riskLevel === 'CRITICAL') {
      // Find downstream callers (who depends on this changed symbol?)
      const downstream = db.findUpstream(sr.symbol.id, 2);
      for (const ds of downstream) {
        const dsSym = ds.symbol;
        if (dsSym && !changedIds.has(dsSym.id) && !isFixtureOrTest(dsSym.filePath)) {
            const dsTested = isSymbolTested(db, dsSym);
            const dsDependents = countDependentFiles(db, dsSym.id).count;
            const { score, reasons } = scoreSymbolRisk(dsSym, dsDependents, dsTested);
            reasons.unshift(`impacted by change to ${sr.symbol.name}`);
            const riskLevel = classifyRisk(score, !dsTested && dsSym.exported, false);
            impactRisks.push({ symbol: dsSym, dependents: dsDependents, tested: dsTested,
              riskScore: score, riskLevel, reasons });
            changedIds.add(dsSym.id);
          }
      }
    }
  }
  symbolRisks.push(...impactRisks);

  symbolRisks.sort((a, b) => b.riskScore - a.riskScore);

  const totalScore = symbolRisks.reduce((sum, s) => sum + s.riskScore, 0);
  const hotspots = symbolRisks.filter(s => s.riskLevel === 'HIGH' || s.riskLevel === 'CRITICAL');
  const hasCriticalHub = symbolRisks.some(s => s.symbol.role === 'hub' && !s.tested && s.dependents > 10);
  const overallRisk = classifyRisk(totalScore, untestedChanges > 0, hasCriticalHub);

  const summaryParts = [
    `${changedFiles.length} files changed, ${symbolRisks.length} symbols affected`,
  ];
  if (hotspots.length > 0) summaryParts.push(`${hotspots.length} hotspots`);
  if (untestedChanges > 0) summaryParts.push(`${untestedChanges} untested`);
  summaryParts.push(`overall risk: ${overallRisk} (score: ${totalScore})`);

  return { risk: overallRisk, score: totalScore, changedFiles, symbols: symbolRisks,
    hotspots, untestedChanges, summary: summaryParts.join(', ') };
}

export function reviewSymbol(db: Database, name: string): SymbolRisk | null {
  const syms = db.findSymbolByName(name);
  if (syms.length === 0) return null;

  const sym = syms[0];
  const dependents = countDependentFiles(db, sym.id).count;
  const tested = isSymbolTested(db, sym);
  const { score, reasons } = scoreSymbolRisk(sym, dependents, tested);
  const riskLevel = classifyRisk(score, !tested && sym.exported, sym.role === 'hub' && !tested && dependents > 10);

  return { symbol: sym, dependents, tested, riskScore: score, riskLevel, reasons };
}
