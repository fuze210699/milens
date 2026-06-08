---
applyTo: "scripts/**"
---

# Scripts

## Working with this area
When working with code in **scripts/**, follow these mandatory safety rules:

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
Contains 47 symbols (0 exported) across 3 files.

## Entry Points
- **`root`** [variable] — 37 incoming references
- **`version`** [variable] — 4 incoming references
- **`ROOT`** [variable] — 2 incoming references
- **`outDir`** [variable] — 2 incoming references
- **`main`** [function] — 2 incoming references

## Dependencies
- **analyzer**: `resolve`
- **store**: `Database`, `getCodebaseSummary`, `close`

## Used By
- **docs**: `main`
- **analyzer**: `root`
- **root**: `version`, `outDir`, `root`
- **parser**: `root`
- **security**: `version`
- **server**: `root`
- **test**: `root`

## Files
- scripts/build-standalone.mjs
- scripts/generate-release-stats.js
- scripts/update-docs.js
