---
applyTo: "docs/**"
---

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
Contains 122 symbols (112 exported) across 10 files.

## Key Symbols
- **`Milens Documentation`** [section] (docs/README.md:1) — 0 refs
- **`Getting Started`** [section] (docs/README.md:5) — 0 refs
- **`Reference`** [section] (docs/README.md:12) — 0 refs
- **`Accuracy Engine`** [section] (docs/accuracy.md:1) — 0 refs
- **`Type Bindings`** [section] (docs/accuracy.md:5) — 0 refs
- **`Method Resolution Order (MRO)`** [section] (docs/accuracy.md:29) — 0 refs
- **`C3 Linearization Example (Diamond)`** [section] (docs/accuracy.md:45) — 0 refs
- **`Import Semantics`** [section] (docs/accuracy.md:59) — 0 refs
- **`Accuracy Fixtures`** [section] (docs/accuracy.md:69) — 0 refs
- **`Dual-Path Resolution`** [section] (docs/accuracy.md:86) — 0 refs
- **`Adapter Packs`** [section] (docs/adapters.md:1) — 0 refs
- **`Available Adapters`** [section] (docs/adapters.md:5) — 0 refs
- **`Quick Install`** [section] (docs/adapters.md:17) — 0 refs
- **`Claude Code`** [section] (docs/adapters.md:21) — 0 refs
- **`OpenCode`** [section] (docs/adapters.md:37) — 0 refs

## Files
- docs/README.md
- docs/accuracy.md
- docs/adapters.md
- docs/cli.md
- docs/languages.md
- docs/pricing.md
- docs/quickstart.md
- docs/review.md
- docs/security-presets.md
- docs/tools.md
