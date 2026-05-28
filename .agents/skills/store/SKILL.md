---
name: milens-store
description: Code intelligence for the store area — symbols, dependencies, and entry points
---

# Store

## Overview
Contains 134 symbols (15 exported) across 5 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 54 refs
- **`AnnotationStore`** [class] (src/store/annotations.ts:10) — 15 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:18) — 6 refs
- **`runDecayPass`** [function] (src/store/confidence.ts:85) — 4 refs
- **`buildEmbeddingText`** [function] (src/store/vectors.ts:250) — 4 refs
- **`TfIdfProvider`** [class] (src/store/vectors.ts:44) — 4 refs
- **`EmbeddingStore`** [class] (src/store/vectors.ts:170) — 4 refs
- **`EmbeddingProvider`** [interface] (src/store/vectors.ts:15) — 2 refs
- **`decayConfidence`** [function] (src/store/confidence.ts:22) — 1 refs
- **`boostConfidence`** [function] (src/store/confidence.ts:6) — 0 refs
- **`getStaleAnnotations`** [function] (src/store/confidence.ts:38) — 0 refs
- **`promoteSecurityAnnotations`** [function] (src/store/confidence.ts:48) — 0 refs
- **`autoPromote`** [function] (src/store/confidence.ts:106) — 0 refs
- **`NeuralProvider`** [class] (src/store/vectors.ts:122) — 0 refs
- **`SimilarResult`** [interface] (src/store/vectors.ts:23) — 0 refs

## Entry Points
- **`Database`** [class] — 54 incoming references
- **`close`** [method] — 22 incoming references
- **`get`** [method] — 22 incoming references
- **`AnnotationStore`** [class] — 15 incoming references
- **`rowToSymbol`** [function] — 13 incoming references

## Dependencies
- **root**: `Annotation`, `AnnotationKey`, `Session`, `EvolutionEvent`, `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has` (+1 more)
- **analyzer**: `find`, `resolve`
- **test**: `dbPath`

## Used By
- **root**: `Database`, `RepoRegistry`, `AnnotationStore`, `runDecayPass`, `getIncomingLinks`, `getAllSymbols`, `getCodebaseSummary`, `register` (+23 more)
- **analyzer**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clearFiles`, `clear`, `isFileUpToDate` (+23 more)
- **orchestrator**: `Database`, `findSymbolByName`, `findUpstream`, `clear`, `getTestCoverageGaps`, `findDeadCode`, `close`
- **server**: `Database`, `AnnotationStore`, `RepoRegistry`, `runDecayPass`, `getCodebaseSummary`, `recall`, `close`, `getStats` (+36 more)
- **test**: `Database`, `RepoRegistry`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `close`, `insertSymbol`, `findSymbolByName` (+44 more)
- **apps**: `remove`, `Database`, `getCodebaseSummary`, `close`
- **docs**: `remove`
- **parser**: `load`

## Files
- src/store/annotations.ts
- src/store/confidence.ts
- src/store/db.ts
- src/store/registry.ts
- src/store/vectors.ts
