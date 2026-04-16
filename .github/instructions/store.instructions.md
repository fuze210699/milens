---
applyTo: "src/store/**"
---

# Store

## Overview
Contains 94 symbols (8 exported) across 3 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 29 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:18) — 6 refs
- **`buildEmbeddingText`** [function] (src/store/vectors.ts:250) — 6 refs
- **`TfIdfProvider`** [class] (src/store/vectors.ts:44) — 6 refs
- **`EmbeddingStore`** [class] (src/store/vectors.ts:170) — 6 refs
- **`EmbeddingProvider`** [interface] (src/store/vectors.ts:15) — 2 refs
- **`NeuralProvider`** [class] (src/store/vectors.ts:122) — 0 refs
- **`SimilarResult`** [interface] (src/store/vectors.ts:23) — 0 refs

## Entry Points
- **`Database`** [class] — 29 incoming references
- **`get`** [method] — 16 incoming references
- **`close`** [method] — 12 incoming references
- **`rowToSymbol`** [function] — 11 incoming references
- **`findSymbolById`** [method] — 9 incoming references

## Dependencies
- **root**: `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has`, `t`
- **scripts**: `run`
- **analyzer**: `find`, `resolve`

## Used By
- **analyzer**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clear`, `isFileUpToDate`, `upsertFileHash` (+22 more)
- **root**: `RepoRegistry`, `Database`, `register`, `close`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+11 more)
- **server**: `Database`, `RepoRegistry`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `getStats`, `getDomainStats`, `close` (+33 more)
- **test**: `Database`, `RepoRegistry`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `close`, `insertSymbol`, `findSymbolByName` (+44 more)
- **parser**: `load`

## Files
- src/store/db.ts
- src/store/registry.ts
- src/store/vectors.ts
