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

### Edit-safety enforcement
A `PreToolUse` hook (warn mode by default) reminds you if no milens safety check (`impact`/`context`/`overview`/`guard_edit_check`/`edit_check`/`smart_context`) was called before an `Edit`/`Write`/`MultiEdit`. Opt-in strict deny mode is available via `milens hooks guard-set-mode --mode strict`. Both modes consume the check after one edit. See `.milens/hook-state/config.json`. Known caveat: the underlying `PreToolUse` deny mechanism has at least one reliability issue (https://github.com/anthropics/claude-code/issues/4362).

## Overview
Contains 131 symbols (29 exported) across 11 files.

## Key Symbols
- **`HookManager`** [class] (src/server/hooks.ts:43) — 9 refs
- **`Deps`** [interface] (src/server/tools/deps.ts:4) — 9 refs
- **`defaultOnSessionStart`** [function] (src/server/hooks.ts:100) — 8 refs
- **`defaultOnSessionEnd`** [function] (src/server/hooks.ts:174) — 8 refs
- **`defaultOnPreCompact`** [function] (src/server/hooks.ts:350) — 8 refs
- **`defaultOnPostCompact`** [function] (src/server/hooks.ts:368) — 8 refs
- **`HookConfig`** [interface] (src/server/hooks.ts:5) — 5 refs
- **`FileWatcher`** [class] (src/server/watcher.ts:50) — 5 refs
- **`readMode`** [function] (src/server/guard-hook.ts:38) — 4 refs
- **`writeMode`** [function] (src/server/guard-hook.ts:50) — 4 refs
- **`handleMarkChecked`** [function] (src/server/guard-hook.ts:147) — 4 refs
- **`handleCheckEdit`** [function] (src/server/guard-hook.ts:161) — 4 refs
- **`defaultOnPreCommit`** [function] (src/server/hooks.ts:237) — 4 refs
- **`defaultOnFileChange`** [function] (src/server/hooks.ts:323) — 4 refs
- **`SessionContext`** [interface] (src/server/hooks.ts:15) — 4 refs

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
- **root**: `startHttp`, `startStdio`, `HookManager`, `defaultOnSessionStart`, `defaultOnSessionEnd`, `defaultOnPreCompact`, `defaultOnPostCompact`, `handleMarkChecked` (+6 more)
- **test**: `defaultOnSessionStart`, `defaultOnPreCompact`, `defaultOnSessionEnd`, `defaultOnPostCompact`, `markChecked`, `checkEdit`, `readMode`, `writeMode` (+25 more)

## Files
- src/server/guard-hook.ts
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
