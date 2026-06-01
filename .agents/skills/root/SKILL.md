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
Contains 204 symbols (153 exported) across 13 files.

## Key Symbols
- **`CodeSymbol`** [interface] (src/types.ts:8) — 41 refs
- **`SymbolLink`** [interface] (src/types.ts:26) — 21 refs
- **`isTestFile`** [function] (src/utils.ts:2) — 11 refs
- **`RawCall`** [interface] (src/types.ts:44) — 7 refs
- **`RawImport`** [interface] (src/types.ts:35) — 6 refs
- **`ExtractionResult`** [interface] (src/types.ts:60) — 6 refs
- **`generateAgentsMd`** [function] (src/agents-md.ts:43) — 4 refs
- **`computeMetrics`** [function] (src/metrics.ts:21) — 4 refs
- **`formatMetricsReport`** [function] (src/metrics.ts:62) — 4 refs
- **`MilensMetrics`** [interface] (src/metrics.ts:4) — 4 refs
- **`generateSkills`** [function] (src/skills.ts:19) — 4 refs
- **`RawHeritage`** [interface] (src/types.ts:52) — 4 refs
- **`RawTypeBinding`** [interface] (src/types.ts:80) — 4 refs
- **`RawAssignmentBinding`** [interface] (src/types.ts:88) — 4 refs
- **`RawReturnType`** [interface] (src/types.ts:96) — 4 refs

## Entry Points
- **`CodeSymbol`** [interface] — 41 incoming references
- **`has`** [function] — 30 incoming references
- **`SymbolLink`** [interface] — 21 incoming references
- **`isTestFile`** [function] — 11 incoming references
- **`RawCall`** [interface] — 7 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `AnnotationStore`, `runDecayPass`, `getIncomingLinks`, `getAllSymbols`, `getCodebaseSummary`, `register` (+25 more)
- **analyzer**: `loadAliases`, `analyze`, `resolve`, `clear`
- **server**: `startHttp`, `startStdio`, `HookManager`, `get`, `enableHook`, `loadConfig`, `saveConfig`, `disableHook`
- **security**: `loadRules`, `auditDependencies`
- **orchestrator**: `Orchestrator`, `subscribe`, `runAndFormat`
- **scripts**: `outDir`
- **test**: `dbPath`

## Used By
- **analyzer**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **orchestrator**: `CodeSymbol`, `has`
- **parser**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **store**: `Annotation`, `AnnotationKey`, `Session`, `EvolutionEvent`, `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has` (+1 more)
- **test**: `generateAgentsMd`, `AnnotationKey`, `CodeSymbol`, `SymbolLink`, `computeMetrics`, `formatMetricsReport`, `MilensMetrics`, `RawImport` (+9 more)
- **security**: `has`
- **server**: `has`

## Files
- AGENTS.md
- CLAUDE.md
- CONTRIBUTING.md
- DEPLOY.md
- README.md
- milens-upgrade.md
- src/agents-md.ts
- src/cli.ts
- src/metrics.ts
- src/skills.ts
- src/types.ts
- src/utils.ts
- vitest.config.ts
