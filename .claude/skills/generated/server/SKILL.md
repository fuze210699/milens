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
Contains 113 symbols (22 exported) across 10 files.

## Key Symbols
- **`HookManager`** [class] (src/server/hooks.ts:43) — 9 refs
- **`Deps`** [interface] (src/server/tools/deps.ts:4) — 9 refs
- **`defaultOnSessionStart`** [function] (src/server/hooks.ts:100) — 8 refs
- **`defaultOnSessionEnd`** [function] (src/server/hooks.ts:174) — 8 refs
- **`defaultOnPreCompact`** [function] (src/server/hooks.ts:350) — 8 refs
- **`defaultOnPostCompact`** [function] (src/server/hooks.ts:368) — 8 refs
- **`HookConfig`** [interface] (src/server/hooks.ts:5) — 5 refs
- **`FileWatcher`** [class] (src/server/watcher.ts:50) — 5 refs
- **`defaultOnPreCommit`** [function] (src/server/hooks.ts:237) — 4 refs
- **`defaultOnFileChange`** [function] (src/server/hooks.ts:323) — 4 refs
- **`SessionContext`** [interface] (src/server/hooks.ts:15) — 4 refs
- **`registerAllPrompts`** [function] (src/server/mcp-prompts.ts:637) — 4 refs
- **`createMcpServer`** [function] (src/server/mcp.ts:445) — 4 refs
- **`startStdio`** [function] (src/server/mcp.ts:2289) — 4 refs
- **`startHttp`** [function] (src/server/mcp.ts:2346) — 4 refs

## Entry Points
- **`HookManager`** [class] — 9 incoming references
- **`Deps`** [interface] — 9 incoming references
- **`defaultOnSessionStart`** [function] — 8 incoming references
- **`defaultOnSessionEnd`** [function] — 8 incoming references
- **`defaultOnPreCompact`** [function] — 8 incoming references

## Dependencies
- **store**: `Database`, `AnnotationStore`, `RepoRegistry`, `runDecayPass`, `getCodebaseSummary`, `recall`, `getStats`, `getTestCoverage` (+36 more)
- **root**: `generateCrossRefSection`, `globToRegex`
- **analyzer**: `reviewPr`, `countDependentFiles`, `analyze`
- **parser**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **orchestrator**: `Orchestrator`, `loadSnapshots`, `snapshot`, `persistSnapshots`, `compare`, `runAndFormat`
- **security**: `loadRules`

## Used By
- **root**: `startHttp`, `startStdio`, `HookManager`, `defaultOnSessionStart`, `defaultOnSessionEnd`, `defaultOnPreCompact`, `defaultOnPostCompact`, `enableHook` (+3 more)
- **test**: `defaultOnSessionStart`, `defaultOnPreCompact`, `defaultOnSessionEnd`, `defaultOnPostCompact`, `HookManager`, `HookConfig`, `defaultOnPreCommit`, `defaultOnFileChange` (+19 more)

## Files
- src/server/hooks.ts
- src/server/mcp-prompts.ts
- src/server/mcp.ts
- src/server/test-plan.ts
- src/server/tools/deps.ts
- src/server/tools/resources.ts
- src/server/tools/security.ts
- src/server/tools/session.ts
- src/server/tools/testing.ts
- src/server/watcher.ts
