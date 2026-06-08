---
name: milens-root
description: Code intelligence for the root area — symbols, dependencies, and entry points
---

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

## Overview
Contains 242 symbols (164 exported) across 13 files.

## Key Symbols
- **`CodeSymbol`** [interface] (src/types.ts:8) — 53 refs
- **`SymbolLink`** [interface] (src/types.ts:26) — 24 refs
- **`RawCall`** [interface] (src/types.ts:44) — 15 refs
- **`isTestFile`** [function] (src/utils.ts:2) — 12 refs
- **`RawImport`** [interface] (src/types.ts:35) — 9 refs
- **`RawHeritage`** [interface] (src/types.ts:52) — 7 refs
- **`ExtractionResult`** [interface] (src/types.ts:60) — 6 refs
- **`RawTypeBinding`** [interface] (src/types.ts:80) — 6 refs
- **`RawAssignmentBinding`** [interface] (src/types.ts:88) — 6 refs
- **`RawReturnType`** [interface] (src/types.ts:96) — 5 refs
- **`RawCallResultBinding`** [interface] (src/types.ts:104) — 5 refs
- **`AnalysisStats`** [interface] (src/types.ts:113) — 5 refs
- **`generateAgentsMd`** [function] (src/agents-md.ts:93) — 4 refs
- **`computeMetrics`** [function] (src/metrics.ts:21) — 4 refs
- **`formatMetricsReport`** [function] (src/metrics.ts:62) — 4 refs

## Entry Points
- **`CodeSymbol`** [interface] — 53 incoming references
- **`has`** [function] — 50 incoming references
- **`SymbolLink`** [interface] — 24 incoming references
- **`RawCall`** [interface] — 15 incoming references
- **`isTestFile`** [function] — 12 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `AnnotationStore`, `runDecayPass`, `getIncomingLinks`, `getAllSymbols`, `getCodebaseSummary`, `register` (+24 more)
- **analyzer**: `loadAliases`, `analyze`, `resolve`, `clear`
- **ui**: `createProgressReporter`, `finalize`
- **server**: `startHttp`, `startStdio`, `HookManager`, `get`, `enableHook`, `loadConfig`, `saveConfig`, `disableHook`
- **security**: `loadRules`, `auditDependencies`
- **orchestrator**: `Orchestrator`, `subscribe`, `runAndFormat`
- **test**: `add`, `dbPath`
- **scripts**: `version`, `outDir`, `root`

## Used By
- **analyzer**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **orchestrator**: `CodeSymbol`, `has`
- **parser**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **server**: `generateCrossRefSection`, `has`
- **store**: `Annotation`, `AnnotationKey`, `Session`, `EvolutionEvent`, `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has` (+1 more)
- **ui**: `AnalysisStats`
- **test**: `generateAgentsMd`, `AnnotationKey`, `CodeSymbol`, `SymbolLink`, `computeMetrics`, `formatMetricsReport`, `MilensMetrics`, `RawImport` (+17 more)
- **security**: `has`

## Files
- AGENTS.md
- CLAUDE.md
- CONTRIBUTING.md
- DEPLOY.md
- README.md
- src/agents-md.ts
- src/cli.ts
- src/metrics.ts
- src/skills.ts
- src/types.ts
- src/uninstall.ts
- src/utils.ts
- vitest.config.ts
