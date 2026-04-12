# Root

## Overview
Contains 105 symbols (77 exported) across 7 files.

## Key Symbols
- **`CodeSymbol`** [interface] (src/types.ts:8) — 9 refs
- **`RawImport`** [interface] (src/types.ts:35) — 6 refs
- **`SymbolLink`** [interface] (src/types.ts:26) — 5 refs
- **`RawCall`** [interface] (src/types.ts:44) — 5 refs
- **`RawHeritage`** [interface] (src/types.ts:52) — 4 refs
- **`ExtractionResult`** [interface] (src/types.ts:60) — 3 refs
- **`RawReExport`** [interface] (src/types.ts:69) — 3 refs
- **`generateSkills`** [function] (src/skills.ts:19) — 2 refs
- **`AnalysisStats`** [interface] (src/types.ts:76) — 1 refs
- **`RepoEntry`** [interface] (src/types.ts:88) — 1 refs
- **`SymbolKind`** [type] (src/types.ts:3) — 1 refs
- **`SymbolRole`** [type] (src/types.ts:22) — 1 refs
- **`LinkType`** [type] (src/types.ts:24) — 1 refs
- **`Milens — Code Intelligence (MCP)`** [section] (AGENTS.md:2) — 0 refs
- **`Mandatory Workflows`** [section] (AGENTS.md:10) — 0 refs

## Entry Points
- **`has`** [function] — 20 incoming references
- **`CodeSymbol`** [interface] — 9 incoming references
- **`RawImport`** [interface] — 6 incoming references
- **`SymbolLink`** [interface] — 5 incoming references
- **`RawCall`** [interface] — 5 incoming references

## Dependencies
- **analyzer**: `loadAliases`, `analyze`, `resolve`
- **store**: `RepoRegistry`, `Database`, `register`, `close`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+11 more)
- **server**: `createMcpServer`, `startStdio`, `startHttp`, `get`

## Used By
- **analyzer**: `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `AnalysisStats`, `SymbolLink` (+3 more)
- **parser**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `ExtractionResult`, `SymbolKind`, `has`
- **store**: `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has`
- **test**: `CodeSymbol`, `SymbolLink`, `RawImport`, `RawCall`, `RawHeritage`, `has`
- **server**: `has`

## Files
- AGENTS.md
- CLAUDE.md
- README.md
- src/cli.ts
- src/skills.ts
- src/types.ts
- vitest.config.ts
