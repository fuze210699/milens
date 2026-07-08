---
name: milens-adapters
description: Code intelligence for the adapters area — symbols, dependencies, and entry points
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

## Overview
Contains 60 symbols (54 exported) across 6 files.

## Key Symbols
- **`Milens Adapter Packs`** [section] (adapters/README.md:1) — 0 refs
- **`What is milens?`** [section] (adapters/README.md:5) — 0 refs
- **`Available Adapters`** [section] (adapters/README.md:9) — 0 refs
- **`Installation`** [section] (adapters/README.md:21) — 0 refs
- **`Claude Code`** [section] (adapters/README.md:23) — 0 refs
- **`OpenCode`** [section] (adapters/README.md:54) — 0 refs
- **`Codex`** [section] (adapters/README.md:61) — 0 refs
- **`Cursor`** [section] (adapters/README.md:67) — 0 refs
- **`GitHub Copilot`** [section] (adapters/README.md:74) — 0 refs
- **`Gemini`** [section] (adapters/README.md:81) — 0 refs
- **`Zed`** [section] (adapters/README.md:87) — 0 refs
- **`Verification`** [section] (adapters/README.md:93) — 0 refs
- **`Index Maintenance`** [section] (adapters/README.md:101) — 0 refs
- **`All Tools Available`** [section] (adapters/README.md:109) — 0 refs
- **`Safety Rules (applies to all harnesses)`** [section] (adapters/README.md:127) — 0 refs

## Files
- adapters/README.md
- adapters/claude-code/CLAUDE.md
- adapters/codex/.codex/codex.md
- adapters/copilot/.github/copilot-instructions.md
- adapters/gemini/.gemini/context.md
- adapters/opencode/AGENTS.md
