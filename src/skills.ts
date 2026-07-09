import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// Top-level dirs where milens writes its own generated skills/rules/instructions.
// Their markdown is intentionally indexed (so grep/docs tooling can find it), but
// they must never be treated as a code "domain" themselves — doing so makes each
// `analyze --force --skills` run regenerate skill files *for its own output*,
// which then get indexed on the next run and regenerated again.
const MILENS_META_DIRS = new Set(['.agents', '.claude', '.github', '.cursor', '.vscode', '.gemini', '.codex', '.zed', '.windsurf']);

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

  const filtered = [...areas].filter(([name, a]) => a.symbols.length >= 2 && !MILENS_META_DIRS.has(name));

  // Output directories for each editor
  const copilotDir = join(rootDir, '.github', 'instructions');
  const cursorDir = join(rootDir, '.cursor', 'rules');
  const claudeDir = join(rootDir, '.claude', 'skills', 'generated');
  const claudeRulesDir = join(rootDir, '.claude', 'rules');
  const agentsDir = join(rootDir, '.agents', 'skills');

  const activeDirs: string[] = [];
  if (has('copilot'))  { mkdirSync(copilotDir, { recursive: true }); activeDirs.push(copilotDir); }
  if (has('cursor'))   { mkdirSync(cursorDir, { recursive: true });  activeDirs.push(cursorDir); }
  if (has('claude'))   { mkdirSync(claudeDir, { recursive: true }); mkdirSync(claudeRulesDir, { recursive: true }); activeDirs.push(claudeDir); }
  if (has('agents'))   { mkdirSync(agentsDir, { recursive: true });  activeDirs.push(agentsDir); }

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

      // Also generate path-scoped rule (loaded when Claude reads matching files)
      if (area.prefix) {
        writeFileSync(
          join(claudeRulesDir, `${areaName}.md`),
          `---\npaths:\n  - "${area.prefix}/**"\n---\n\n${content}`,
        );
      }
    }

    if (has('agents')) {
      const agentsAreaDir = join(agentsDir, areaName);
      mkdirSync(agentsAreaDir, { recursive: true });
      writeFileSync(join(agentsAreaDir, 'SKILL.md'), renderAgentSkill(areaName, content));
    }

    count++;
  }

  // Generate milens MCP tool instructions
  const allFiles = new Set<string>();
  for (const sym of symbols) allFiles.add(sym.filePath);
  const stats = { symbols: symbols.length, links: links.length, files: allFiles.size };
  const areaNames = [...filtered].map(([name]) => name);
  generateToolInstructions(rootDir, copilotDir, cursorDir, claudeDir, claudeRulesDir, agentsDir, stats, areaNames, has);

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

  lines.push('## Working with this area');
  lines.push(`When working with code in **${areaName}/**, follow these mandatory safety rules:`);
  lines.push('');
  lines.push('### Before editing any symbol in this area:');
  lines.push('1. Call `mcp_milens_impact({target: "<symbol>", repo: "<workspaceRoot>"})` — check blast radius');
  lines.push('2. If depth-1 dependents > 5 → **STOP and warn** before proceeding');
  lines.push('3. Call `mcp_milens_context({name: "<symbol>", repo: "<workspaceRoot>"})` — see all callers/callees');
  lines.push('');
  lines.push('### Before committing changes in this area:');
  lines.push('1. Call `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` — verify scope');
  lines.push('2. If unexpected files changed → **STOP and report**');
  lines.push('');
  lines.push('### Key tools for this area:');
  lines.push('| Task | Tool |');
  lines.push('|---|---|');
  lines.push('| Find all references | `mcp_milens_context` |');
  lines.push('| Check edit safety | `mcp_milens_edit_check` |');
  lines.push('| Text search across files | `mcp_milens_grep` |');
  lines.push('| See file symbols | `mcp_milens_get_file_symbols` |');
  lines.push('');
  lines.push('### Edit-safety enforcement');
  lines.push('A `PreToolUse` hook (warn mode by default) reminds you if no milens safety check (`impact`/`context`/`overview`/`guard_edit_check`/`edit_check`/`smart_context`) was called before an `Edit`/`Write`/`MultiEdit`. Opt-in strict deny mode is available via `milens hooks guard-set-mode --mode strict`. Both modes consume the check after one edit. See `.milens/hook-state/config.json`. Known caveat: the underlying `PreToolUse` deny mechanism has at least one reliability issue (https://github.com/anthropics/claude-code/issues/4362).');
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

