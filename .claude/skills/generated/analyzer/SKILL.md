# Analyzer

## Overview
Contains 81 symbols (21 exported) across 7 files.

## Key Symbols
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:35) — 5 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 4 refs
- **`analyze`** [function] (src/analyzer/engine.ts:105) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:30) — 3 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 2 refs
- **`reviewPr`** [function] (src/analyzer/review.ts:103) — 2 refs
- **`reviewSymbol`** [function] (src/analyzer/review.ts:169) — 2 refs
- **`generateTestPlan`** [function] (src/analyzer/testplan.ts:111) — 2 refs
- **`findCoverageGaps`** [function] (src/analyzer/testplan.ts:182) — 2 refs
- **`analyzeTestImpact`** [function] (src/analyzer/testplan.ts:215) — 2 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:22) — 1 refs
- **`ReviewResult`** [interface] (src/analyzer/review.ts:16) — 1 refs
- **`RiskLevel`** [type] (src/analyzer/review.ts:5) — 1 refs
- **`TestImpactResult`** [interface] (src/analyzer/testplan.ts:34) — 1 refs

## Entry Points
- **`find`** [function] — 16 incoming references
- **`resolve`** [method] — 10 incoming references
- **`resolveLinksWithStats`** [function] — 5 incoming references
- **`loadAliases`** [function] — 4 incoming references
- **`analyze`** [function] — 4 incoming references

## Dependencies
- **parser**: `langForFile`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs`, `extractHtmlScripts` (+6 more)
- **store**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clear`, `isFileUpToDate`, `upsertFileHash` (+22 more)
- **root**: `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding` (+7 more)

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`
- **server**: `reviewPr`, `reviewSymbol`, `generateTestPlan`, `findCoverageGaps`, `analyzeTestImpact`, `resolve`, `find`
- **test**: `resolveLinks`, `resolveLinksWithStats`, `scanFiles`, `analyze`, `loadAliases`, `find`
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
