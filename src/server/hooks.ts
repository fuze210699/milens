import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface HookConfig {
  enabled: boolean;
  onSessionStart: boolean;
  onSessionEnd: boolean;
  onFileChange: boolean;
  onPreCommit: boolean;
  onPreCompact: boolean;
  onPostCompact: boolean;
}

export interface SessionContext {
  agent: string;
  sessionId: string;
  rootPath: string;
}

function defaultConfig(): HookConfig {
  return {
    enabled: true,
    onSessionStart: true,
    onSessionEnd: true,
    onFileChange: true,
    onPreCommit: true,
    onPreCompact: true,
    onPostCompact: true,
  };
}

const HOOK_KEYS: (keyof HookConfig)[] = [
  'enabled',
  'onSessionStart',
  'onSessionEnd',
  'onFileChange',
  'onPreCommit',
  'onPreCompact',
  'onPostCompact',
];

export class HookManager {
  static defaultConfigPath(): string {
    return join(homedir(), '.milens', 'hooks.json');
  }

  getProjectConfigPath(projectPath: string): string {
    return join(projectPath, '.milens', 'hooks.json');
  }

  loadConfig(projectPath?: string): HookConfig {
    const configPath = projectPath
      ? this.getProjectConfigPath(projectPath)
      : HookManager.defaultConfigPath();

    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const cfg = defaultConfig();
      for (const key of HOOK_KEYS) {
        if (typeof (parsed as any)[key] === 'boolean') {
          (cfg as any)[key] = (parsed as any)[key];
        }
      }
      return cfg;
    } catch {
      return defaultConfig();
    }
  }

  saveConfig(config: HookConfig, projectPath?: string): void {
    const configPath = projectPath
      ? this.getProjectConfigPath(projectPath)
      : HookManager.defaultConfigPath();

    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  enableHook(hookName: string, projectPath?: string): void {
    if (!HOOK_KEYS.includes(hookName as keyof HookConfig)) {
      throw new Error(`Unknown hook: "${hookName}". Valid: ${HOOK_KEYS.join(', ')}`);
    }
    const config = this.loadConfig(projectPath);
    (config as any)[hookName] = true;
    this.saveConfig(config, projectPath);
  }

  disableHook(hookName: string, projectPath?: string): void {
    if (!HOOK_KEYS.includes(hookName as keyof HookConfig)) {
      throw new Error(`Unknown hook: "${hookName}". Valid: ${HOOK_KEYS.join(', ')}`);
    }
    const config = this.loadConfig(projectPath);
    (config as any)[hookName] = false;
    this.saveConfig(config, projectPath);
  }
}

export async function defaultOnSessionStart(ctx: SessionContext, dbPath: string): Promise<string> {
  const { Database } = await import('../store/db.js');
  const db = new Database(dbPath);

  const summary = db.getCodebaseSummary();

  const lines: string[] = [];
  lines.push('## Codebase Context');
  lines.push('');
  lines.push(
    `**${summary.files} files**, **${summary.symbols} symbols**, **${summary.links}** dependency links`,
  );
  lines.push(
    `Test coverage: **${summary.coveragePct}%** (${summary.testedSymbols}/${summary.exportedSymbols})`,
  );
  lines.push('');

  if (summary.domains.length > 0) {
    lines.push('### Domain Clusters');
    for (const d of summary.domains.slice(0, 8)) {
      lines.push(`- \`${d.domain}\`: ${d.files} files, ${d.symbols} symbols`);
    }
    if (summary.domains.length > 8) {
      lines.push(`- ... and ${summary.domains.length - 8} more`);
    }
    lines.push('');
  }

  if (summary.topHubs.length > 0) {
    lines.push('### Top Hubs');
    for (const h of summary.topHubs.slice(0, 5)) {
      lines.push(
        `- \`${h.name}\` (${h.kind}${h.role ? `, ${h.role}` : ''}, heat: ${h.heat ?? 0}) — \`${h.filePath}\``,
      );
    }
    lines.push('');
  }

  try {
    const { AnnotationStore } = await import('../store/annotations.js');
    const store = new AnnotationStore(db.connection);
    const annotations = store.recall({ limit: 50 });
    if (annotations.length > 0) {
      lines.push('### Critical Annotations');
      const byKey = new Map<string, string[]>();
      for (const a of annotations) {
        const list = byKey.get(a.key) ?? [];
        list.push(a.value);
        byKey.set(a.key, list);
      }
      for (const [key, values] of byKey) {
        lines.push(`- **[${key}]** ${values.slice(0, 3).join('; ')}`);
      }
      lines.push('');
    }
  } catch {
    lines.push('*(annotations unavailable)*');
    lines.push('');
  }

  try {
    const { generateCrossRefSection } = await import('../agents-md.js');
    const crossRef = generateCrossRefSection(ctx.rootPath);
    if (crossRef) {
      lines.push(crossRef);
    }
  } catch {
    // no cross-ref config — skip silently
  }

  db.close();
  return lines.join('\n');
}

