---
paths:
  - "src/server/**"
---

# Server

## Overview
Contains 24 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:263) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:1259) — 1 refs
- **`startHttp`** [function] (src/server/mcp.ts:1267) — 1 refs

## Entry Points
- **`get`** [method] — 24 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `close`, `findByRoot`, `listAll`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks`, `findSymbolById` (+11 more)
- **root**: `has`

## Used By
- **analyzer**: `get`
- **parser**: `get`
- **root**: `get`
- **store**: `get`

## Files
- src/server/mcp.ts
