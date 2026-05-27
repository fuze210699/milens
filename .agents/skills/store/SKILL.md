---
name: milens-store
description: Code intelligence for the store area — symbols, dependencies, and entry points
---

# Store

## Overview
Contains 60 symbols (2 exported) across 2 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 13 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:18) — 4 refs

## Entry Points
- **`Database`** [class] — 13 incoming references
- **`close`** [method] — 8 incoming references
- **`rowToSymbol`** [function] — 5 incoming references
- **`findSymbolByName`** [method] — 5 incoming references
- **`findSymbolById`** [method] — 4 incoming references

## Dependencies
- **root**: `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has`
- **server**: `get`
- **scripts**: `run`
- **analyzer**: `find`, `resolve`

## Used By
- **analyzer**: `Database`, `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData` (+7 more)
- **root**: `RepoRegistry`, `Database`, `register`, `close`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+11 more)
- **server**: `Database`, `RepoRegistry`, `getStats`, `getDomainStats`, `close`, `logToolUsage`, `findByRoot`, `listAll` (+19 more)
- **test**: `Database`, `close`, `insertSymbol`, `findSymbolByName`, `insertLink`, `getIncomingLinks`, `getOutgoingLinks`, `rebuildSearch` (+14 more)
- **parser**: `load`

## Files
- src/store/db.ts
- src/store/registry.ts
