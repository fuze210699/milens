---
name: milens-analyzer
description: Code intelligence for the analyzer area — symbols, dependencies, and entry points
---

# Analyzer

## Overview
Contains 21 symbols (5 exported) across 4 files.

## Key Symbols
- **`resolveLinks`** [function] (src/analyzer/resolver.ts:13) — 2 refs
- **`scanFiles`** [function] (src/analyzer/scanner.ts:11) — 2 refs
- **`analyze`** [function] (src/analyzer/engine.ts:23) — 1 refs
- **`enrichMetadata`** [function] (src/analyzer/enrich.ts:21) — 1 refs
- **`ScannedFile`** [interface] (src/analyzer/scanner.ts:6) — 0 refs

## Entry Points
- **`resolveLinks`** [function] — 2 incoming references
- **`scanFiles`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`analyze`** [function] — 1 incoming references
- **`parseFile`** [function] — 1 incoming references

## Dependencies
- **store**: `clear`, `isFileUpToDate`, `upsertFileHash`, `getSymbolsByFile`, `transaction`, `clearSymbolsAndLinks`, `deleteFileData`, `insertSymbol` (+4 more)
- **parser**: `langForFile`, `getParser`, `loadLanguage`, `resolveImport`, `clearQueryCache`, `extractVueScript`, `extractFromTree`, `extractVueTemplateRefs` (+1 more)
- **server**: `get`
- **root**: `has`

## Files
- src/analyzer/engine.ts
- src/analyzer/enrich.ts
- src/analyzer/resolver.ts
- src/analyzer/scanner.ts
