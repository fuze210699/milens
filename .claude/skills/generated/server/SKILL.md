# Server

## Overview
Contains 40 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:423) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:2334) — 2 refs
- **`startHttp`** [function] (src/server/mcp.ts:2342) — 2 refs

## Entry Points
- **`get`** [method] — 7 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `getStats`, `getDomainStats`, `getAllSymbols` (+35 more)
- **root**: `isTestFile`, `has`
- **analyzer**: `reviewPr`, `reviewSymbol`, `generateTestPlan`, `findCoverageGaps`, `analyzeTestImpact`, `resolve`, `find`
- **parser**: `getParser`, `loadLanguage`, `ALL_LANGS`

## Used By
- **root**: `startHttp`, `startStdio`

## Files
- src/server/mcp.ts
