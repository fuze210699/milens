---
paths:
  - "src/ui/**"
---

# Ui

## Working with this area
When working with code in **ui/**, follow these mandatory safety rules:

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
Contains 10 symbols (3 exported) across 1 files.

## Key Symbols
- **`ProgressPhase`** [enum] (src/ui/progress.ts:3) — 3 refs
- **`createProgressReporter`** [function] (src/ui/progress.ts:18) — 2 refs
- **`ProgressReporter`** [interface] (src/ui/progress.ts:10) — 2 refs

## Entry Points
- **`renderBar`** [function] — 3 incoming references
- **`finalize`** [method] — 3 incoming references
- **`ProgressPhase`** [enum] — 3 incoming references
- **`createProgressReporter`** [function] — 2 incoming references
- **`ProgressReporter`** [interface] — 2 incoming references

## Dependencies
- **root**: `AnalysisStats`

## Used By
- **analyzer**: `ProgressPhase`, `ProgressReporter`, `startPhase`, `tick`, `endPhase`, `finalize`
- **root**: `createProgressReporter`, `finalize`

## Files
- src/ui/progress.ts
