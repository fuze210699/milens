# Store

## Overview
Contains 50 symbols (2 exported) across 2 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 0 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:9) — 0 refs

## Entry Points
- **`close`** [method] — 6 incoming references
- **`rowToSymbol`** [function] — 5 incoming references
- **`findSymbolByName`** [method] — 4 incoming references
- **`findSymbolById`** [method] — 4 incoming references
- **`getIncomingLinks`** [method] — 4 incoming references

## Dependencies
- **root**: `has`
- **server**: `get`

## Used By
- **analyzer**: `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData`, `insertSymbol` (+5 more)
- **parser**: `clear`, `load`
- **server**: `close`, `findByRoot`, `listAll`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks`, `findSymbolById` (+11 more)
- **root**: `getAllSymbols`, `getAllLinks`

## Files
- src/store/db.ts
- src/store/registry.ts
