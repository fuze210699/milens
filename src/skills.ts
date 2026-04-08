import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './store/db.js';
import type { CodeSymbol, SymbolLink } from './types.js';

interface AreaInfo {
  name: string;
  prefix: string;
  files: Set<string>;
  symbols: CodeSymbol[];
  exported: CodeSymbol[];
}

interface SkillsResult {
  count: number;
  dirs: string[];
}

export function generateSkills(db: Database, rootDir: string): SkillsResult {
  const symbols = db.getAllSymbols();
  const links = db.getAllLinks();

  const symbolMap = new Map<string, CodeSymbol>();
  for (const sym of symbols) symbolMap.set(sym.id, sym);

  const areas = groupByArea(symbols);

  const incomingCount = new Map<string, number>();
  for (const link of links) {
    if (link.type === 'contains') continue;
    incomingCount.set(link.toId, (incomingCount.get(link.toId) ?? 0) + 1);
  }

  const crossArea = buildCrossAreaLinks(links, symbolMap);

  const filtered = [...areas].filter(([, a]) => a.symbols.length >= 2);

  // Output directories for each editor
  const copilotDir = join(rootDir, '.github', 'instructions');
  const cursorDir = join(rootDir, '.cursor', 'rules');
  const claudeDir = join(rootDir, '.claude', 'skills', 'generated');
  const milensDir = join(rootDir, '.milens', 'skills');

  for (const dir of [copilotDir, cursorDir, claudeDir, milensDir]) {
    mkdirSync(dir, { recursive: true });
  }

  let count = 0;
  for (const [areaName, area] of filtered) {
    const content = renderSkillContent(areaName, area, incomingCount, crossArea);

    // Copilot: .github/instructions/{area}.instructions.md
    writeFileSync(join(copilotDir, `${areaName}.instructions.md`), renderCopilot(area, content));

    // Cursor: .cursor/rules/{area}.mdc
    writeFileSync(join(cursorDir, `${areaName}.mdc`), renderCursor(area, content));

    // Claude: .claude/skills/generated/{area}/SKILL.md
    const claudeAreaDir = join(claudeDir, areaName);
    mkdirSync(claudeAreaDir, { recursive: true });
    writeFileSync(join(claudeAreaDir, 'SKILL.md'), content);

    // milens reference: .milens/skills/{area}.md
    writeFileSync(join(milensDir, `${areaName}.md`), content);

    count++;
  }

  return { count, dirs: [copilotDir, cursorDir, claudeDir, milensDir] };
}

function getAreaName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length <= 1) return 'root';
  if (parts[0] === 'src') {
    return parts.length > 2 ? parts[1] : 'root';
  }
  return parts[0];
}

function getAreaPrefix(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length <= 1) return '';
  if (parts[0] === 'src' && parts.length > 2) return `src/${parts[1]}`;
  return parts[0];
}

function groupByArea(symbols: CodeSymbol[]): Map<string, AreaInfo> {
  const areas = new Map<string, AreaInfo>();
  for (const sym of symbols) {
    const name = getAreaName(sym.filePath);
    if (!areas.has(name)) {
      areas.set(name, {
        name,
        prefix: getAreaPrefix(sym.filePath),
        files: new Set(),
        symbols: [],
        exported: [],
      });
    }
    const area = areas.get(name)!;
    area.files.add(sym.filePath);
    area.symbols.push(sym);
    if (sym.exported) area.exported.push(sym);
  }
  return areas;
}

