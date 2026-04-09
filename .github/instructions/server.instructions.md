---
applyTo: "src/server/**"
---

# Server

## Overview
Contains 24 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:272) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:1475) — 1 refs
- **`startHttp`** [function] (src/server/mcp.ts:1483) — 1 refs

## Entry Points
- **`get`** [method] — 27 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `close`, `findByRoot`, `listAll`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks`, `findSymbolById` (+15 more)
- **root**: `has`
- **analyzer**: `find`

## Used By
- **analyzer**: `get`
- **parser**: `get`
- **root**: `get`
- **store**: `get`

## Files
- src/server/mcp.ts
