---
name: milens-analyzer
description: Code intelligence for the analyzer area — symbols, dependencies, and entry points
---

# Analyzer

## Overview
Contains 79 symbols (21 exported) across 7 files.

## Key Symbols
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:35) — 5 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 4 refs
- **`analyze`** [function] (src/analyzer/engine.ts:106) — 4 refs
- **`reviewSymbol`** [function] (src/analyzer/review.ts:167) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`generateTestPlan`** [function] (src/analyzer/testplan.ts:104) — 4 refs
- **`findCoverageGaps`** [function] (src/analyzer/testplan.ts:175) — 4 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:30) — 3 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 2 refs
- **`reviewPr`** [function] (src/analyzer/review.ts:101) — 2 refs
- **`analyzeTestImpact`** [function] (src/analyzer/testplan.ts:208) — 2 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:22) — 1 refs
- **`ReviewResult`** [interface] (src/analyzer/review.ts:17) — 1 refs
- **`RiskLevel`** [type] (src/analyzer/review.ts:6) — 1 refs
- **`TestImpactResult`** [interface] (src/analyzer/testplan.ts:35) — 1 refs

## Entry Points
- **`find`** [function] — 17 incoming references
- **`resolve`** [method] — 10 incoming references
- **`resolveLinksWithStats`** [function] — 5 incoming references
- **`loadAliases`** [function] — 4 incoming references
- **`analyze`** [function] — 4 incoming references

## Dependencies
- **parser**: `langForFile`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs`, `extractHtmlScripts` (+6 more)
- **root**: `isTestFile`, `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding` (+8 more)
- **store**: `Database`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `get`, `clear`, `isFileUpToDate`, `upsertFileHash` (+23 more)

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`
- **server**: `reviewPr`, `reviewSymbol`, `generateTestPlan`, `findCoverageGaps`, `analyzeTestImpact`, `resolve`, `find`
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
