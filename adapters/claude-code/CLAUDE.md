# Milens — Code Intelligence for Claude Code

## ⚠️ BEFORE ANYTHING ELSE

This project is indexed by **milens**. You have MCP tools that are faster and more accurate than reading files directly.

**HARD RULE: Use milens tools BEFORE built-in search/read tools.**

| Situation | Built-in approach (❌) | Milens approach (✅) |
|---|---|---|
| Understand a function | Read 3-10 files | `mcp_milens_overview({name: "X"})` — 1 call |
| Find references | grep in files | `mcp_milens_grep({pattern: "X"})` — searches everything |
| Check edit safety | Hope nothing breaks | `mcp_milens_impact({target: "X"})` — exact blast radius |
| Start working | Read README, explore files | `mcp_milens_codebase_summary()` — 500 token overview |
| Before commit | `git diff` manually | `mcp_milens_detect_changes()` — symbols + risk scores |

**If you skip milens tools, you're wasting tokens and risking breaking changes.**

## ⭐ Core Tools (Use Every Session)

| Tool | Purpose |
|---|---|
| `mcp_milens_overview` | **Use this first.** Context + impact + grep combined. 1 call replaces 3-5 file reads. |
| `mcp_milens_impact` | Blast radius BEFORE editing. Shows what WILL BREAK. |
| `mcp_milens_edit_check` | Pre-edit safety: callers, export status, re-export chains, test coverage |
| `mcp_milens_context` | 360° view: incoming refs + outgoing deps |
| `mcp_milens_query` | Find symbol definitions by name (camelCase/PascalCase/snake_case) |
| `mcp_milens_grep` | Text search ALL project files (code, templates, docs, configs, styles) |
| `mcp_milens_detect_changes` | Pre-commit: changed symbols + dependents + risk scores |
| `mcp_milens_codebase_summary` | 500-token project overview. Use instead of reading README. |

### 🔧 Situational Tools (Use When Needed)

| Tool | Purpose | Use when... |
|---|---|---|
| `mcp_milens_guard_edit_check` | Hard pre-edit gate with audit tracking | Before every edit |
| `mcp_milens_trace` | Execution flow from entrypoints | Debugging call chains |
| `mcp_milens_explain_relationship` | Shortest path between two symbols | Understanding connections |
| `mcp_milens_get_file_symbols` | All symbols in a file with ref/dep counts | Exploring a file |
| `mcp_milens_get_type_hierarchy` | Inheritance/implementation tree | Class exploration |
| `mcp_milens_find_dead_code` | Unused exported symbols | Before major refactors |
| `mcp_milens_status` | Index health: symbols, links, files, coverage | Session start |

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
