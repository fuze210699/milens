---
paths:
  - "scripts/**"
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
Contains 77 symbols (0 exported) across 6 files.

## Entry Points
- **`ghApi`** [function] — 4 incoming references
- **`detectBreakingFromLabels`** [function] — 4 incoming references
- **`exec`** [function] — 3 incoming references
- **`branch`** [variable] — 3 incoming references
- **`detectTypeFromBranch`** [function] — 3 incoming references

## Dependencies
- **analyzer**: `resolve`

## Used By
- **apps**: `parseArgs`, `generatePrPayload`
- **test**: `detectTypeFromBranch`, `detectScopeFromBranch`, `detectBreakingFromBranch`, `detectBreakingFromLabels`, `slugify`, `parseArgs`, `generateTitle`, `generateBody` (+1 more)

## Files
- scripts/build-standalone.mjs
- scripts/check-console.mjs
- scripts/create-pr.cjs
- scripts/gen-build-info.mjs
- scripts/pr-generator.cjs
- scripts/smoke-test.mjs
