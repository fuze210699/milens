---
applyTo: "src/server/**"
---

# Server

## Overview
Contains 81 symbols (15 exported) across 4 files.

## Key Symbols
- **`HookManager`** [class] (src/server/hooks.ts:43) — 6 refs
- **`HookConfig`** [interface] (src/server/hooks.ts:5) — 5 refs
- **`defaultOnSessionStart`** [function] (src/server/hooks.ts:100) — 2 refs
- **`defaultOnSessionEnd`** [function] (src/server/hooks.ts:164) — 2 refs
- **`defaultOnPreCommit`** [function] (src/server/hooks.ts:227) — 2 refs
- **`defaultOnFileChange`** [function] (src/server/hooks.ts:313) — 2 refs
- **`defaultOnPreCompact`** [function] (src/server/hooks.ts:340) — 2 refs
- **`defaultOnPostCompact`** [function] (src/server/hooks.ts:358) — 2 refs
- **`SessionContext`** [interface] (src/server/hooks.ts:15) — 2 refs
- **`registerAllPrompts`** [function] (src/server/mcp-prompts.ts:637) — 2 refs
- **`createMcpServer`** [function] (src/server/mcp.ts:369) — 2 refs
- **`startStdio`** [function] (src/server/mcp.ts:2716) — 2 refs
- **`startHttp`** [function] (src/server/mcp.ts:2724) — 2 refs
- **`generateTestPlan`** [function] (src/server/test-plan.ts:14) — 2 refs
- **`TestPlan`** [interface] (src/server/test-plan.ts:3) — 1 refs

## Entry Points
- **`get`** [method] — 8 incoming references
- **`HookManager`** [class] — 6 incoming references
- **`loadConfig`** [method] — 5 incoming references
- **`HookConfig`** [interface] — 5 incoming references
- **`saveConfig`** [method] — 4 incoming references

## Dependencies
- **store**: `Database`, `AnnotationStore`, `RepoRegistry`, `runDecayPass`, `getCodebaseSummary`, `recall`, `close`, `getStats` (+36 more)
- **analyzer**: `reviewPr`, `resolve`, `find`
- **parser**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **security**: `loadRules`
- **orchestrator**: `Orchestrator`, `snapshot`, `compare`, `runAndFormat`
- **root**: `has`
- **test**: `dbPath`

## Used By
- **root**: `startHttp`, `startStdio`, `HookManager`, `get`, `enableHook`, `loadConfig`, `saveConfig`, `disableHook`
- **test**: `HookManager`, `HookConfig`, `loadConfig`, `saveConfig`, `enableHook`, `disableHook`, `getProjectConfigPath`

## Files
- src/server/hooks.ts
- src/server/mcp-prompts.ts
- src/server/mcp.ts
- src/server/test-plan.ts
