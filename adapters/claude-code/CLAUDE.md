# Milens — Code Intelligence for Claude Code

Milens is an MCP server that provides deep code intelligence: symbol search, dependency graphs, blast-radius analysis, and pre-commit change detection.

## Available Tools

| Tool | Purpose |
|---|---|
| `mcp_milens_query` | Find symbol definitions by name |
| `mcp_milens_grep` | Text search across ALL project files |
| `mcp_milens_context` | 360° view: callers + callees |
| `mcp_milens_impact` | Blast radius before editing |
| `mcp_milens_detect_changes` | Pre-commit scope check |
| `mcp_milens_overview` | Combined context + impact + grep |
| `mcp_milens_edit_check` | Pre-edit safety check |
| `mcp_milens_explain_relationship` | Shortest path between two symbols |
| `mcp_milens_get_file_symbols` | All symbols in a file |
| `mcp_milens_get_type_hierarchy` | Class inheritance tree |
| `mcp_milens_find_dead_code` | Unused exported symbols |
| `mcp_milens_trace` | Trace execution flows from entrypoints |
| `mcp_milens_status` | Index health check |

All tool calls must include `repo` set to the absolute workspace root.

## Session Workflow

1. **Start** — The milens MCP server connects via `npx milens serve`. Verify with `mcp_milens_status`.
2. **Recall** — When asked to work on a symbol, use `mcp_milens_overview` for a combined view of context, impact, and text references.
3. **Code** — Make changes following the edit-safety rules below.
4. **Verify** — Before committing, run `mcp_milens_detect_changes` to confirm only expected files changed.
5. **Annotate** — After significant changes, run `npx milens analyze -p . --force` to keep the index fresh.

## Edit Safety (Mandatory)

**Before editing any function, class, or method:**
1. Call `mcp_milens_edit_check` on the target symbol to see callers and export status.
2. If depth-1 dependents > 5, **stop and warn the user** before proceeding.
3. Call `mcp_milens_context` to understand the full caller/callee picture.
4. Only then make the edit.

**Before deleting or renaming:**
1. `mcp_milens_grep` — find ALL text references (templates, configs, docs).
2. `mcp_milens_impact` with `direction: "upstream"` — find code-level dependents.
3. Combine both results before acting.

**Before committing:**
- Call `mcp_milens_detect_changes` — if unexpected files appear, stop and report.

## Tool Selection

- Use `mcp_milens_query` for symbol names (camelCase, PascalCase, snake_case).
- Use `mcp_milens_grep` for multi-word phrases, UI labels, error messages, or text in templates/configs/docs.
- When in doubt, use `mcp_milens_grep` first — it searches everything.

## Reference

See `AGENTS.md` at the repo root for project-specific context and codebase structure.
Skill files at `.agents/skills/milens/SKILL.md` provide advanced workflow guides.
