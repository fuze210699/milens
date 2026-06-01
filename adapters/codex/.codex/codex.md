# Milens — Code Intelligence for Codex

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
| `mcp_milens_grep` | Full-text search ALL project files (code, templates, docs, configs) |
| `mcp_milens_detect_changes` | Pre-commit: changed symbols + dependents + risk scores |
| `mcp_milens_codebase_summary` | 500-token project overview. Use instead of reading README. |

### 🔧 Situational Tools (Use When Needed)

| Tool | Purpose | Use when... |
|---|---|---|
| `mcp_milens_guard_edit_check` | Hard pre-edit gate with audit tracking | Before every edit |
| `mcp_milens_trace` | Execution flow from entrypoints | Debugging call chains |
| `mcp_milens_explain_relationship` | Shortest path between two symbols | Understanding connections |
| `mcp_milens_get_type_hierarchy` | Inheritance/implementation tree | Class exploration |
| `mcp_milens_find_dead_code` | Unused exported symbols | Before major refactors |
| `mcp_milens_status` | Index health check | Session start |

All milens MCP calls require `repo` set to the absolute workspace root path.

## Session Workflow

1. **Connect** — Verify milens is running with `mcp_milens_status`.
2. **Understand** — For any symbol the user mentions, call `mcp_milens_overview` first.
3. **Edit safely** — Run `mcp_milens_edit_check` before touching any symbol. If dependents > 5, warn the user.
4. **Verify** — Before committing, call `mcp_milens_detect_changes` to confirm scope.
5. **Refresh** — After significant changes: `npx milens analyze -p . --force`.

## Safety Rules

- Never edit without `mcp_milens_edit_check` first.
- Never delete/rename without both `mcp_milens_grep` AND `mcp_milens_impact`.
- Never commit without `mcp_milens_detect_changes`.
- Never call milens tools without the `repo` parameter.
- Use `mcp_milens_grep` (not `mcp_milens_query`) for multi-word or display-text searches.

## Advanced Workflows

See `.agents/skills/milens/SKILL.md` for full documentation, including:
- `mcp_milens_trace` — execution flow tracing
- `mcp_milens_get_type_hierarchy` — inheritance trees
- `mcp_milens_find_dead_code` — dead code detection
- `mcp_milens_explain_relationship` — how two symbols are connected
