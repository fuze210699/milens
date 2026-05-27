# Milens — Code Intelligence for Codex

Milens provides deep code intelligence for this project via MCP. Connect it in your Codex configuration:

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

## Core Tools (use first)

| Tool | When to use |
|---|---|
| `mcp_milens_overview` | First look at any symbol you need to understand or edit — combines context, impact, and text search |
| `mcp_milens_edit_check` | Before editing any function/class/method — shows callers and export status |
| `mcp_milens_impact` | Check blast radius — what breaks if this symbol changes |
| `mcp_milens_query` | Find code symbols by name (camelCase, PascalCase, snake_case) |
| `mcp_milens_grep` | Full-text search for phrases, UI labels, error strings, docs, configs |
| `mcp_milens_detect_changes` | Pre-commit check — verify only expected files changed |

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
