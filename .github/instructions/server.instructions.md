---
applyTo: "src/server/**"
---

# Server

## Overview
Contains 33 symbols (3 exported) across 1 files.

## Key Symbols
- **`createMcpServer`** [function] (src/server/mcp.ts:360) — 3 refs
- **`startStdio`** [function] (src/server/mcp.ts:1591) — 2 refs
- **`startHttp`** [function] (src/server/mcp.ts:1599) — 2 refs

## Entry Points
- **`get`** [method] — 32 incoming references
- **`createMcpServer`** [function] — 3 incoming references
- **`fmtSymbol`** [function] — 2 incoming references
- **`walk`** [function] — 2 incoming references
- **`resolveRoot`** [function] — 2 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `getStats`, `getDomainStats`, `close`, `logToolUsage`, `findByRoot`, `listAll` (+18 more)
- **root**: `has`
- **analyzer**: `resolve`, `find`

## Used By
- **root**: `createMcpServer`, `startStdio`, `startHttp`, `get`
- **analyzer**: `get`
- **parser**: `get`
- **store**: `get`

## Files
- src/server/mcp.ts
