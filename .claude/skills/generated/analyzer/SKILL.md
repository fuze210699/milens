# Analyzer

## Overview
Contains 51 symbols (8 exported) across 5 files.

## Key Symbols
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:35) — 5 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 4 refs
- **`analyze`** [function] (src/analyzer/engine.ts:103) — 4 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 4 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:30) — 3 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 2 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:22) — 0 refs
- **`ScannedFile`** [interface] (src/analyzer/scanner.ts:6) — 0 refs

## Entry Points
- **`find`** [function] — 15 incoming references
- **`resolve`** [method] — 10 incoming references
- **`resolveLinksWithStats`** [function] — 5 incoming references
- **`loadAliases`** [function] — 4 incoming references
- **`analyze`** [function] — 4 incoming references

## Dependencies
- **parser**: `langForFile`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs`, `extractHtmlScripts` (+5 more)
- **store**: `Database`, `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData` (+7 more)
- **root**: `CodeSymbol`, `ExtractionResult`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding` (+7 more)
- **server**: `get`

## Used By
- **root**: `loadAliases`, `analyze`, `resolve`
- **test**: `resolveLinks`, `resolveLinksWithStats`, `scanFiles`, `analyze`, `loadAliases`, `find`
- **scripts**: `resolve`
- **parser**: `find`, `resolve`
- **server**: `resolve`, `find`
- **store**: `find`, `resolve`

## Files
- src/analyzer/config.ts
- src/analyzer/engine.ts
- src/analyzer/enrich.ts
- src/analyzer/resolver.ts
- src/analyzer/scanner.ts
