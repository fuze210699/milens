---
paths:
  - "src/store/**"
---

# Store

## Overview
Contains 56 symbols (2 exported) across 2 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 0 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:9) — 0 refs

## Entry Points
- **`close`** [method] — 7 incoming references
- **`rowToSymbol`** [function] — 5 incoming references
- **`findSymbolByName`** [method] — 4 incoming references
- **`findSymbolById`** [method] — 4 incoming references
- **`getIncomingLinks`** [method] — 4 incoming references

## Dependencies
- **root**: `has`
- **server**: `get`
- **analyzer**: `find`

## Used By
- **analyzer**: `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData`, `insertSymbol` (+6 more)
- **parser**: `clear`, `load`
- **server**: `close`, `logToolUsage`, `findByRoot`, `listAll`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+16 more)
- **root**: `getAllSymbols`, `getAllLinks`

## Files
- src/store/db.ts
- src/store/registry.ts
