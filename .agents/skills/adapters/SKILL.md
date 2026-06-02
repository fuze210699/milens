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
Contains 34 symbols (31 exported) across 3 files.

## Key Symbols
- **`Milens — Code Intelligence for Claude Code`** [section] (adapters/claude-code/CLAUDE.md:1) — 0 refs
- **`⚠️ BEFORE ANYTHING ELSE`** [section] (adapters/claude-code/CLAUDE.md:3) — 0 refs
- **`⭐ Core Tools (Use Every Session)`** [section] (adapters/claude-code/CLAUDE.md:19) — 0 refs
- **`🔧 Situational Tools (Use When Needed)`** [section] (adapters/claude-code/CLAUDE.md:32) — 0 refs
- **`Session Workflow`** [section] (adapters/claude-code/CLAUDE.md:46) — 0 refs
- **`Edit Safety (Mandatory)`** [section] (adapters/claude-code/CLAUDE.md:54) — 0 refs
- **`Tool Selection`** [section] (adapters/claude-code/CLAUDE.md:70) — 0 refs
- **`Reference`** [section] (adapters/claude-code/CLAUDE.md:76) — 0 refs
- **`Milens — Code Intelligence for OpenCode`** [section] (adapters/opencode/AGENTS.md:1) — 0 refs
- **`⚠️ BEFORE ANYTHING ELSE`** [section] (adapters/opencode/AGENTS.md:3) — 0 refs
- **`⭐ Core Tools (Use Every Session)`** [section] (adapters/opencode/AGENTS.md:19) — 0 refs
- **`🔧 Situational Tools (Use When Needed)`** [section] (adapters/opencode/AGENTS.md:32) — 0 refs
- **`Session Workflow`** [section] (adapters/opencode/AGENTS.md:46) — 0 refs
- **`Edit Safety (Mandatory)`** [section] (adapters/opencode/AGENTS.md:54) — 0 refs
- **`Tool Selection`** [section] (adapters/opencode/AGENTS.md:70) — 0 refs

## Files
- adapters/README.md
- adapters/claude-code/CLAUDE.md
- adapters/opencode/AGENTS.md
