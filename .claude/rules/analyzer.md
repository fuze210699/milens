---
paths:
  - "src/analyzer/**"
---

# Analyzer

## Working with this area
When working with code in **analyzer/**, follow these mandatory safety rules:

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
Contains 119 symbols (24 exported) across 8 files.

## Key Symbols
- **`analyze`** [function] (src/analyzer/engine.ts:139) — 10 refs
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:37) — 9 refs
- **`reviewPr`** [function] (src/analyzer/review.ts:244) — 9 refs
- **`countDependentFiles`** [function] (src/analyzer/risk.ts:13) — 9 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 6 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:24) — 6 refs
- **`classifyRisk`** [function] (src/analyzer/risk.ts:33) — 5 refs
- **`scoreSymbolRisk`** [function] (src/analyzer/risk.ts:41) — 5 refs
- **`diffResolutions`** [function] (src/analyzer/scope-resolver.ts:768) — 5 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 4 refs
- **`ReviewResult`** [interface] (src/analyzer/review.ts:19) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`resolveWithScopes`** [function] (src/analyzer/scope-resolver.ts:48) — 4 refs
- **`clearTreeCache`** [function] (src/analyzer/engine.ts:29) — 3 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:32) — 3 refs

## Entry Points
- **`ScopeNode`** [interface] — 11 incoming references
- **`analyze`** [function] — 10 incoming references
- **`resolveLinksWithStats`** [function] — 9 incoming references
- **`reviewPr`** [function] — 9 incoming references
- **`countDependentFiles`** [function] — 9 incoming references

## Dependencies
- **parser**: `langForFile`, `supportedExtensions`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs` (+9 more)
- **root**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+7 more)
- **store**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction` (+18 more)
- **ui**: `ProgressPhase`, `ProgressReporter`, `startPhase`, `tick`, `endPhase`, `finalize`

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`
- **orchestrator**: `reviewPr`, `ReviewResult`, `SymbolRisk`
- **server**: `reviewPr`, `countDependentFiles`, `analyze`
- **test**: `analyze`, `loadAliases`, `getCachedTree`, `clearTreeCache`, `enrichMetadata`, `resolveLinksWithStats`, `resolveLinks`, `reviewSymbol` (+9 more)
- **apps**: `resolve`
- **scripts**: `resolve`
- **parser**: `resolve`

## Files
- src/analyzer/config.ts
- src/analyzer/engine.ts
- src/analyzer/enrich.ts
- src/analyzer/resolver.ts
- src/analyzer/review.ts
- src/analyzer/risk.ts
- src/analyzer/scanner.ts
- src/analyzer/scope-resolver.ts
