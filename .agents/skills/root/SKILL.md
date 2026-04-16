---
name: milens-root
description: Code intelligence for the root area — symbols, dependencies, and entry points
---

# Root

## Overview
Contains 124 symbols (91 exported) across 8 files.

## Key Symbols
- **`CodeSymbol`** [interface] (src/types.ts:8) — 29 refs
- **`SymbolLink`** [interface] (src/types.ts:26) — 13 refs
- **`isTestFile`** [function] (src/utils.ts:2) — 12 refs
- **`RawCall`** [interface] (src/types.ts:44) — 7 refs
- **`RawImport`** [interface] (src/types.ts:35) — 6 refs
- **`ExtractionResult`** [interface] (src/types.ts:60) — 6 refs
- **`RawHeritage`** [interface] (src/types.ts:52) — 4 refs
- **`RawTypeBinding`** [interface] (src/types.ts:80) — 4 refs
- **`RawAssignmentBinding`** [interface] (src/types.ts:88) — 4 refs
- **`RawReturnType`** [interface] (src/types.ts:96) — 4 refs
- **`RawCallResultBinding`** [interface] (src/types.ts:104) — 4 refs
- **`RawReExport`** [interface] (src/types.ts:73) — 3 refs
- **`generateSkills`** [function] (src/skills.ts:19) — 2 refs
- **`AnalysisStats`** [interface] (src/types.ts:113) — 2 refs
- **`RepoEntry`** [interface] (src/types.ts:125) — 2 refs

## Entry Points
- **`CodeSymbol`** [interface] — 29 incoming references
- **`has`** [function] — 24 incoming references
- **`SymbolLink`** [interface] — 13 incoming references
- **`isTestFile`** [function] — 12 incoming references
- **`RawCall`** [interface] — 7 incoming references

## Dependencies
- **analyzer**: `loadAliases`, `analyze`, `resolve`
- **store**: `RepoRegistry`, `Database`, `register`, `close`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+11 more)
- **server**: `startHttp`, `startStdio`
- **scripts**: `outDir`

## Used By
- **analyzer**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **parser**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **server**: `isTestFile`, `has`
- **store**: `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has`, `isTestFile`, `t`
- **test**: `CodeSymbol`, `SymbolLink`, `RawImport`, `RawCall`, `RawHeritage`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+2 more)

## Files
- AGENTS.md
- CLAUDE.md
- README.md
- src/cli.ts
- src/skills.ts
- src/types.ts
- src/utils.ts
- vitest.config.ts
