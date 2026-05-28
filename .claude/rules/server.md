---
paths:
  - "src/server/**"
---

# Server

## Working with this area
When working with code in **server/**, follow these mandatory safety rules:

### Before editing any symbol in this area:
1. Call `mcp_milens_impact({target: "<symbol>", repo: "<workspaceRoot>"})` — check blast radius
2. If depth-1 dependents > 5 → **STOP and warn** before proceeding
3. Call `mcp_milens_context({name: "<symbol>", repo: "<workspaceRoot>"})` — see all callers/callees

### Before committing changes in this area:
1. Call `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` — verify scope
2. If unexpected files changed → **STOP and report**

### Key tools for this area:
| Task | Tool |
|---|---|
| Find all references | `mcp_milens_context` |
| Check edit safety | `mcp_milens_edit_check` |
| Text search across files | `mcp_milens_grep` |
| See file symbols | `mcp_milens_get_file_symbols` |

## Overview
Contains 81 symbols (15 exported) across 4 files.

## Key Symbols
- **`HookManager`** [class] (src/server/hooks.ts:43) — 6 refs
- **`HookConfig`** [interface] (src/server/hooks.ts:5) — 5 refs
- **`defaultOnSessionStart`** [function] (src/server/hooks.ts:100) — 4 refs
- **`defaultOnSessionEnd`** [function] (src/server/hooks.ts:164) — 4 refs
- **`defaultOnPreCommit`** [function] (src/server/hooks.ts:227) — 4 refs
- **`defaultOnFileChange`** [function] (src/server/hooks.ts:313) — 4 refs
- **`defaultOnPreCompact`** [function] (src/server/hooks.ts:340) — 4 refs
- **`defaultOnPostCompact`** [function] (src/server/hooks.ts:358) — 4 refs
- **`SessionContext`** [interface] (src/server/hooks.ts:15) — 4 refs
- **`registerAllPrompts`** [function] (src/server/mcp-prompts.ts:637) — 4 refs
- **`createMcpServer`** [function] (src/server/mcp.ts:369) — 4 refs
- **`generateTestPlan`** [function] (src/server/test-plan.ts:14) — 4 refs
- **`startStdio`** [function] (src/server/mcp.ts:2716) — 2 refs
- **`startHttp`** [function] (src/server/mcp.ts:2724) — 2 refs
- **`TestPlan`** [interface] (src/server/test-plan.ts:3) — 1 refs

## Entry Points
- **`get`** [method] — 9 incoming references
- **`HookManager`** [class] — 6 incoming references
- **`loadConfig`** [method] — 5 incoming references
- **`HookConfig`** [interface] — 5 incoming references
- **`defaultOnSessionStart`** [function] — 4 incoming references

## Dependencies
- **store**: `Database`, `AnnotationStore`, `RepoRegistry`, `runDecayPass`, `getCodebaseSummary`, `recall`, `close`, `getStats` (+37 more)
- **analyzer**: `reviewPr`, `resolve`, `find`
- **parser**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **security**: `loadRules`
- **orchestrator**: `Orchestrator`, `snapshot`, `compare`, `runAndFormat`
- **root**: `has`
- **test**: `dbPath`

## Used By
- **root**: `startHttp`, `startStdio`, `HookManager`, `get`, `enableHook`, `loadConfig`, `saveConfig`, `disableHook`
- **test**: `HookManager`, `HookConfig`, `defaultOnSessionStart`, `defaultOnSessionEnd`, `defaultOnPreCommit`, `defaultOnFileChange`, `defaultOnPreCompact`, `defaultOnPostCompact` (+10 more)

## Files
- src/server/hooks.ts
- src/server/mcp-prompts.ts
- src/server/mcp.ts
- src/server/test-plan.ts
