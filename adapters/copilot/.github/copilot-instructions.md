# Milens — Code Intelligence for GitHub Copilot

This project uses [milens](https://opencode.ai) for deep code intelligence. The milens MCP server provides symbol search, dependency graphs, blast-radius analysis, and pre-commit safety checks.

## MCP Configuration

Add to your Copilot MCP settings:

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

All tool calls must include `repo` set to the absolute workspace root.

## Key Tools

| Tool | Purpose |
|---|---|
| `mcp_milens_overview` | Combined context + impact + grep in one call |
| `mcp_milens_edit_check` | Pre-edit safety: callers, export status, warnings |
| `mcp_milens_impact` | Blast radius — what depends on this symbol |
| `mcp_milens_context` | 360° view of incoming refs + outgoing deps |
| `mcp_milens_query` | Symbol lookup by name |
| `mcp_milens_grep` | Full-text search across all files |
| `mcp_milens_detect_changes` | Git diff → affected symbols |
| `mcp_milens_status` | Index health check |

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
