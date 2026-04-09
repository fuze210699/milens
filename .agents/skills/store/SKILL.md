---
name: milens-store
description: Code intelligence for the store area — symbols, dependencies, and entry points
---

# Store

## Overview
Contains 40 symbols (2 exported) across 2 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 0 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:9) — 0 refs

## Entry Points
- **`close`** [method] — 6 incoming references
- **`rowToSymbol`** [function] — 5 incoming references
- **`findSymbolByName`** [method] — 4 incoming references
- **`searchSymbols`** [method] — 3 incoming references
- **`getIncomingLinks`** [method] — 3 incoming references

## Dependencies
- **server**: `get`
- **root**: `has`

## Used By
- **analyzer**: `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData`, `insertSymbol` (+3 more)
- **parser**: `clear`, `load`
- **server**: `close`, `findByRoot`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks`, `findSymbolById`, `getOutgoingLinks` (+7 more)
- **root**: `getAllSymbols`, `getAllLinks`

## Files
- src/store/db.ts
- src/store/registry.ts
