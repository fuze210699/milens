---
name: milens-root
description: Code intelligence for the root area — symbols, dependencies, and entry points
---

# Root

## Overview
Contains 122 symbols (90 exported) across 7 files.

## Key Symbols
- **`CodeSymbol`** [interface] (src/types.ts:8) — 26 refs
- **`SymbolLink`** [interface] (src/types.ts:26) — 10 refs
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
- **`SymbolKind`** [type] (src/types.ts:3) — 2 refs

## Entry Points
- **`CodeSymbol`** [interface] — 26 incoming references
- **`has`** [function] — 22 incoming references
- **`SymbolLink`** [interface] — 10 incoming references
- **`RawCall`** [interface] — 7 incoming references
- **`RawImport`** [interface] — 6 incoming references

## Dependencies
- **analyzer**: `loadAliases`, `analyze`, `resolve`
- **store**: `RepoRegistry`, `Database`, `register`, `close`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+11 more)
- **server**: `startHttp`, `startStdio`
- **scripts**: `outDir`

## Used By
- **analyzer**: `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding` (+7 more)
- **parser**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **store**: `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has`, `t`
- **test**: `CodeSymbol`, `SymbolLink`, `RawImport`, `RawCall`, `RawHeritage`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+2 more)
- **server**: `has`

## Files
- AGENTS.md
- CLAUDE.md
- README.md
- src/cli.ts
- src/skills.ts
- src/types.ts
- vitest.config.ts
