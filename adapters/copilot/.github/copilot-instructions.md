# Milens — Code Intelligence for GitHub Copilot

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
| `mcp_milens_context` | 360° view of incoming refs + outgoing deps |
| `mcp_milens_query` | Symbol lookup by name |
| `mcp_milens_grep` | Full-text search across ALL project files |
| `mcp_milens_detect_changes` | Pre-commit: changed symbols + dependents + risk scores |
| `mcp_milens_codebase_summary` | 500-token project overview. Use instead of reading README. |

### 🔧 Situational Tools (Use When Needed)

| Tool | Purpose | Use when... |
|---|---|---|
| `mcp_milens_guard_edit_check` | Hard pre-edit gate with audit tracking | Before every edit |
| `mcp_milens_trace` | Execution flow from entrypoints | Debugging call chains |
| `mcp_milens_explain_relationship` | Shortest dependency path | Understanding connections |
| `mcp_milens_get_type_hierarchy` | Class inheritance tree | Class exploration |
| `mcp_milens_find_dead_code` | Unused exported symbols | Before major refactors |
| `mcp_milens_status` | Index health check | Session start |

## Session Workflow

1. **Start** — Verify milens is connected: `mcp_milens_status`.
2. **Recall** — For any symbol, use `mcp_milens_overview` for a comprehensive first look.
3. **Code** — Edit only after running `mcp_milens_edit_check` on the target.
4. **Verify** — Before commit: `mcp_milens_detect_changes`.
5. **Refresh** — After big changes: `npx milens analyze -p . --force`.

## Safety: Always Check Before Editing

- **Before modifying any function/class/method** → `mcp_milens_edit_check`
  - If depth-1 dependents > 5, warn the user and present alternatives.
- **Before deleting/renaming any symbol** → `mcp_milens_grep` + `mcp_milens_impact`
  - Grep catches text/string references; impact catches code references.
- **Before committing** → `mcp_milens_detect_changes`
  - Stop and report if unexpected files are in the diff.

## Tool Selection

- Symbol names (camelCase, PascalCase, snake_case) → `mcp_milens_query`
- Multi-word phrases, UI strings, error messages → `mcp_milens_grep`
- In doubt → `mcp_milens_grep` first

## Reference

- Full documentation: `.agents/skills/milens/SKILL.md`
- Project context: `AGENTS.md`
