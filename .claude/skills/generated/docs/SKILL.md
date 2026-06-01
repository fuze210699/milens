# Docs

## Working with this area
When working with code in **docs/**, follow these mandatory safety rules:

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
Contains 140 symbols (119 exported) across 19 files.

## Key Symbols
- **`Adapter Packs`** [section] (docs/adapters.md:1) — 0 refs
- **`Available Adapters`** [section] (docs/adapters.md:5) — 0 refs
- **`Quick Install`** [section] (docs/adapters.md:17) — 0 refs
- **`Claude Code`** [section] (docs/adapters.md:21) — 0 refs
- **`OpenCode`** [section] (docs/adapters.md:29) — 0 refs
- **`Cursor`** [section] (docs/adapters.md:36) — 0 refs
- **`GitHub Copilot`** [section] (docs/adapters.md:42) — 0 refs
- **`Codex`** [section] (docs/adapters.md:48) — 0 refs
- **`Gemini`** [section] (docs/adapters.md:54) — 0 refs
- **`Zed`** [section] (docs/adapters.md:60) — 0 refs
- **`Automated Install`** [section] (docs/adapters.md:66) — 0 refs
- **`Profile Selection`** [section] (docs/adapters.md:74) — 0 refs
- **`MCP Config Reference`** [section] (docs/adapters.md:86) — 0 refs
- **`Upgrading Milens`** [section] (docs/milens-upgrade.md:1) — 0 refs
- **`Storage Map`** [section] (docs/milens-upgrade.md:5) — 0 refs

## Entry Points
- **`applyFilters`** [function] — 1 incoming references
- **`applyFilters`** [function] — 1 incoming references

## Dependencies
- **store**: `remove`

## Files
- docs/README.md
- docs/adapters.html
- docs/adapters.md
- docs/changelog.html
- docs/compare.html
- docs/github-app.html
- docs/index.html
- docs/learning.html
- docs/milens-upgrade.md
- docs/platforms.html
- docs/pricing.html
- docs/pricing.md
- docs/quickstart.md
- docs/scenarios.html
- docs/security-presets.md
- docs/security.html
- docs/skills.html
- docs/tools.md
- docs/vi-VN/README.md