export async function defaultOnSessionEnd(ctx: SessionContext, dbPath: string): Promise<string> {
  const { Database } = await import('../store/db.js');
  const db = new Database(dbPath);

  const stats = db.getStats();
  const coverage = db.getTestCoverage();
  const coveragePct =
    coverage.exportedProductionSymbols > 0
      ? Math.round((coverage.testedSymbols / coverage.exportedProductionSymbols) * 100)
      : 0;

  const lines: string[] = [];
  lines.push('## Session End Summary');
  lines.push('');
  lines.push(`Agent: **${ctx.agent}** | Session: \`${ctx.sessionId}\``);
  lines.push('');
  lines.push(`Codebase: ${stats.files} files, ${stats.symbols} symbols, ${stats.links} links`);
  lines.push(`Test coverage: **${coveragePct}%** (${coverage.testedSymbols}/${coverage.exportedProductionSymbols})`);
  lines.push('');

  try {
    const { reviewPr } = await import('../analyzer/review.js');
    const review = reviewPr(db, ctx.rootPath);
    if (review.changedFiles.length > 0) {
      lines.push('### Recent Changes');
      lines.push(`Risk: **${review.risk}** (score: ${review.score}) | ${review.symbols.length} symbols affected`);
      if (review.hotspots.length > 0) {
        for (const h of review.hotspots.slice(0, 5)) {
          lines.push(`- \`${h.symbol.name}\` — **${h.riskLevel}** (${h.reasons.slice(0, 2).join(', ')})`);
        }
      }
      if (review.untestedChanges > 0) {
        lines.push(`  ${review.untestedChanges} untested exported symbol(s) changed`);
      }
      lines.push('');
    }
  } catch {
    lines.push('*(detect_changes unavailable)*');
    lines.push('');
  }

  const deadCode = db.findDeadCode(undefined, 20);
  if (deadCode.length > 0) {
    lines.push(`### Potential Dead Code (${deadCode.length})`);
    for (const s of deadCode.slice(0, 5)) {
      lines.push(`- \`${s.name}\` in \`${s.filePath}\`:${s.startLine}`);
    }
    lines.push('');
  }

  const gaps = db.getTestCoverageGaps(10);
  if (gaps.length > 0) {
    lines.push(`### Coverage Gaps (${gaps.length})`);
    for (const s of gaps.slice(0, 5)) {
      lines.push(`- \`${s.name}\` in \`${s.filePath}\`:${s.startLine} (heat: ${s.heat ?? 0})`);
    }
    lines.push('');
  }

  db.close();
  return lines.join('\n');
}