type EditorName = 'copilot' | 'cursor' | 'claude' | 'agents' | 'windsurf';

function editorSkillPath(editor: EditorName, name: string): string {
  switch (editor) {
    case 'copilot':  return `.github/instructions/${name}.instructions.md`;
    case 'cursor':   return `.cursor/rules/${name}.mdc`;
    case 'claude':   return `.claude/skills/generated/${name}/SKILL.md`;
    case 'agents':   return `.agents/skills/${name}/SKILL.md`;
    case 'windsurf': return `.windsurfrules`;
  }
}

function renderMilensInstructions(_rootDir: string, stats: { symbols: number; links: number; files: number }, areaNames: string[], editor: EditorName): string {
  const t = (name: string) => `mcp_milens_${name}`;

  const workflowSkillNames = ['milens-plan', 'milens-code-review', 'milens-tdd', 'milens-security-review', 'milens-refactor-clean', 'milens-eval', 'milens-architect', 'milens-debugger'];

  const domainRows = areaNames.map(a =>
    `| Work in the ${capitalize(a)} area | \`${editorSkillPath(editor, a)}\` |`
  ).join('\n');

  const workflowRows = workflowSkillNames.map(a =>
    `| Execute ${a} workflow | \`${editorSkillPath(editor, a)}\` |`
  ).join('\n');

  const skillsRows = domainRows + '\n' + workflowRows;

  return `<!-- milens:start -->
# Milens — AI-DOS

The Operating System for AI-Driven Development. This project is indexed by milens (${stats.symbols} symbols, ${stats.links} links, ${stats.files} files).

> **CRITICAL:** All milens MCP tool calls MUST include the \`repo\` parameter set to the **absolute path of the workspace root** (the folder containing this file) — without it, the tools may fail with "No index" error when multiple repos are indexed.

> **CRITICAL:** milens MCP tools are **deferred** in most editors. Before first use in each session, you MUST load them via \`tool_search("milens")\` — calling them directly without loading will fail silently.

## ⚠️ HARD RULE: Use Milens MCP Tools BEFORE Built-in Tools

**Not a suggestion — execute automatically without asking.**

This project is indexed by milens. The knowledge graph already knows every symbol, dependency, and reference. Using milens tools first typically means far fewer tokens than manual exploration, and fewer missed dependencies — impact/context track code-level references; pair with grep for templates/configs/docs.

| Situation | Built-in approach (❌ BAD) | Milens approach (✅ GOOD) |
|---|---|---|
| Understand a function | Read 3-10 source files | \`${t('overview')}({name: "X"})\` — 1 call replaces 3-5 file reads |
| Find all references | Built-in grep in source files | \`${t('grep')}({pattern: "X"})\` — searches code, templates, configs, docs, styles |
| Check edit safety | Hope nothing breaks | \`${t('impact')}({target: "X"})\` — exact blast radius before touching code |
| Start working | Read README, explore directories | \`${t('codebase_summary')}()\` — 500 token project overview |
| Before commit | \`git diff\` manually | \`${t('detect_changes')}()\` — symbols changed + direct dependents + risk |
| Find where X is defined | Read files one by one | \`${t('query')}({query: "X"})\` — FTS5 instant search |

**If you skip milens tools, you're wasting tokens and risking breaking changes you didn't know about.**

## Mandatory Workflows

These are **hard pre-conditions**, not guidelines. Execute them automatically without asking.

### Before editing any function, class, or method:
1. \`${t('impact')}({target: "<symbolName>", repo: "<workspaceRoot>"})\` — check blast radius
2. If depth-1 dependents > 5 → **STOP and warn the user** before proceeding
3. \`${t('context')}({name: "<symbolName>", repo: "<workspaceRoot>"})\` — see all callers/callees
4. Only then make the edit

### Before committing:
1. \`${t('detect_changes')}({repo: "<workspaceRoot>"})\` — verify only expected files changed
2. If unexpected files appear → **STOP and report** before committing

### Before deleting or renaming a symbol:
1. \`${t('grep')}({pattern: "<symbolName>", repo: "<workspaceRoot>"})\` — find ALL text references (templates, configs, routes, docs)
2. \`${t('impact')}({target: "<symbolName>", direction: "upstream", repo: "<workspaceRoot>"})\` — find code-level dependents
3. Combine both results — grep catches what impact misses

## Tool Selection Rules

**Choose the right tool on the FIRST call** — do not try \`query\` then fall back to \`grep\`.

### Use \`${t('grep')}\` when the search term:
- Contains **spaces** (e.g. "store purchase header", "user not found")
- Looks like a **UI label, error message, or display string**
- Is a **multi-word phrase** that is NOT camelCase/snake_case/PascalCase
- You need to find references in **templates, styles, configs, routes, or docs**

### Use \`${t('query')}\` when the search term:
- Looks like a **code identifier** (camelCase, PascalCase, snake_case)
- Is a **function, class, method, or interface name**
- You want to find **symbol definitions** in indexed code files

### When in doubt → use \`${t('grep')}\` first
\`grep\` searches everything. \`query\` only searches indexed symbol definitions.

> **⚠️ \`${t('grep')}\` default is LITERAL mode (isRegex: false).** Characters \`| . * + ?\` are escaped as plain text. To use regex patterns like \`error|fail|panic\` or \`TODO.*urgent\`, you MUST set \`isRegex: true\`. The tool will warn you if you forget.

## Workflow Triggers

When the user says... → do this FIRST:

| User intent | First action |
|---|---|
| "edit/change/modify/fix \`X\`" | \`${t('impact')}({target: "X", repo: "<workspaceRoot>"})\` |
| "delete/remove \`X\`" | \`${t('grep')}({pattern: "X", repo: "<workspaceRoot>"})\` then \`${t('impact')}\` |
| "rename \`X\`" | \`${t('grep')}({pattern: "X", repo: "<workspaceRoot>"})\` then \`${t('impact')}\` |
| "find/search for \`X\`" | Choose \`query\` or \`grep\` per rules above |
| "commit" / "push" | \`${t('detect_changes')}({repo: "<workspaceRoot>"})\` |
| "what calls/uses \`X\`" | \`${t('context')}({name: "X", repo: "<workspaceRoot>"})\` |
| "what happens if I change \`X\`" | \`${t('impact')}({target: "X", repo: "<workspaceRoot>"})\` |
| "how are \`A\` and \`B\` connected" | \`${t('explain_relationship')}({from: "A", to: "B", repo: "<workspaceRoot>"})\` |
| "explore/understand \`X\`" | \`${t('context')}({name: "X", repo: "<workspaceRoot>"})\` |
| "update/write docs for \`X\`" | \`${t('grep')}({pattern: "X", include: "**/*.md"})\` — find existing docs mentioning X, then \`${t('context')}({name: "X"})\` for full symbol info |
| "research/explore docs" | \`${t('get_file_symbols')}({file: "<doc.md>"})\` — see document outline (headings as sections) |
| "what docs mention \`X\`" | \`${t('grep')}({pattern: "X", include: "**/*.md"})\` — find all markdown references |
| "review this PR" | \`${t('review_pr')}({repo: "<workspaceRoot>"})\` — risk assessment for changed files |
| "is \`X\` risky to change" | \`${t('review_symbol')}({name: "X", repo: "<workspaceRoot>"})\` |
| "write tests for \`X\`" | \`${t('test_plan')}({name: "X", repo: "<workspaceRoot>"})\` — deps, mocks, suggested tests |
| "what needs tests" | \`${t('test_coverage_gaps')}({repo: "<workspaceRoot>"})\` — untested symbols by risk |
| "which tests to run" | \`${t('test_impact')}({repo: "<workspaceRoot>"})\` — maps changes → test files |
| "remember/note that \`X\`..." | \`${t('annotate')}({symbol: "X", key: "note", value: "...", repo: "<workspaceRoot>"})\` |
| "what do we know about \`X\`" | \`${t('recall')}({symbol: "X", repo: "<workspaceRoot>"})\` |
| "start new session" | \`${t('session_start')}({agent: "...", repo: "<workspaceRoot>"})\` |
| "find code like \`X\`" | \`${t('find_similar')}({name: "X", repo: "<workspaceRoot>"})\` |
| "search for \`concept\`" | \`${t('semantic_search')}({query: "concept", repo: "<workspaceRoot>"})\` |
| "generate tests for \`X\`" | \`${t('test_generate')}({symbol: "X", repo: "<workspaceRoot>"})\` |
| "fix security issue in \`X\`" | \`${t('fix_apply')}({ruleId, file, line, repo: "<workspaceRoot>"})\` |
| "remove dead code" | \`${t('find_dead_code')}()\` then \`dead_code_remove\` prompt |
| "orchestrate/check changes" | \`${t('orchestrate')}({repo: "<workspaceRoot>"})\` |
| "compare impact of \`X\`" | \`${t('compare_impact')}({name: "X", action: "snapshot"|"compare", repo: "<workspaceRoot>"})\` |
| "check pre-commit" | \`${t('pre_commit_check')}({repo: "<workspaceRoot>"})\` |
| "save/restore context" | \`${t('hook_preCompact')}()\` / \`${t('hook_postCompact')}()\` |
| "scan security / audit security" | \`${t('security_scan')}({repo: "<workspaceRoot>"})\` — full audit across all 190 rules |
| "end session" / "finish work" | \`${t('session_end')}({session_id: "..."})\` — record stats, trigger onSessionEnd hook |
| "what did session X do" | \`${t('session_context')}({session_id: "..."})\` — get annotations + tool calls |
| "file changed to X" | \`${t('hook_onFileChange')}({files: ["path/to/file"], repo: "<workspaceRoot>"})\` |

### Domain-aware skill triggers:
| User intent | Skill to load |
|---|---|
| "I'm working on authentication/security" | Load \`milens-security\` skill + \`${t('security_scan')}()\` |
| "I need to understand the parser" | Load \`milens-parser\` skill + \`${t('get_file_symbols')}({file: "src/parser/"})\` |
| "I'm debugging a server issue" | Load \`milens-server\` skill + \`${t('trace')}()\` |
| "I'm working with the database" | Load \`milens-store\` skill + \`${t('get_file_symbols')}({file: "src/store/"})\` |
| "I need to write tests for this" | Load \`milens-tdd\` skill + \`${t('test_plan')}()\` |
| "I'm planning a feature" | Load \`milens-plan\` skill + \`${t('codebase_summary')}()\` |
| "I need to refactor this" | Load \`milens-refactor-clean\` skill + \`${t('impact')}()\` |
| "Review my code changes" | Load \`milens-code-review\` skill + \`${t('review_pr')}()\` |

## Annotation Guide — Building a Smarter Codebase

Every time you discover something important about a symbol, annotate it. The system learns across sessions — your note today saves tokens tomorrow.

### When to annotate:
- Found a bug pattern? → \`${t('annotate')}({symbol: "X", key: "bug", value: "..."})\`
- Discovered an architecture rule? → \`${t('annotate')}({symbol: "X", key: "architecture", value: "..."})\`
- Learned how to test something? → \`${t('annotate')}({symbol: "X", key: "test", value: "..."})\`
- Found a security issue? → \`${t('annotate')}({symbol: "X", key: "security", value: "..."})\`
- Noted a hidden dependency? → \`${t('annotate')}({symbol: "X", key: "dependency", value: "..."})\`

### Annotation keys reference:
| Key | Use when | Example value |
|-----|----------|---------------|
| \`bug\` | Known bug, not yet fixed | "NullPointerException when users is empty array" |
| \`security\` | Security vulnerability | "No CSRF token validation on this endpoint" |
| \`architecture\` | Design pattern, constraint | "Service is a singleton — don't instantiate directly" |
| \`test\` | Testing knowledge | "Must mock Database.getConnection() before testing" |
| \`dependency\` | Hidden coupling | "Imports from deprecated module old-auth.js" |
| \`refactor\` | Future refactoring notes | "Split into validateEmail() + normalizeEmail()" |
| \`workflow\` | Process knowledge | "Must restart dev server after modifying this file" |
| \`note\` | General observation | "This function is called from cron job at 3AM" |

### Learning lifecycle:
1. **Session 1:** \`annotate()\` → confidence 0.5
2. **Session 2:** \`recall()\` sees it again → confidence 0.7
3. **Session 5:** confidence hits 0.8 → \`milens evolve\` promotes it to SKILL.md

### Annotate triggers:
| User says... | Tool call |
|---|---|
| "found a bug in X" | \`${t('annotate')}({symbol: "X", key: "bug", value: "describe the bug"})\` |
| "X has a security issue" | \`${t('annotate')}({symbol: "X", key: "security", value: "describe the issue"})\` |
| "learned how X works" | \`${t('annotate')}({symbol: "X", key: "note", value: "key insight"})\` |
| "X depends on Y internally" | \`${t('annotate')}({symbol: "X", key: "dependency", value: "depends on Y for Z"})\` |
| "X needs refactoring later" | \`${t('annotate')}({symbol: "X", key: "refactor", value: "plan"})\` |

### At session end, ALWAYS:
1. \`${t('recall')}({})\` — review annotations you found useful
2. \`${t('annotate')}({symbol: "X", key: "...", value: "..."})\` — save new discoveries from this session

## Problem → Solution — When You're Stuck

| You're trying to... | Do this FIRST |
|---|---|
| Understand the codebase | \`${t('codebase_summary')}()\` then \`${t('domains')}()\` |
| Understand a specific function | \`${t('context')}({name: "functionName"})\` |
| Find where something is defined | \`${t('query')}({query: "ClassName"})\` |
| Find ALL references to something | \`${t('grep')}({pattern: "ClassName"})\` |
| Check if editing is safe | \`${t('impact')}({target: "functionName"})\` |
| Edit with confidence | \`${t('overview')}({name: "functionName"})\` — context+impact+grep in 1 call |
| Know which tests to run | \`${t('test_impact')}()\` — maps changes to test files |
| Find what needs testing most | \`${t('test_coverage_gaps')}()\` — sorted by risk |
| Get a test strategy | \`${t('test_plan')}({name: "functionName"})\` — mocks + scenarios |
| Review your changes | \`${t('review_pr')}()\` — risk scores for changed symbols |
| Check for security issues | \`${t('security_scan')}()\` — 190 rules in one call |
| Remove dead code safely | \`${t('find_dead_code')}()\` then use \`dead_code_remove\` prompt |
| Trace how code executes | \`${t('trace')}({name: "functionName", direction: "to"})\` |
| Find API endpoints | \`${t('routes')}()\` — auto-detect across 7 frameworks |
| See class hierarchy | \`${t('get_type_hierarchy')}({name: "ClassName"})\` |
| Compare impact before/after | \`${t('compare_impact')}({name: "X", action: "snapshot"})\` before, then \`compare\` after |
| Get a full picture fast | \`${t('orchestrate')}()\` — runs detect+review+impact+gaps+dead code |
| Remember something important | \`${t('annotate')}({symbol: "X", key: "...", value: "..."})\` |
| Recall past knowledge | \`${t('recall')}({symbol: "X"})\` |
| Start a new session properly | \`${t('session_start')}({agent: "..."})\` → \`${t('recall')}()\` → \`${t('codebase_summary')}()\` |
| End a session properly | \`${t('detect_changes')}()\` → \`${t('review_pr')}()\` → annotate → \`${t('session_end')}()\` |
| Transfer work to another agent | \`${t('handoff')}({from_session: "...", to_agent: "...", context: "..."})\` |
| Debug a crash / exception | \`${t('trace')}({name: "crashingFunction"})\` + \`${t('context')}()\` + \`${t('impact')}()\` |

## Session Lifecycle

### Start EVERY session:
1. \`${t('session_start')}({agent: "your-agent-name"})\` — register session
2. \`${t('recall')}({})\` — what did we learn last time?
3. \`${t('codebase_summary')}()\` — refresh project context in 500 tokens

### End EVERY session:
1. \`${t('detect_changes')}()\` — verify changes
2. \`${t('review_pr')}()\` — risk assessment
3. \`${t('annotate')}({...})\` — save key discoveries from this session
4. \`${t('session_end')}({session_id: "..."})\` — record stats

Milens indexes **Markdown files** (.md, .mdx) — headings become \`section\` symbols with parent-child hierarchy, and local links become cross-file references.

### Researching or exploring documentation:
1. \`${t('get_file_symbols')}({file: "README.md", repo: "<workspaceRoot>"})\` — see the full heading outline (TOC) of any doc
2. \`${t('query')}({query: "<topic>"})\` — search section headings across all docs and code
3. \`${t('grep')}({pattern: "<keyword>", include: "**/*.md"})\` — text search within docs only

### Before updating documentation:
1. \`${t('get_file_symbols')}({file: "<doc.md>"})\` — understand document structure first
2. If documenting a code symbol: \`${t('context')}({name: "<symbolName>"})\` — get full symbol info (signature, callers, deps)
3. \`${t('grep')}({pattern: "<symbolName>", include: "**/*.md"})\` — check if other docs already reference it

### After renaming/deleting a code symbol:
- \`${t('grep')}({pattern: "<oldName>", include: "**/*.md"})\` — find docs that need updating (milens indexes markdown links as cross-file references)

## Never Do

- NEVER edit a symbol without first running \`${t('impact')}\` on it.
- NEVER delete or rename without running both \`${t('grep')}\` and \`${t('impact')}\`.
- NEVER commit without running \`${t('detect_changes')}()\`.
- NEVER call milens MCP tools without the \`repo\` parameter.
- NEVER use \`${t('query')}\` for multi-word display text or UI labels — use \`${t('grep')}\`.

---

## Reference

### ⭐ Core Tools — Use Every Session (8)

| Tool | Purpose |
|---|---|
| \`${t('overview')}\` | **Use this first.** Combined context + impact + grep. 1 call replaces 3-5 file reads. |
| \`${t('impact')}\` | Blast radius BEFORE editing. Shows what WILL BREAK. |
| \`${t('edit_check')}\` | Pre-edit safety: callers + exports + re-export chains + test coverage |
| \`${t('context')}\` | 360° view: all callers + all callees. Instant dependency graph. |
| \`${t('query')}\` | Find symbol definitions by name (FTS5 instant search) |
| \`${t('grep')}\` | Search ALL files for any text (templates, configs, docs, styles) |
| \`${t('detect_changes')}\` | Pre-commit: which symbols changed + dependents + risk scores |
| \`${t('codebase_summary')}\` | Project overview in ~500 tokens. Use instead of reading README. |

### 🔧 Situational Tools — Use When Needed (15)

| Tool | Purpose | Use when... |
|---|---|---|
| \`${t('review_pr')}\` | PR risk assessment | Before opening PR |
| \`${t('review_symbol')}\` | Single symbol deep-dive | Symbol is flagged CRITICAL/HIGH |
| \`${t('test_plan')}\` | Mock strategy + >=3 test scenarios | Writing new tests |
| \`${t('test_coverage_gaps')}\` | Untested symbols sorted by risk | Finding test priorities |
| \`${t('test_impact')}\` | Maps changes → test files | After making edits |
| \`${t('test_generate')}\` | Auto-generate test file | Starting tests from scratch |
| \`${t('security_scan')}\` | 190 security rules | Security audit requested |
| \`${t('trace')}\` | Call chains from entrypoints | Debugging execution flow |
| \`${t('routes')}\` | Framework routes/endpoints | Finding API endpoints |
| \`${t('smart_context')}\` | Intent-aware context | Understand/edit/debug/test modes |
| \`${t('domains')}\` | Domain clusters | Understanding module structure |
| \`${t('explain_relationship')}\` | Shortest dependency path | How A connects to B |
| \`${t('get_type_hierarchy')}\` | Inheritance tree | Class/interface exploration |
| \`${t('find_dead_code')}\` | Unused exported symbols | Before major refactors |
| \`${t('find_similar')}\` | Symbols with shared callers/callees | Finding refactor patterns |

### 📚 Advanced Tools — Reference (19)

| Tool | Purpose |
|---|---|
| \`${t('status')}\` | Index health: symbols, links, files, coverage, staleness |
| \`${t('repos')}\` | List all indexed repositories |
| \`${t('annotate')}\` | Record observations about symbols (persists across sessions) |
| \`${t('recall')}\` | Retrieve annotations from past sessions |
| \`${t('session_start')}\` | Register agent session |
| \`${t('session_end')}\` | End session and record stats |
| \`${t('session_context')}\` | Get session metadata + annotations |
| \`${t('handoff')}\` | Transfer context between agent sessions |
| \`${t('orchestrate')}\` | Full cycle: detect → review → impact → gaps → dead code |
| \`${t('pre_commit_check')}\` | Pre-commit risk scan |
| \`${t('compare_impact')}\` | Compare impact graph before/after edit |
| \`${t('semantic_search')}\` | Hybrid FTS5 + vector search |
| \`${t('fix_apply')}\` | Apply security fix to a file |
| \`${t('hook_preCompact')}\` | Save metrics before context compaction |
| \`${t('hook_postCompact')}\` | Restore context after compaction |
| \`${t('hook_onFileChange')}\` | Trigger on file change hook |
| \`${t('ast_explore')}\` | Parse code to AST S-expression |
| \`${t('test_query')}\` | Test tree-sitter query patterns |
| \`${t('get_file_symbols')}\` | All symbols in a file with ref/dep counts |

### Keeping the Index Fresh

After significant code changes: \`npx milens analyze -p . --force\` (replace \`.\` with your project root if running from a different directory)

### Skills

| Task | Read this skill file |
|------|---------------------|
| General milens tools reference | \`${editorSkillPath(editor, 'milens')}\` |
${skillsRows}

<!-- milens:end -->`;
}

