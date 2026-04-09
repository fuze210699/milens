---
applyTo: "src/analyzer/**"
---

# Analyzer

## Overview
Contains 37 symbols (8 exported) across 5 files.

## Key Symbols
- **`resolveLinksWithStats`** [function] (src/analyzer/resolver.ts:27) — 3 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 2 refs
- **`loadAliases`** [function] (src/analyzer/config.ts:10) — 1 refs
- **`analyze`** [function] (src/analyzer/engine.ts:23) — 1 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 1 refs
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:22) — 1 refs
- **`ResolutionResult`** [interface] (src/analyzer/resolver.ts:14) — 0 refs
- **`ScannedFile`** [interface] (src/analyzer/scanner.ts:6) — 0 refs

## Entry Points
- **`find`** [function] — 13 incoming references
- **`resolveLinksWithStats`** [function] — 3 incoming references
- **`readTsConfigPaths`** [function] — 2 incoming references
- **`followReExportChain`** [function] — 2 incoming references
- **`scanFiles`** [function] — 2 incoming references

## Dependencies
- **store**: `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData`, `insertSymbol` (+6 more)
- **parser**: `langForFile`, `getParser`, `loadLanguage`, `resolveImport`, `clearQueryCache`, `extractVueScript`, `extractFromTree`, `extractVueTemplateRefs` (+1 more)
- **server**: `get`
- **root**: `has`

## Used By
- **parser**: `find`
- **server**: `find`
- **store**: `find`
- **test**: `find`

## Files
- src/analyzer/config.ts
- src/analyzer/engine.ts
- src/analyzer/enrich.ts
- src/analyzer/resolver.ts
- src/analyzer/scanner.ts