export async function defaultOnPreCommit(rootPath: string): Promise<string> {
  const dbPath = join(rootPath, '.milens', 'milens.db');

  let db;
  try {
    const { Database } = await import('../store/db.js');
    db = new Database(dbPath);
  } catch {
    return '**SKIP**: No milens database found at `' + join(rootPath, '.milens') + '`. Run `milens analyze` first.';
  }

  try {
    const { reviewPr } = await import('../analyzer/review.js');
    const review = reviewPr(db, rootPath);

    const lines: string[] = [];
    lines.push('## Pre-Commit Risk Report');
    lines.push('');

    if (review.changedFiles.length === 0) {
      lines.push('No changed files detected. Safe to commit.');
      db.close();
      return lines.join('\n');
    }

    lines.push(`Risk: **${review.risk}** (score: ${review.score})`);
    lines.push(
      `${review.changedFiles.length} files changed, ${review.symbols.length} symbols affected`,
    );

    if (review.hotspots.length > 0) {
      lines.push('');
      lines.push('### Hotspots');
      for (const h of review.hotspots) {
        lines.push(
          `- \`${h.symbol.name}\` — risk **${h.riskLevel}** (${h.reasons.join(', ')})`,
        );
      }
    }

    if (review.untestedChanges > 0) {
      lines.push('');
      lines.push(
        `**Warning:** ${review.untestedChanges} untested exported symbol(s) changed`,
      );
    }

    const coverageGaps = db.getTestCoverageGaps(10);
    if (coverageGaps.length > 0) {
      lines.push('');
      lines.push('### Coverage Gaps');
      for (const s of coverageGaps.slice(0, 5)) {
        lines.push(
          `- \`${s.name}\` in \`${s.filePath}\`:${s.startLine} (heat: ${s.heat ?? 0})`,
        );
      }
    }

    const deadCode = db.findDeadCode(undefined, 10);
    if (deadCode.length > 0) {
      lines.push('');
      lines.push('### Potential Dead Code');
      for (const s of deadCode.slice(0, 3)) {
        lines.push(`- \`${s.name}\` in \`${s.filePath}\`:${s.startLine}`);
      }
    }

    lines.push('');
    if (review.risk === 'CRITICAL') {
      lines.push('**STOP** — Critical risk. Review hotspots and add tests before committing.');
    } else if (review.risk === 'HIGH') {
      lines.push('**WARNING** — High risk. Strongly consider adding tests for changed symbols.');
    } else if (review.risk === 'MEDIUM') {
      lines.push('**OK** — Medium risk detected. Proceed with caution.');
    } else {
      lines.push('**GO** — Low risk. Safe to commit.');
    }

    db.close();
    return lines.join('\n');
  } catch (err: any) {
    db.close();
    return `**ERROR**: Pre-commit analysis failed: ${err.message ?? err}`;
  }
}

export async function defaultOnFileChange(files: string[], rootPath: string): Promise<string> {
  const dbPath = join(rootPath, '.milens', 'milens.db');
  try {
    const { Database } = await import('../store/db.js');
    const db = new Database(dbPath);
    try {
      const lines: string[] = [];
      lines.push(`## File Change Detected`);
      lines.push('');
      lines.push(`${files.length} file(s) changed:\n`);
      for (const f of files) {
        const syms = db.getSymbolsByFile(f);
        lines.push(`- ${f}: ${syms.length} symbols`);
      }
      lines.push('');
      lines.push('Run `orchestrate()` or `detect_changes()` for detailed impact analysis.');
      db.close();
      return lines.join('\n');
    } catch (err: any) {
      db.close();
      return `**ERROR**: ${err.message ?? err}`;
    }
  } catch {
    return 'No milens database found.';
  }
}

export async function defaultOnPreCompact(rootPath: string, dbPath: string): Promise<string> {
  try {
    const { Database } = await import('../store/db.js');
    const db = new Database(dbPath);
    try {
      db.snapshotMetrics();
      const stats = db.getStats();
      db.close();
      return `Pre-compact snapshot saved. Codebase: ${stats.files} files, ${stats.symbols} symbols, ${stats.links} links.`;
    } catch {
      db.close();
      return 'Pre-compact snapshot failed.';
    }
  } catch {
    return 'No milens database found.';
  }
}

export async function defaultOnPostCompact(rootPath: string): Promise<string> {
  const dbPath = join(rootPath, '.milens', 'milens.db');
  try {
    const { Database } = await import('../store/db.js');
    const db = new Database(dbPath);
    try {
      const { AnnotationStore } = await import('../store/annotations.js');
      const store = new AnnotationStore(db.connection);
      const anns = store.recall({ limit: 20 });
      const lines: string[] = ['## Context Restored (Post-Compaction)'];
      lines.push('');
      if (anns.length > 0) {
        lines.push(`Recalled ${anns.length} key annotations:`);
        for (const a of anns) {
          lines.push(`- [${a.key}] ${a.symbol}: ${a.value.slice(0, 80)}`);
        }
      } else {
        lines.push('No annotations to restore context.');
      }
      db.close();
      return lines.join('\n');
    } catch {
      db.close();
      return 'Context restore failed.';
    }
  } catch {
    return 'No milens database found.';
  }
}
