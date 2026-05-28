---
paths:
  - "src/analyzer/**"
---

# Analyzer

## Overview
Contains 80 symbols (21 exported) across 7 files.

## Key Symbols
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:35) — 5 refs
- **`reviewPr`** [function] (src/analyzer/review.ts:101) — 5 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 4 refs
- **`analyze`** [function] (src/analyzer/engine.ts:125) — 4 refs
- **`ReviewResult`** [interface] (src/analyzer/review.ts:17) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:30) — 3 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 2 refs
- **`reviewSymbol`** [function] (src/analyzer/review.ts:167) — 2 refs
- **`generateTestPlan`** [function] (src/analyzer/testplan.ts:104) — 2 refs
- **`findCoverageGaps`** [function] (src/analyzer/testplan.ts:175) — 2 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:22) — 1 refs
- **`SymbolRisk`** [interface] (src/analyzer/review.ts:8) — 1 refs
- **`RiskLevel`** [type] (src/analyzer/review.ts:6) — 1 refs
- **`ScannedFile`** [interface] (src/analyzer/scanner.ts:6) — 1 refs

## Entry Points
- **`find`** [function] — 20 incoming references
- **`resolve`** [method] — 14 incoming references
- **`resolveLinksWithStats`** [function] — 5 incoming references
- **`reviewPr`** [function] — 5 incoming references
- **`loadAliases`** [function] — 4 incoming references

## Dependencies
- **parser**: `langForFile`, `supportedExtensions`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs` (+6 more)
- **root**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **store**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clearFiles`, `clear`, `isFileUpToDate` (+23 more)

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`, `clear`
- **orchestrator**: `reviewPr`, `ReviewResult`, `SymbolRisk`
- **server**: `reviewPr`, `resolve`, `find`
- **test**: `resolveLinks`, `resolveLinksWithStats`, `reviewSymbol`, `scanFiles`, `generateTestPlan`, `findCoverageGaps`, `analyze`, `loadAliases` (+1 more)
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
