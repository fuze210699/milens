---
name: milens-server
description: Code intelligence for the server area — symbols, dependencies, and entry points
---

# Server

## Overview
Contains 40 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:395) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:2310) — 2 refs
- **`startHttp`** [function] (src/server/mcp.ts:2318) — 2 refs

## Entry Points
- **`get`** [method] — 6 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `getStats`, `getDomainStats`, `close` (+32 more)
- **analyzer**: `reviewPr`, `reviewSymbol`, `generateTestPlan`, `findCoverageGaps`, `analyzeTestImpact`, `resolve`, `find`
- **parser**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **root**: `has`

## Used By
- **root**: `startHttp`, `startStdio`

## Files
- src/server/mcp.ts
