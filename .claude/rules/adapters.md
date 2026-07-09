---
paths:
  - "adapters/**"
---

# Adapters

## Working with this area
When working with code in **adapters/**, follow these mandatory safety rules:

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
Contains 61 symbols (55 exported) across 6 files.

## Key Symbols
- **`Milens Adapter Packs`** [section] (adapters/README.md:1) — 0 refs
- **`What is milens?`** [section] (adapters/README.md:5) — 0 refs
- **`Available Adapters`** [section] (adapters/README.md:9) — 0 refs
- **`Installation`** [section] (adapters/README.md:21) — 0 refs
- **`Claude Code`** [section] (adapters/README.md:23) — 0 refs
- **`Claude Code — via `/plugin install` (marketplace)`** [section] (adapters/README.md:50) — 0 refs
- **`OpenCode`** [section] (adapters/README.md:65) — 0 refs
- **`Codex`** [section] (adapters/README.md:72) — 0 refs
- **`Cursor`** [section] (adapters/README.md:78) — 0 refs
- **`GitHub Copilot`** [section] (adapters/README.md:85) — 0 refs
- **`Gemini`** [section] (adapters/README.md:92) — 0 refs
- **`Zed`** [section] (adapters/README.md:98) — 0 refs
- **`Verification`** [section] (adapters/README.md:104) — 0 refs
- **`Index Maintenance`** [section] (adapters/README.md:112) — 0 refs
- **`All Tools Available`** [section] (adapters/README.md:120) — 0 refs

## Files
- adapters/README.md
- adapters/claude-code/CLAUDE.md
- adapters/codex/.codex/codex.md
- adapters/copilot/.github/copilot-instructions.md
- adapters/gemini/.gemini/context.md
- adapters/opencode/AGENTS.md