function generateToolInstructions(
  rootDir: string,
  copilotDir: string,
  cursorDir: string,
  claudeDir: string,
  _claudeRulesDir: string,
  agentsDir: string,
  stats: { symbols: number; links: number; files: number },
  areaNames: string[],
  has: (name: string) => boolean,
): void {
  if (has('copilot')) {
    const content = renderMilensInstructions(rootDir, stats, areaNames, 'copilot');

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
    const content = renderMilensInstructions(rootDir, stats, areaNames, 'cursor');

    // Cursor: .cursor/rules/milens.mdc (alwaysApply: true → always loaded)
    writeFileSync(
      join(cursorDir, 'milens.mdc'),
      `---\ndescription: Milens code intelligence MCP tools\nglobs: "**"\nalwaysApply: true\n---\n\n${content}`,
    );

    // Cursor project-wide rules: .cursor/index.mdc (alwaysApply: always loaded)
    const cursorIndex = join(rootDir, '.cursor', 'index.mdc');
    mkdirSync(dirname(cursorIndex), { recursive: true });
    injectMdcWithMarkers(cursorIndex, content);
  }

  if (has('claude')) {
    const content = renderMilensInstructions(rootDir, stats, areaNames, 'claude');

    // Claude: .claude/skills/generated/milens/SKILL.md
    const claudeMilensDir = join(claudeDir, 'milens');
    mkdirSync(claudeMilensDir, { recursive: true });
    writeFileSync(join(claudeMilensDir, 'SKILL.md'), content);

    // Inject into root config that Claude Code always reads
    injectWithMarkers(join(rootDir, 'CLAUDE.md'), content);
  }

  if (has('agents')) {
    const content = renderMilensInstructions(rootDir, stats, areaNames, 'agents');

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

  if (has('windsurf')) {
    const content = renderMilensInstructions(rootDir, stats, areaNames, 'windsurf');

    // Windsurf: .windsurfrules (plain markdown, always loaded — no per-area skill files)
    injectWithMarkers(join(rootDir, '.windsurfrules'), content);
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

/** Inject milens content into a .mdc file (MDC = Cursor frontmatter format, alwaysApply). */
function injectMdcWithMarkers(filePath: string, content: string): void {
  const startMarker = '<!-- milens:start -->';
  const endMarker = '<!-- milens:end -->';

  let existing = '';
  try {
    existing = readFileSync(filePath, 'utf-8');
  } catch { /* file doesn't exist */ }

  const wrapped = `${startMarker}\n${content.replace(new RegExp(startMarker, 'g'), '').replace(new RegExp(endMarker, 'g'), '')}\n${endMarker}`;

  if (existing.includes(startMarker) && existing.includes(endMarker)) {
    const before = existing.slice(0, existing.indexOf(startMarker));
    const after = existing.slice(existing.indexOf(endMarker) + endMarker.length);
    writeFileSync(filePath, `${before}${wrapped}${after}`);
  } else if (existing) {
    writeFileSync(filePath, `${existing}\n\n${wrapped}\n`);
  } else {
    // New .mdc file: add alwaysApply frontmatter
    writeFileSync(filePath, `---\nalwaysApply: true\n---\n\n${wrapped}\n`);
  }
}
