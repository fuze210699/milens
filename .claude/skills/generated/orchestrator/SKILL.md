# Orchestrator

## Overview
Contains 22 symbols (7 exported) across 2 files.

## Key Symbols
- **`Orchestrator`** [class] (src/orchestrator/orchestrator.ts:36) — 6 refs
- **`OrchestratorReport`** [interface] (src/orchestrator/reporter.ts:4) — 5 refs
- **`formatReport`** [function] (src/orchestrator/reporter.ts:17) — 4 refs
- **`OrchestratorConfig`** [interface] (src/orchestrator/orchestrator.ts:10) — 2 refs
- **`ImpactSnapshot`** [interface] (src/orchestrator/orchestrator.ts:18) — 2 refs
- **`ReportOptions`** [interface] (src/orchestrator/reporter.ts:13) — 2 refs
- **`ImpactDiff`** [interface] (src/orchestrator/orchestrator.ts:25) — 1 refs

## Entry Points
- **`Orchestrator`** [class] — 6 incoming references
- **`OrchestratorReport`** [interface] — 5 incoming references
- **`formatReport`** [function] — 4 incoming references
- **`snapshot`** [method] — 3 incoming references
- **`run`** [method] — 3 incoming references

## Dependencies
- **store**: `Database`, `findSymbolByName`, `findUpstream`, `clear`, `getTestCoverageGaps`, `findDeadCode`, `close`
- **analyzer**: `reviewPr`, `ReviewResult`, `SymbolRisk`
- **root**: `CodeSymbol`, `has`

## Used By
- **root**: `Orchestrator`, `subscribe`, `runAndFormat`
- **server**: `Orchestrator`, `snapshot`, `compare`, `runAndFormat`
- **test**: `Orchestrator`, `formatReport`, `OrchestratorReport`, `subscribe`, `run`, `snapshot`, `compare`, `cancel` (+2 more)

## Files
- src/orchestrator/orchestrator.ts
- src/orchestrator/reporter.ts
