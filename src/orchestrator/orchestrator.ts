import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Database } from '../store/db.js';
import { reviewPr } from '../analyzer/review.js';
import type { ReviewResult } from '../analyzer/review.js';
import type { CodeSymbol } from '../types.js';
import { formatReport, type OrchestratorReport, type ReportOptions } from './reporter.js';

function getGitChangedFiles(rootPath: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: rootPath, encoding: 'utf-8' });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: rootPath, encoding: 'utf-8' });
    return [...new Set([...output.trim().split('\n'), ...staged.trim().split('\n')])].filter(Boolean);
  } catch {
    return [];
  }
}

export interface OrchestratorConfig {
  rootPath: string;
  dbPath: string;
  debounceMs?: number;
  maxIterations?: number;
  useEmoji?: boolean;
}

export interface ImpactSnapshot {
  target: string;
  timestamp: string;
  dependents: Array<{ id: string; name: string; filePath: string }>;
  heatScore: number;
}

export interface ImpactDiff {
  target: string;
  before: ImpactSnapshot | null;
  after: ImpactSnapshot;
  newDependents: Array<{ id: string; name: string; filePath: string }>;
  removedDependents: Array<{ id: string; name: string; filePath: string }>;
  heatChanged: boolean;
  heatBefore: number | null;
  heatAfter: number;
}

export class Orchestrator {
  private config: Required<OrchestratorConfig>;
  private cycleNumber = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private changedFiles = new Set<string>();
  private snapshots = new Map<string, ImpactSnapshot>();

  constructor(config: OrchestratorConfig) {
    this.config = {
      debounceMs: 2000,
      maxIterations: 3,
      useEmoji: false,
      ...config,
    };
  }

  /** Notify orchestrator that a file changed */
  subscribe(filePath: string): void {
    this.changedFiles.add(filePath);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), this.config.debounceMs);
  }

  /** Take impact snapshot before a symbol is edited */
  snapshot(symbolName: string, db: Database): ImpactSnapshot {
    const syms = db.findSymbolByName(symbolName);
    if (!syms || syms.length === 0) throw new Error(`Symbol not found: ${symbolName}`);
    const sym = syms[0];

    const upstream = db.findUpstream(sym.id, 1);
    const snapshot: ImpactSnapshot = {
      target: symbolName,
      timestamp: new Date().toISOString(),
      dependents: upstream.map(u => ({ id: u.symbol.id, name: u.symbol.name, filePath: u.symbol.filePath })),
      heatScore: sym.heat ?? 0,
    };

    this.snapshots.set(symbolName, snapshot);
    return snapshot;
  }

  /** Compare current impact to a previous snapshot */
  compare(symbolName: string, db: Database): ImpactDiff {
    const before = this.snapshots.get(symbolName) ?? null;
    const syms = db.findSymbolByName(symbolName);
    if (!syms || syms.length === 0) throw new Error(`Symbol not found: ${symbolName}`);
    const sym = syms[0];

    const upstream = db.findUpstream(sym.id, 1);
    const after: ImpactSnapshot = {
      target: symbolName,
      timestamp: new Date().toISOString(),
      dependents: upstream.map(u => ({ id: u.symbol.id, name: u.symbol.name, filePath: u.symbol.filePath })),
      heatScore: sym.heat ?? 0,
    };

    if (!before) return { target: symbolName, before: null, after, newDependents: [], removedDependents: [], heatChanged: false, heatBefore: null, heatAfter: after.heatScore };

    const beforeIds = new Set(before.dependents.map(d => d.id));
    const afterIds = new Set(after.dependents.map(d => d.id));

    const newDependents = after.dependents.filter(d => !beforeIds.has(d.id));
    const removedDependents = before.dependents.filter(d => !afterIds.has(d.id));

    return {
      target: symbolName,
      before,
      after,
      newDependents,
      removedDependents,
      heatChanged: before.heatScore !== after.heatScore,
      heatBefore: before.heatScore,
      heatAfter: after.heatScore,
    };
  }

  /** Run the full review cycle */
  async run(): Promise<OrchestratorReport> {
    this.cycleNumber++;
    const t0 = Date.now();
    let files = [...this.changedFiles];
    this.changedFiles.clear();

    // Fallback: when called from MCP tool (not live-watcher), compute from git diff
    if (files.length === 0) {
      files = getGitChangedFiles(this.config.rootPath);
    }

    if (files.length === 0) {
      return { cycleNumber: this.cycleNumber, changedFiles: [], review: createEmptyReview(), coverageGaps: [], deadSymbols: [], durationMs: 0 };
    }

    const db = new Database(this.config.dbPath);

    try {
      const review = reviewPr(db, this.config.rootPath);
      const coverageGaps = db.getTestCoverageGaps(10);
      const deadSymbols = db.findDeadCode(undefined, 10);

      return {
        cycleNumber: this.cycleNumber,
        changedFiles: files,
        review,
        coverageGaps,
        deadSymbols,
        durationMs: Date.now() - t0,
      };
    } finally {
      db.close();
    }
  }

  /** Run pipeline and format as string */
  async runAndFormat(opts?: ReportOptions): Promise<string> {
    const report = await this.run();
    return formatReport(report, opts ?? { useEmoji: this.config.useEmoji });
  }

  /** Get current cycle number */
  get cycle(): number {
    return this.cycleNumber;
  }

  /** Cancel pending debounce */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.changedFiles.clear();
  }

  /** Persist all in-memory snapshots to .milens/snapshots/ */
  persistSnapshots(): string {
    const dir = join(this.config.rootPath, '.milens', 'snapshots');
    mkdirSync(dir, { recursive: true });
    let count = 0;
    for (const [name, snap] of this.snapshots) {
      const fileName = `snapshot_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
      writeFileSync(join(dir, fileName), JSON.stringify(snap, null, 2), 'utf-8');
      count++;
    }
    this.cleanupOldSnapshots(dir, 10);
    return join(dir);
  }

  /** Load all snapshots from disk into memory */
  loadSnapshots(): number {
    const dir = join(this.config.rootPath, '.milens', 'snapshots');
    if (!existsSync(dir)) return 0;
    let count = 0;
    try {
      const files = readdirSync(dir).filter(f => f.startsWith('snapshot_') && f.endsWith('.json'));
      for (const file of files) {
        try {
          const snap = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as ImpactSnapshot;
          this.snapshots.set(snap.target, snap);
          count++;
        } catch {}
      }
    } catch {}
    return count;
  }

  private cleanupOldSnapshots(dir: string, keep: number): void {
    try {
      const files = readdirSync(dir)
        .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
        .sort()
        .reverse();
      for (let i = keep; i < files.length; i++) {
        try { unlinkSync(join(dir, files[i])); } catch {}
      }
    } catch {}
  }
}

function createEmptyReview(): ReviewResult {
  return {
    risk: 'LOW',
    score: 0,
    changedFiles: [],
    symbols: [],
    hotspots: [],
    untestedChanges: 0,
    summary: 'No changes detected',
  };
}
