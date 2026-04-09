---
paths:
  - "src/server/**"
---

# Server

## Overview
Contains 21 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:236) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:776) — 1 refs
- **`startHttp`** [function] (src/server/mcp.ts:784) — 1 refs

## Entry Points
- **`get`** [method] — 21 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `close`, `findByRoot`, `listAll`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks`, `findSymbolById` (+8 more)
- **root**: `has`

## Used By
- **analyzer**: `get`
- **parser**: `get`
- **root**: `get`
- **store**: `get`

## Files
- src/server/mcp.ts
