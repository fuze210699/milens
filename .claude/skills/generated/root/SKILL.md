# Root

## Working with this area
When working with code in **root/**, follow these mandatory safety rules:

### Before editing any symbol in this area:
1. Call `mcp_milens_impact({target: "<symbol>", repo: "<workspaceRoot>"})` — check blast radius
2. If depth-1 dependents > 5 → **STOP and warn** before proceeding
3. Call `mcp_milens_context({name: "<symbol>", repo: "<workspaceRoot>"})` — see all callers/callees

### Before committing changes in this area:
1. Call `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` — verify scope
2. If unexpected files changed → **STOP and report**

### Key tools for this area:
| Task | Tool |
|---|---|
| Find all references | `mcp_milens_context` |
| Check edit safety | `mcp_milens_edit_check` |
| Text search across files | `mcp_milens_grep` |
| See file symbols | `mcp_milens_get_file_symbols` |

### Edit-safety enforcement
A `PreToolUse` hook (warn mode by default) reminds you if no milens safety check (`impact`/`context`/`overview`/`guard_edit_check`/`edit_check`/`smart_context`) was called before an `Edit`/`Write`/`MultiEdit`. Opt-in strict deny mode is available via `milens hooks guard-set-mode --mode strict`. Both modes consume the check after one edit. See `.milens/hook-state/config.json`. Known caveat: the underlying `PreToolUse` deny mechanism has at least one reliability issue (https://github.com/anthropics/claude-code/issues/4362).

## Overview
Contains 236 symbols (156 exported) across 12 files.

## Key Symbols
- **`CodeSymbol`** [interface] (src/types.ts:8) — 50 refs
- **`SymbolLink`** [interface] (src/types.ts:26) — 22 refs
- **`RawCall`** [interface] (src/types.ts:45) — 15 refs
- **`isTestFile`** [function] (src/utils.ts:2) — 10 refs
- **`RawImport`** [interface] (src/types.ts:35) — 9 refs
- **`RawHeritage`** [interface] (src/types.ts:59) — 7 refs
- **`ExtractionResult`** [interface] (src/types.ts:67) — 6 refs
- **`RawTypeBinding`** [interface] (src/types.ts:87) — 6 refs
- **`RawAssignmentBinding`** [interface] (src/types.ts:95) — 6 refs
- **`globToRegex`** [function] (src/utils.ts:11) — 6 refs
- **`RawReturnType`** [interface] (src/types.ts:103) — 5 refs
- **`RawCallResultBinding`** [interface] (src/types.ts:111) — 5 refs
- **`AnalysisStats`** [interface] (src/types.ts:120) — 5 refs
- **`generateAgentsMd`** [function] (src/agents-md.ts:93) — 4 refs
- **`computeMetrics`** [function] (src/metrics.ts:21) — 4 refs

## Entry Points
- **`CodeSymbol`** [interface] — 50 incoming references
- **`SymbolLink`** [interface] — 22 incoming references
- **`RawCall`** [interface] — 15 incoming references
- **`isTestFile`** [function] — 10 incoming references
- **`RawImport`** [interface] — 9 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `AnnotationStore`, `runDecayPass`, `getIncomingLinks`, `getAllSymbols`, `getCodebaseSummary`, `findDbPath` (+22 more)
- **analyzer**: `loadAliases`, `analyze`, `resolve`
- **ui**: `createProgressReporter`, `finalize`
- **server**: `startHttp`, `startStdio`, `HookManager`, `defaultOnSessionStart`, `defaultOnSessionEnd`, `defaultOnPreCompact`, `defaultOnPostCompact`, `handleMarkChecked` (+6 more)
- **security**: `loadRules`, `auditDependencies`
- **orchestrator**: `Orchestrator`, `subscribe`, `runAndFormat`

## Used By
- **analyzer**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+7 more)
- **orchestrator**: `CodeSymbol`
- **parser**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+3 more)
- **server**: `generateCrossRefSection`, `globToRegex`
- **store**: `Annotation`, `AnnotationKey`, `Session`, `EvolutionEvent`, `CodeSymbol`, `SymbolLink`, `RepoEntry`
- **ui**: `AnalysisStats`
- **test**: `generateAgentsMd`, `AnnotationKey`, `CodeSymbol`, `SymbolLink`, `computeMetrics`, `formatMetricsReport`, `MilensMetrics`, `RawImport` (+17 more)

## Files
- AGENTS.md
- CLAUDE.md
- CONTRIBUTING.md
- README.md
- src/agents-md.ts
- src/cli.ts
- src/metrics.ts
- src/skills.ts
- src/types.ts
- src/uninstall.ts
- src/utils.ts
- vitest.config.ts
