# Store

## Working with this area
When working with code in **store/**, follow these mandatory safety rules:

### Before editing any symbol in this area:
1. Call `mcp_milens_impact({target: "<symbol>", repo: "<workspaceRoot>"})` — check blast radius
2. If depth-1 dependents > 5 → **STOP and warn** before proceeding
3. Call `mcp_milens_context({name: "<symbol>", repo: "<workspaceRoot>"})` — see all callers/callees

### Before committing changes in this area:
1. Call `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` — verify scope
2. If unexpected files changed → **STOP and report**

### Key tools for this area:
| Task | Tool |
|---|---|
| Find all references | `mcp_milens_context` |
| Check edit safety | `mcp_milens_edit_check` |
| Text search across files | `mcp_milens_grep` |
| See file symbols | `mcp_milens_get_file_symbols` |

## Overview
Contains 135 symbols (15 exported) across 5 files.

## Key Symbols
- **`Database`** [class] (src/store/db.ts:10) — 77 refs
- **`AnnotationStore`** [class] (src/store/annotations.ts:10) — 19 refs
- **`RepoRegistry`** [class] (src/store/registry.ts:18) — 13 refs
- **`runDecayPass`** [function] (src/store/confidence.ts:85) — 6 refs
- **`buildEmbeddingText`** [function] (src/store/vectors.ts:250) — 4 refs
- **`TfIdfProvider`** [class] (src/store/vectors.ts:44) — 4 refs
- **`EmbeddingStore`** [class] (src/store/vectors.ts:170) — 4 refs
- **`decayConfidence`** [function] (src/store/confidence.ts:22) — 3 refs
- **`boostConfidence`** [function] (src/store/confidence.ts:6) — 2 refs
- **`getStaleAnnotations`** [function] (src/store/confidence.ts:38) — 2 refs
- **`promoteSecurityAnnotations`** [function] (src/store/confidence.ts:48) — 2 refs
- **`autoPromote`** [function] (src/store/confidence.ts:106) — 2 refs
- **`EmbeddingProvider`** [interface] (src/store/vectors.ts:15) — 2 refs
- **`NeuralProvider`** [class] (src/store/vectors.ts:122) — 0 refs
- **`SimilarResult`** [interface] (src/store/vectors.ts:23) — 0 refs

## Entry Points
- **`Database`** [class] — 77 incoming references
- **`close`** [method] — 30 incoming references
- **`get`** [method] — 22 incoming references
- **`AnnotationStore`** [class] — 19 incoming references
- **`rowToSymbol`** [function] — 13 incoming references

## Dependencies
- **root**: `Annotation`, `AnnotationKey`, `Session`, `EvolutionEvent`, `CodeSymbol`, `SymbolLink`, `RepoEntry`, `has` (+1 more)
- **analyzer**: `find`, `resolve`
- **test**: `dbPath`

## Used By
- **root**: `Database`, `RepoRegistry`, `AnnotationStore`, `runDecayPass`, `getIncomingLinks`, `getAllSymbols`, `getCodebaseSummary`, `register` (+25 more)
- **analyzer**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clearFiles`, `clear`, `isFileUpToDate` (+23 more)
- **orchestrator**: `Database`, `findSymbolByName`, `findUpstream`, `clear`, `getTestCoverageGaps`, `findDeadCode`, `close`
- **server**: `Database`, `AnnotationStore`, `RepoRegistry`, `runDecayPass`, `getCodebaseSummary`, `recall`, `close`, `getStats` (+37 more)
- **test**: `Database`, `AnnotationStore`, `RepoRegistry`, `boostConfidence`, `decayConfidence`, `getStaleAnnotations`, `promoteSecurityAnnotations`, `runDecayPass` (+76 more)
- **apps**: `remove`, `Database`, `getCodebaseSummary`, `close`
- **docs**: `remove`
- **parser**: `load`

## Files
- src/store/annotations.ts
- src/store/confidence.ts
- src/store/db.ts
- src/store/registry.ts
- src/store/vectors.ts
