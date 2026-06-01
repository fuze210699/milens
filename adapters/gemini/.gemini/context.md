# Milens — Code Intelligence

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

## MCP Connection

```json
{
  "mcpServers": {
    "milens": {
      "command": "npx",
      "args": ["milens", "serve"],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

All milens MCP calls require the `repo` parameter set to the absolute workspace root.

## ⭐ Core Tools (Use Every Session)

| Tool | Description |
|---|---|
| `mcp_milens_overview` | **Use this first.** Context + impact + grep combined. 1 call replaces 3-5 file reads. |
| `mcp_milens_impact` | Blast radius BEFORE editing. Shows what WILL BREAK. |
| `mcp_milens_edit_check` | Pre-edit safety: callers, export status, re-export chains, test coverage |
| `mcp_milens_context` | Full incoming + outgoing dependency view |
| `mcp_milens_query` | Symbol search by name |
| `mcp_milens_grep` | Text search everywhere (templates, configs, docs, styles) |
| `mcp_milens_detect_changes` | Pre-commit: changed symbols + dependents + risk scores |
| `mcp_milens_codebase_summary` | 500-token project overview. Use instead of reading README. |

### 🔧 Situational Tools (Use When Needed)

| Tool | Description | Use when... |
|---|---|---|
| `mcp_milens_guard_edit_check` | Hard pre-edit gate with audit tracking | Before every edit |
| `mcp_milens_trace` | Execution flow from entrypoints | Debugging call chains |
| `mcp_milens_explain_relationship` | Shortest dependency path | Understanding connections |
| `mcp_milens_get_type_hierarchy` | Class inheritance tree | Class exploration |
| `mcp_milens_find_dead_code` | Unused exported symbols | Before major refactors |
| `mcp_milens_status` | Index health: symbols, links, files, coverage | Session start |

## Workflow

**Every session follows this pattern:**

1. **Start** — `mcp_milens_status` to verify the index is healthy.
2. **Understand** — `mcp_milens_overview({name, repo})` for any symbol mentioned.
3. **Edit safely** — `mcp_milens_edit_check` before touching hub/shared code. Halt if dependents > 5.
4. **Verify** — `mcp_milens_detect_changes` before committing. Report unexpected changes.
5. **Refresh** — `npx milens analyze -p . --force` after significant edits.

## Mandatory Safety Rules

- **Never edit** a symbol without `mcp_milens_edit_check` first.
- **Never delete/rename** without `mcp_milens_grep` AND `mcp_milens_impact`.
- **Never commit** without `mcp_milens_detect_changes`.
- **Never omit** the `repo` parameter from milens calls.
- **Use `mcp_milens_grep`** (not `mcp_milens_query`) for phrases, UI text, config strings.

## Codebase Structure

- `.agents/skills/milens/SKILL.md` — full milens documentation
- `.agents/skills/` — area-specific skill files (analyzer, parser, server, store, etc.)
- `AGENTS.md` — project-level instructions and conventions
