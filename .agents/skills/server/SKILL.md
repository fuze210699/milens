---
name: milens-server
description: Code intelligence for the server area — symbols, dependencies, and entry points
---

# Server

## Overview
Contains 21 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:227) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:656) — 1 refs
- **`startHttp`** [function] (src/server/mcp.ts:664) — 1 refs

## Entry Points
- **`get`** [method] — 18 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`createMcpServer`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `close`, `findByRoot`, `findDbPath`, `searchSymbols`, `findSymbolByName`, `getIncomingLinks`, `findSymbolById`, `getOutgoingLinks` (+7 more)
- **root**: `has`

## Used By
- **analyzer**: `get`
- **parser**: `get`
- **root**: `get`
- **store**: `get`

## Files
- src/server/mcp.ts
