---
name: milens-apps
description: Code intelligence for the apps area — symbols, dependencies, and entry points
---

# Apps

## Working with this area
When working with code in **apps/**, follow these mandatory safety rules:

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
Contains 54 symbols (12 exported) across 10 files.

## Key Symbols
- **`Milens Desktop Dashboard`** [section] (apps/dashboard/README.md:1) — 0 refs
- **`Features`** [section] (apps/dashboard/README.md:5) — 0 refs
- **`Development`** [section] (apps/dashboard/README.md:13) — 0 refs
- **`Build`** [section] (apps/dashboard/README.md:19) — 0 refs
- **`Milens GitHub App`** [section] (apps/github/README.md:1) — 0 refs
- **`Features`** [section] (apps/github/README.md:5) — 0 refs
- **`Deployment`** [section] (apps/github/README.md:10) — 0 refs
- **`Local Development`** [section] (apps/github/README.md:15) — 0 refs
- **`AgentsMdGenerator`** [class] (apps/github/generators/agents-md.js:1) — 0 refs
- **`SecurityGenerator`** [class] (apps/github/generators/security.js:1) — 0 refs
- **`SkillsGenerator`** [class] (apps/github/generators/skills.js:1) — 0 refs
- **`MilensRunner`** [class] (apps/github/handlers/milens-runner.js:6) — 0 refs

## Entry Points
- **`DASHBOARD_URL`** [variable] — 3 incoming references
- **`loadOverview`** [function] — 2 incoming references
- **`poll`** [function] — 2 incoming references
- **`__dirname`** [variable] — 2 incoming references
- **`setStatus`** [function] — 1 incoming references

## Dependencies
- **store**: `remove`, `getAnnotations`, `Database`, `getCodebaseSummary`, `close`
- **test**: `add`, `dbPath`
- **orchestrator**: `e`
- **analyzer**: `resolve`

## Files
- apps/dashboard/README.md
- apps/dashboard/index.html
- apps/dashboard/main.js
- apps/dashboard/preload.js
- apps/github/README.md
- apps/github/app.js
- apps/github/generators/agents-md.js
- apps/github/generators/security.js
- apps/github/generators/skills.js
- apps/github/handlers/milens-runner.js
