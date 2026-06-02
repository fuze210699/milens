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
Contains 128 symbols (29 exported) across 8 files.

## Key Symbols
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:37) — 9 refs
- **`reviewPr`** [function] (src/analyzer/review.ts:280) — 9 refs
- **`analyze`** [function] (src/analyzer/engine.ts:137) — 8 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 6 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:24) — 6 refs
- **`diffResolutions`** [function] (src/analyzer/scope-resolver.ts:736) — 5 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 4 refs
- **`ReviewResult`** [interface] (src/analyzer/review.ts:17) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`resolveWithScopes`** [function] (src/analyzer/scope-resolver.ts:48) — 4 refs
- **`clearTreeCache`** [function] (src/analyzer/engine.ts:28) — 3 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:32) — 3 refs
- **`computeDiffStats`** [function] (src/analyzer/scope-resolver.ts:774) — 3 refs
- **`getCachedTree`** [function] (src/analyzer/engine.ts:25) — 2 refs
- **`reviewSymbol`** [function] (src/analyzer/review.ts:392) — 2 refs

## Entry Points
- **`resolve`** [method] — 23 incoming references
- **`find`** [function] — 14 incoming references
- **`ScopeNode`** [interface] — 11 incoming references
- **`resolveLinksWithStats`** [function] — 9 incoming references
- **`reviewPr`** [function] — 9 incoming references

## Dependencies
- **parser**: `langForFile`, `supportedExtensions`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs` (+9 more)
- **root**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **store**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clearFiles`, `clear`, `isFileUpToDate` (+23 more)
- **test**: `add`, `parser`, `lang`

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`, `clear`
- **orchestrator**: `reviewPr`, `ReviewResult`, `SymbolRisk`
- **server**: `reviewPr`, `analyze`, `resolve`, `clear`
- **test**: `analyze`, `loadAliases`, `getCachedTree`, `clearTreeCache`, `enrichMetadata`, `resolveLinksWithStats`, `resolveLinks`, `reviewSymbol` (+10 more)
- **apps**: `resolve`
- **scripts**: `resolve`
- **parser**: `resolve`
- **store**: `resolve`

## Files
- src/analyzer/config.ts
- src/analyzer/engine.ts
- src/analyzer/enrich.ts
- src/analyzer/resolver.ts
- src/analyzer/review.ts
- src/analyzer/scanner.ts
- src/analyzer/scope-resolver.ts
- src/analyzer/testplan.ts