function buildCrossAreaLinks(
  links: SymbolLink[],
  symbolMap: Map<string, CodeSymbol>,
): { deps: Map<string, Map<string, Set<string>>>; usedBy: Map<string, Map<string, Set<string>>> } {
  const deps = new Map<string, Map<string, Set<string>>>();
  const usedBy = new Map<string, Map<string, Set<string>>>();

  for (const link of links) {
    if (link.type === 'contains') continue;
    const from = symbolMap.get(link.fromId);
    const to = symbolMap.get(link.toId);
    if (!from || !to) continue;

    const fromArea = getAreaName(from.filePath);
    const toArea = getAreaName(to.filePath);
    if (fromArea === toArea) continue;

    if (!deps.has(fromArea)) deps.set(fromArea, new Map());
    if (!deps.get(fromArea)!.has(toArea)) deps.get(fromArea)!.set(toArea, new Set());
    deps.get(fromArea)!.get(toArea)!.add(to.name);

    if (!usedBy.has(toArea)) usedBy.set(toArea, new Map());
    if (!usedBy.get(toArea)!.has(fromArea)) usedBy.get(toArea)!.set(fromArea, new Set());
    usedBy.get(toArea)!.get(fromArea)!.add(to.name);
  }

  return { deps, usedBy };
}

function renderSkillContent(
  areaName: string,
  area: AreaInfo,
  incomingCount: Map<string, number>,
  crossArea: { deps: Map<string, Map<string, Set<string>>>; usedBy: Map<string, Map<string, Set<string>>> },
): string {
  const lines: string[] = [];

  lines.push(`# ${capitalize(areaName)}`);
  lines.push('');

  lines.push('## Overview');
  lines.push(`Contains ${area.symbols.length} symbols (${area.exported.length} exported) across ${area.files.size} files.`);
  lines.push('');

  if (area.exported.length > 0) {
    const sorted = [...area.exported]
      .map(s => ({ sym: s, refs: incomingCount.get(s.id) ?? 0 }))
      .sort((a, b) => b.refs - a.refs)
      .slice(0, 15);
    lines.push('## Key Symbols');
    for (const { sym, refs } of sorted) {
      const sig = sym.signature ? ` — \`${sym.signature}\`` : '';
      lines.push(`- **\`${sym.name}\`** [${sym.kind}]${sig} (${sym.filePath}:${sym.startLine}) — ${refs} refs`);
    }
    lines.push('');
  }

  const entryPoints = area.symbols
    .map(s => ({ sym: s, refs: incomingCount.get(s.id) ?? 0 }))
    .filter(e => e.refs > 0)
    .sort((a, b) => b.refs - a.refs)
    .slice(0, 5);
  if (entryPoints.length > 0) {
    lines.push('## Entry Points');
    for (const { sym, refs } of entryPoints) {
      lines.push(`- **\`${sym.name}\`** [${sym.kind}] — ${refs} incoming references`);
    }
    lines.push('');
  }

  const areaDeps = crossArea.deps.get(areaName);
  if (areaDeps && areaDeps.size > 0) {
    lines.push('## Dependencies');
    for (const [other, names] of areaDeps) {
      const list = [...names].slice(0, 8).join('`, `');
      const more = names.size > 8 ? ` (+${names.size - 8} more)` : '';
      lines.push(`- **${other}**: \`${list}\`${more}`);
    }
    lines.push('');
  }

  const areaUsedBy = crossArea.usedBy.get(areaName);
  if (areaUsedBy && areaUsedBy.size > 0) {
    lines.push('## Used By');
    for (const [other, names] of areaUsedBy) {
      const list = [...names].slice(0, 8).join('`, `');
      const more = names.size > 8 ? ` (+${names.size - 8} more)` : '';
      lines.push(`- **${other}**: \`${list}\`${more}`);
    }
    lines.push('');
  }

  lines.push('## Files');
  for (const f of [...area.files].sort()) {
    lines.push(`- ${f}`);
  }
  lines.push('');

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderCopilot(area: AreaInfo, content: string): string {
  if (!area.prefix) return content;
  return `---\napplyTo: "${area.prefix}/**"\n---\n\n${content}`;
}

function renderCursor(area: AreaInfo, content: string): string {
  const glob = area.prefix ? `${area.prefix}/**` : '**';
  return `---\ndescription: Code intelligence for ${area.name} area\nglobs: ${glob}\nalwaysApply: false\n---\n\n${content}`;
}
