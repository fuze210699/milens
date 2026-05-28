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
Contains 80 symbols (21 exported) across 7 files.

## Key Symbols
- **`reviewPr`** [function] (src/analyzer/review.ts:101) — 7 refs
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:35) — 5 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 4 refs
- **`analyze`** [function] (src/analyzer/engine.ts:125) — 4 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 4 refs
- **`ReviewResult`** [interface] (src/analyzer/review.ts:17) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:30) — 3 refs
- **`reviewSymbol`** [function] (src/analyzer/review.ts:167) — 2 refs
- **`generateTestPlan`** [function] (src/analyzer/testplan.ts:104) — 2 refs
- **`findCoverageGaps`** [function] (src/analyzer/testplan.ts:175) — 2 refs
- **`analyzeTestImpact`** [function] (src/analyzer/testplan.ts:208) — 2 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:22) — 1 refs
- **`SymbolRisk`** [interface] (src/analyzer/review.ts:8) — 1 refs
- **`RiskLevel`** [type] (src/analyzer/review.ts:6) — 1 refs

## Entry Points
- **`find`** [function] — 22 incoming references
- **`resolve`** [method] — 15 incoming references
- **`reviewPr`** [function] — 7 incoming references
- **`resolveLinksWithStats`** [function] — 5 incoming references
- **`loadAliases`** [function] — 4 incoming references

## Dependencies
- **parser**: `langForFile`, `supportedExtensions`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs` (+6 more)
- **root**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **store**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clearFiles`, `clear`, `isFileUpToDate` (+23 more)
- **test**: `parser`, `lang`

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`, `clear`
- **orchestrator**: `reviewPr`, `ReviewResult`, `SymbolRisk`
- **server**: `reviewPr`, `resolve`, `find`
- **test**: `enrichMetadata`, `resolveLinks`, `resolveLinksWithStats`, `reviewSymbol`, `reviewPr`, `scanFiles`, `generateTestPlan`, `findCoverageGaps` (+5 more)
- **scripts**: `resolve`
- **parser**: `find`, `resolve`
- **store**: `find`, `resolve`

## Files
- src/analyzer/config.ts
- src/analyzer/engine.ts
- src/analyzer/enrich.ts
- src/analyzer/resolver.ts
- src/analyzer/review.ts
- src/analyzer/scanner.ts
- src/analyzer/testplan.ts
