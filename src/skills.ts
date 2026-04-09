import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export function generateSkills(db: Database, rootDir: string, editors?: string[]): SkillsResult {
  const all = !editors; // undefined = all editors
  const has = (name: string) => all || editors!.includes(name);

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
  const agentsDir = join(rootDir, '.agents', 'skills');
  const milensDir = join(rootDir, '.milens', 'skills');

  const activeDirs: string[] = [];
  if (has('copilot')) { mkdirSync(copilotDir, { recursive: true }); activeDirs.push(copilotDir); }
  if (has('cursor'))  { mkdirSync(cursorDir, { recursive: true });  activeDirs.push(cursorDir); }
  if (has('claude'))  { mkdirSync(claudeDir, { recursive: true });  activeDirs.push(claudeDir); }
  if (has('agents'))  { mkdirSync(agentsDir, { recursive: true });  activeDirs.push(agentsDir); }
  // milens internal always generated
  mkdirSync(milensDir, { recursive: true });
  activeDirs.push(milensDir);

  let count = 0;
  for (const [areaName, area] of filtered) {
    const content = renderSkillContent(areaName, area, incomingCount, crossArea);

    if (has('copilot')) {
      writeFileSync(join(copilotDir, `${areaName}.instructions.md`), renderCopilot(area, content));
    }

    if (has('cursor')) {
      writeFileSync(join(cursorDir, `${areaName}.mdc`), renderCursor(area, content));
    }

    if (has('claude')) {
      const claudeAreaDir = join(claudeDir, areaName);
      mkdirSync(claudeAreaDir, { recursive: true });
      writeFileSync(join(claudeAreaDir, 'SKILL.md'), content);
    }

    if (has('agents')) {
      const agentsAreaDir = join(agentsDir, areaName);
      mkdirSync(agentsAreaDir, { recursive: true });
      writeFileSync(join(agentsAreaDir, 'SKILL.md'), renderAgentSkill(areaName, content));
    }

    // milens reference always generated
    writeFileSync(join(milensDir, `${areaName}.md`), content);

    count++;
  }

  // Generate milens MCP tool instructions
  const allFiles = new Set<string>();
  for (const sym of symbols) allFiles.add(sym.filePath);
  const stats = { symbols: symbols.length, links: links.length, files: allFiles.size };
  const areaNames = [...filtered].map(([name]) => name);
  generateToolInstructions(rootDir, copilotDir, cursorDir, claudeDir, agentsDir, stats, areaNames, has);

  return { count, dirs: activeDirs };
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

function renderAgentSkill(areaName: string, content: string): string {
  return `---\nname: milens-${areaName}\ndescription: Code intelligence for the ${areaName} area — symbols, dependencies, and entry points\n---\n\n${content}`;
}

// ── Milens MCP tool instructions (injected per-editor) ──

function renderMilensInstructions(rootDir: string, stats: { symbols: number; links: number; files: number }, areaNames: string[]): string {
  const t = (name: string) => `mcp_milens_${name}`;
  const repo = `repo: "${rootDir}"`;

  const skillsRows = areaNames.map(a =>
    `| Work in the ${capitalize(a)} area | \`.agents/skills/${a}/SKILL.md\` |`
  ).join('\n');

  return `<!-- milens:start -->
# Milens — Code Intelligence (MCP)

This project is indexed by milens (${stats.symbols} symbols, ${stats.links} links, ${stats.files} files). Use the milens MCP tools (\`mcp_milens_*\`) to understand code, assess impact, and navigate safely.

> **CRITICAL:** All milens MCP tool calls MUST include \`${repo}\` — without it, the tools will fail with "No index" error.

> If any milens tool warns the index is stale, run \`npx milens analyze -p . --force\` in the project root.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run \`${t('impact')}({target: "symbolName", ${repo}})\` and report the blast radius to the user.
- **MUST run \`${t('detect_changes')}({${repo}})\` before committing** to verify changes only affect expected symbols.
- **MUST warn the user** if impact analysis shows many upstream dependents before proceeding with edits.
- When exploring unfamiliar code, use \`${t('query')}\` to find symbol definitions and \`${t('grep')}\` for all text references.
- When you need full context on a specific symbol — callers, callees, parent, children — use \`${t('context')}({name: "symbolName", ${repo}})\`.

## When Debugging

1. \`${t('query')}({query: "<error or symptom>", ${repo}})\` — find symbols related to the issue
2. \`${t('context')}({name: "<suspect function>", ${repo}})\` — see all callers, callees, and hierarchy
3. \`${t('grep')}({pattern: "<error message>", ${repo}})\` — find every text occurrence across all files
4. \`${t('explain_relationship')}({from: "A", to: "B", ${repo}})\` — trace how two symbols connect

## When Refactoring

- **Before editing**: MUST run \`${t('context')}\` to see all incoming/outgoing refs, then \`${t('impact')}\` to find all upstream dependents.
- **When deleting features**: MUST use \`${t('grep')}\` first to find ALL text references (templates, configs, routes, docs), then \`${t('impact')}\` for the dependency graph. Combine both — \`grep\` catches what \`impact\` misses.
- **After any refactor**: run \`${t('detect_changes')}({${repo}})\` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running \`${t('impact')}\` on it.
- NEVER ignore warnings when impact analysis shows many upstream dependents.
- NEVER delete or rename symbols without running both \`${t('grep')}\` and \`${t('impact')}\`.
- NEVER commit changes without running \`${t('detect_changes')}()\` to check affected scope.
- NEVER call milens MCP tools without the \`repo\` parameter.

## Tools Quick Reference

| Tool | When to use | Example |
|------|-------------|---------|
| \`${t('query')}\` | Find symbols by name/concept | \`${t('query')}({query: "auth validation", ${repo}})\` |
| \`${t('context')}\` | 360° view of one symbol | \`${t('context')}({name: "UserService", ${repo}})\` |
| \`${t('impact')}\` | Blast radius before editing | \`${t('impact')}({target: "X", direction: "upstream", ${repo}})\` |
| \`${t('grep')}\` | Text search ALL files (templates, SCSS, configs) | \`${t('grep')}({pattern: "route name", ${repo}})\` |
| \`${t('detect_changes')}\` | Pre-commit scope check | \`${t('detect_changes')}({${repo}})\` |
| \`${t('explain_relationship')}\` | How two symbols connect | \`${t('explain_relationship')}({from: "A", to: "B", ${repo}})\` |
| \`${t('get_file_symbols')}\` | All symbols in a file | \`${t('get_file_symbols')}({file: "path/to/file", ${repo}})\` |
| \`${t('get_type_hierarchy')}\` | Class inheritance tree | \`${t('get_type_hierarchy')}({name: "ClassName", ${repo}})\` |
| \`${t('find_dead_code')}\` | Unused exported symbols | \`${t('find_dead_code')}({${repo}})\` |
| \`${t('status')}\` | Check index health | \`${t('status')}({${repo}})\` |

## \`query\` vs \`grep\` — When to Use Which

| Scenario | Use \`query\` | Use \`grep\` |
|----------|-------------|------------|
| Find function/class definitions | ✅ | |
| Find references in templates/views | | ✅ |
| Find route definitions in configs | | ✅ |
| Find text in comments/docs | | ✅ |
| Find symbol by concept/name | ✅ | |
| Find every text occurrence | | ✅ |
| Deleting a feature | ✅ + ✅ | ✅ + ✅ |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. \`${t('impact')}\` was run for all modified symbols
2. No warnings about many upstream dependents were ignored
3. \`${t('detect_changes')}()\` confirms changes match expected scope
4. All direct dependents (d=1) were updated

## Keeping the Index Fresh

After significant code changes, re-index:

\`\`\`bash
npx milens analyze -p . --force
\`\`\`

## Skills

| Task | Read this skill file |
|------|---------------------|
| General milens tools reference | \`.agents/skills/milens/SKILL.md\` |
${skillsRows}

<!-- milens:end -->`;
}

function generateToolInstructions(
  rootDir: string,
  copilotDir: string,
  cursorDir: string,
  claudeDir: string,
  agentsDir: string,
  stats: { symbols: number; links: number; files: number },
  areaNames: string[],
  has: (name: string) => boolean,
): void {
  const content = renderMilensInstructions(rootDir, stats, areaNames);

  if (has('copilot')) {
    // Copilot: .github/instructions/milens.instructions.md (applyTo: ** → always loaded)
    writeFileSync(
      join(copilotDir, 'milens.instructions.md'),
      `---\napplyTo: "**"\n---\n\n${content}`,
    );

    // Inject into root config that Copilot always reads
    const githubDir = join(rootDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    injectWithMarkers(join(githubDir, 'copilot-instructions.md'), content);
  }

  if (has('cursor')) {
    // Cursor: .cursor/rules/milens.mdc (alwaysApply: true → always loaded)
    writeFileSync(
      join(cursorDir, 'milens.mdc'),
      `---\ndescription: Milens code intelligence MCP tools\nglobs: "**"\nalwaysApply: true\n---\n\n${content}`,
    );

    // Inject into root config that Cursor always reads
    injectWithMarkers(join(rootDir, '.cursorrules'), content);
  }

  if (has('claude')) {
    // Claude: .claude/skills/generated/milens/SKILL.md
    const claudeMilensDir = join(claudeDir, 'milens');
    mkdirSync(claudeMilensDir, { recursive: true });
    writeFileSync(join(claudeMilensDir, 'SKILL.md'), content);

    // Inject into root config that Claude Code always reads
    injectWithMarkers(join(rootDir, 'CLAUDE.md'), content);
  }

  if (has('agents')) {
    // Universal agents: .agents/skills/milens/SKILL.md
    const agentsMilensDir = join(agentsDir, 'milens');
    mkdirSync(agentsMilensDir, { recursive: true });
    writeFileSync(
      join(agentsMilensDir, 'SKILL.md'),
      `---\nname: milens\ndescription: Code intelligence MCP tools — symbol search, text grep, impact analysis, dependency graph\n---\n\n${content}`,
    );

    // Inject into root config for universal agents
    injectWithMarkers(join(rootDir, 'AGENTS.md'), content);
  }
}

/** Inject milens instructions into a file using markers. Creates the file if it doesn't exist. Replaces on re-run. */
function injectWithMarkers(filePath: string, content: string): void {
  const startMarker = '<!-- milens:start -->';
  const endMarker = '<!-- milens:end -->';

  let existing = '';
  try {
    existing = readFileSync(filePath, 'utf-8');
  } catch { /* file doesn't exist */ }

  if (existing.includes(startMarker) && existing.includes(endMarker)) {
    // Replace existing milens section
    const before = existing.slice(0, existing.indexOf(startMarker));
    const after = existing.slice(existing.indexOf(endMarker) + endMarker.length);
    writeFileSync(filePath, `${before}${content}${after}`);
  } else if (existing) {
    // Append to existing file
    writeFileSync(filePath, `${existing}\n\n${content}\n`);
  } else {
    // Create new file
    writeFileSync(filePath, `${content}\n`);
  }
}
