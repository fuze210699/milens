---
applyTo: "src/server/**"
---

# Server

## Overview
Contains 74 symbols (12 exported) across 4 files.

## Key Symbols
- **`HookConfig`** [interface] (src/server/hooks.ts:5) — 3 refs
- **`HookManager`** [class] (src/server/hooks.ts:43) — 2 refs
- **`SessionContext`** [interface] (src/server/hooks.ts:15) — 2 refs
- **`registerAllPrompts`** [function] (src/server/mcp-prompts.ts:637) — 2 refs
- **`createMcpServer`** [function] (src/server/mcp.ts:367) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:2289) — 2 refs
- **`startHttp`** [function] (src/server/mcp.ts:2297) — 2 refs
- **`generateTestPlan`** [function] (src/server/test-plan.ts:14) — 2 refs
- **`defaultOnSessionStart`** [function] (src/server/hooks.ts:100) — 0 refs
- **`defaultOnSessionEnd`** [function] (src/server/hooks.ts:164) — 0 refs
- **`defaultOnPreCommit`** [function] (src/server/hooks.ts:227) — 0 refs
- **`TestPlan`** [interface] (src/server/test-plan.ts:3) — 0 refs

## Entry Points
- **`get`** [method] — 8 incoming references
- **`loadConfig`** [method] — 3 incoming references
- **`saveConfig`** [method] — 3 incoming references
- **`HookConfig`** [interface] — 3 incoming references
- **`HookManager`** [class] — 2 incoming references

## Dependencies
- **store**: `Database`, `AnnotationStore`, `RepoRegistry`, `getCodebaseSummary`, `recall`, `close`, `getStats`, `getTestCoverage` (+33 more)
- **analyzer**: `reviewPr`, `resolve`, `find`
- **parser**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **security**: `loadRules`
- **root**: `has`

## Used By
- **root**: `startHttp`, `startStdio`, `HookManager`, `get`, `enableHook`, `loadConfig`, `saveConfig`, `disableHook`

## Files
- src/server/hooks.ts
- src/server/mcp-prompts.ts
- src/server/mcp.ts
- src/server/test-plan.ts
