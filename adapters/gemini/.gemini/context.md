# Milens — Code Intelligence

This project is indexed by **milens**, an MCP server that provides deep code intelligence (symbol search, dependency graphs, blast-radius analysis, change detection). The index covers 616 symbols, 843 links, across 59 files.

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

## Essential Tools

| Tool | Description |
|---|---|
| `mcp_milens_overview` | First-stop: context + impact + grep combined |
| `mcp_milens_edit_check` | Pre-edit safety: callers, exports, warnings |
| `mcp_milens_impact` | Upstream/downstream blast radius |
| `mcp_milens_context` | Full incoming + outgoing dependency view |
| `mcp_milens_query` | Symbol search by name |
| `mcp_milens_grep` | Text search everywhere (templates, configs, docs) |
| `mcp_milens_detect_changes` | Git-aware change detection |
| `mcp_milens_trace` | Execution flow from entrypoints |
| `mcp_milens_find_dead_code` | Unused exported symbols |
| `mcp_milens_status` | Index health |

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
