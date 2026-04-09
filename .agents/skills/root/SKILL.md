---
name: milens-root
description: Code intelligence for the root area — symbols, dependencies, and entry points
---

# Root

## Overview
Contains 28 symbols (10 exported) across 3 files.

## Key Symbols
- **`generateSkills`** [function] (src/skills.ts:19) — 1 refs
- **`CodeSymbol`** [interface] (src/types.ts:7) — 0 refs
- **`SymbolLink`** [interface] (src/types.ts:25) — 0 refs
- **`RawImport`** [interface] (src/types.ts:34) — 0 refs
- **`RawCall`** [interface] (src/types.ts:43) — 0 refs
- **`RawHeritage`** [interface] (src/types.ts:51) — 0 refs
- **`ExtractionResult`** [interface] (src/types.ts:59) — 0 refs
- **`RawReExport`** [interface] (src/types.ts:68) — 0 refs
- **`AnalysisStats`** [interface] (src/types.ts:75) — 0 refs
- **`RepoEntry`** [interface] (src/types.ts:87) — 0 refs

## Entry Points
- **`has`** [function] — 19 incoming references
- **`getAreaName`** [function] — 2 incoming references
- **`capitalize`** [function] — 2 incoming references
- **`deleteIndex`** [function] — 1 incoming references
- **`generateSkills`** [function] — 1 incoming references

## Dependencies
- **store**: `getAllSymbols`, `getAllLinks`
- **server**: `get`

## Used By
- **analyzer**: `has`
- **parser**: `has`
- **server**: `has`
- **store**: `has`

## Files
- src/cli.ts
- src/skills.ts
- src/types.ts
