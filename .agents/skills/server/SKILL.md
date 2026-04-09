---
name: milens-server
description: Code intelligence for the server area — symbols, dependencies, and entry points
---

# Server

## Overview
Contains 27 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:322) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:1544) — 1 refs
- **`startHttp`** [function] (src/server/mcp.ts:1552) — 1 refs

## Entry Points
- **`get`** [method] — 28 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `close`, `logToolUsage`, `findByRoot`, `listAll`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks` (+16 more)
- **root**: `has`
- **analyzer**: `find`

## Used By
- **analyzer**: `get`
- **parser**: `get`
- **root**: `get`
- **store**: `get`

## Files
- src/server/mcp.ts
