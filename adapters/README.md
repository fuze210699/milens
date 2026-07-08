# Milens Adapter Packs

Ready-to-use configuration files for connecting milens MCP server to popular AI coding harnesses.

## What is milens?

Milens is a code intelligence MCP server that provides deep symbol search, dependency graphs, blast-radius analysis, and pre-commit change detection. These adapter packs wire milens into your AI coding tool so it can answer questions like "what calls this function?" and "what breaks if I change this?"

## Available Adapters

| Harness | Directory | What's included |
|---|---|---|
| **Claude Code** | `claude-code/` | `.claude/mcp.json` + `CLAUDE.md` (+ optional hooks snippet) |
| **OpenCode** | `opencode/` | `.opencode/config.json` + `AGENTS.md` |
| **Codex** | `codex/` | `.codex/config.toml` + `.codex/codex.md` |
| **Cursor** | `cursor/` | `.cursor/mcp.json` + `.cursorrules` |
| **GitHub Copilot** | `copilot/` | `.vscode/mcp.json` + `.github/copilot-instructions.md` |
| **Gemini** | `gemini/` | `.gemini/settings.json` + `.gemini/context.md` |
| **Zed** | `zed/` | `.zed/settings.json` |

## Installation

### Claude Code

Register milens as a **project-scoped MCP server** — this is the one method that works identically across the Claude Code CLI, the VS Code extension, and the desktop app, because it relies on nothing but a plain `.mcp.json` file at your project root (no plugin marketplace involved).

```bash
cp -r adapters/claude-code/.claude .claude/
cp adapters/claude-code/CLAUDE.md CLAUDE.md
claude mcp add milens -- milens serve -p .
```

That command writes a `.mcp.json` at your project root equivalent to:

```json
{
  "mcpServers": {
    "milens": {
      "command": "milens",
      "args": ["serve", "-p", "."]
    }
  }
}
```

`-p .` is resolved against the process's working directory, which Claude Code always sets to your project root when it spawns the server — so this is the most portable form and needs no environment-variable substitution.

> **Prerequisite:** `npm i -g milens`

### Claude Code — via `/plugin install` (marketplace)

```bash
/plugin marketplace add fuze210699/milens
/plugin install milens
```

This reads `.claude-plugin/marketplace.json` at the repo root, which points at `adapters/claude-code` as the plugin. That plugin ships its own `.mcp.json` with **no `-p` flag** — `milens serve` falls back to the `CLAUDE_PROJECT_DIR` environment variable, which Claude Code injects into every MCP server subprocess it spawns (project-scoped or plugin-scoped).

> **History:** we previously shipped a plugin manifest that passed `${CLAUDE_PLUGIN_ROOT}` as `-p`. That variable resolves to the *plugin's own install directory* (e.g. `~/.claude/plugins/cache/...`), not your project — so it silently indexed the wrong codebase. We removed it in favor of the manual `.mcp.json` method above.
>
> The current plugin fixes this by relying on `CLAUDE_PROJECT_DIR` (env var, not a `${...}` template substitution) read directly by the CLI — `resolve(opts.path ?? process.env.CLAUDE_PROJECT_DIR ?? '.')` in `src/cli.ts`. Claude Code's docs don't specify a minimum version for `CLAUDE_PROJECT_DIR` injection into plugin-scoped servers, so **verify with `mcp_milens_status` after install** — if the repo path looks wrong, fall back to the manual `.mcp.json` method above, which is unaffected by any of this and always works.

**Optional: session-start / pre-compact hooks.** Merge the `hooks` key from `adapters/claude-code/.claude/settings.json.hooks-snippet.json` into your project's `.claude/settings.json` (create the file if it doesn't exist yet). Not copied automatically since `.claude/settings.json` commonly holds other project settings you don't want overwritten.

### OpenCode

```bash
cp -r adapters/opencode/.opencode .opencode/
cp adapters/opencode/AGENTS.md AGENTS.md
```

### Codex

```bash
cp -r adapters/codex/.codex .codex/
```

### Cursor

```bash
cp -r adapters/cursor/.cursor .cursor/
cp adapters/cursor/.cursorrules .cursorrules
```

### GitHub Copilot

```bash
cp -r adapters/copilot/.vscode .vscode/
cp -r adapters/copilot/.github .github/
```

### Gemini

```bash
cp -r adapters/gemini/.gemini .gemini/
```

### Zed

```bash
cp -r adapters/zed/.zed .zed/
```

## Verification

After installation, verify milens is connected:

1. Start your AI harness
2. Look for the milens MCP server in the tools list
3. Run `mcp_milens_status` to confirm the index is healthy

## Index Maintenance

After significant code changes, refresh the index:

```bash
npx milens analyze -p . --force
```

## All Tools Available

| Tool | Purpose |
|---|---|
| `mcp_milens_overview` | Combined context + impact + grep |
| `mcp_milens_edit_check` | Pre-edit safety check |
| `mcp_milens_impact` | Blast radius analysis |
| `mcp_milens_context` | 360° caller/callee view |
| `mcp_milens_query` | Symbol definitions by name |
| `mcp_milens_grep` | Full-text search all files |
| `mcp_milens_detect_changes` | Pre-commit change detection |
| `mcp_milens_explain_relationship` | Shortest path between symbols |
| `mcp_milens_get_file_symbols` | All symbols in a file |
| `mcp_milens_get_type_hierarchy` | Class inheritance tree |
| `mcp_milens_find_dead_code` | Unused exported symbols |
| `mcp_milens_trace` | Execution flow tracing |
| `mcp_milens_status` | Index health check |

## Safety Rules (applies to all harnesses)

- Never edit a symbol without `mcp_milens_edit_check` first
- Never delete/rename without `mcp_milens_grep` + `mcp_milens_impact`
- Never commit without `mcp_milens_detect_changes`
- Use `mcp_milens_grep` for phrases/UI text, `mcp_milens_query` for code symbols
- All milens calls require `repo` set to the absolute workspace root
