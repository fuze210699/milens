# Adapter Packs

Connect milens to any AI coding harness. Each adapter includes the MCP server config and agent-specific instructions.

## Available Adapters

| Harness | Configuration | Instructions | Profile |
|---|---|---|---|
| **Claude Code** | `.claude/mcp.json` | `CLAUDE.md` | standard |
| **OpenCode** | `.opencode/config.json` | `AGENTS.md` | standard |
| **Codex** | `.codex/config.toml` | `.codex/codex.md` | standard |
| **Cursor** | `.cursor/mcp.json` | `.cursorrules` | standard |
| **GitHub Copilot** | `.vscode/mcp.json` | `.github/copilot-instructions.md` | standard |
| **Gemini** | `.gemini/settings.json` | `.gemini/context.md` | minimal |
| **Zed** | `.zed/settings.json` | `settings.json` | minimal |

## Quick Install

All adapters are in the `adapters/` directory of the repository.

### Claude Code

Register milens as a **project-scoped MCP server** — this works identically across the Claude Code CLI, the VS Code extension, and the desktop app, since it's just a `.mcp.json` file at your project root (no plugin marketplace involved):

```bash
cp adapters/claude-code/.claude/mcp.json .claude/
cp adapters/claude-code/CLAUDE.md CLAUDE.md
claude mcp add milens -- milens serve -p .
```

`-p .` resolves against the process's working directory, which Claude Code always sets to your project root — the most portable form, no environment-variable substitution needed.

> **Prerequisite:** `npm i -g milens`

Alternatively, install via the marketplace: `/plugin marketplace add fuze210699/milens` then `/plugin install milens`. This uses `.claude-plugin/marketplace.json` at the repo root, pointing at `adapters/claude-code`. That plugin's `.mcp.json` omits `-p` entirely and relies on the `CLAUDE_PROJECT_DIR` environment variable Claude Code injects into every MCP server subprocess it spawns.
>
> **History:** an earlier version of this plugin passed `${CLAUDE_PLUGIN_ROOT}` as `-p`, which resolves to the plugin's own install directory, not your project — silently indexing the wrong codebase. `CLAUDE_PROJECT_DIR` fixes this since it's read from `process.env` by the CLI (`src/cli.ts`), not substituted as a `${...}` template value with undocumented unset-behavior. Verify with `mcp_milens_status` after install; if the indexed path looks wrong, fall back to the manual `.mcp.json` method above.

### OpenCode

```bash
cp adapters/opencode/.opencode/config.json .opencode/
cp adapters/opencode/AGENTS.md AGENTS.md
```

### Cursor

```bash
cp adapters/cursor/.cursor/mcp.json .cursor/
cp adapters/cursor/.cursorrules .cursorrules
```

### GitHub Copilot

```bash
cp adapters/copilot/.vscode/mcp.json .vscode/
cp adapters/copilot/.github/copilot-instructions.md .github/
```

### Codex

```bash
cp adapters/codex/.codex/config.toml .codex/
cp adapters/codex/.codex/codex.md .codex/
```

### Gemini

```bash
cp adapters/gemini/.gemini/settings.json .gemini/
cp adapters/gemini/.gemini/context.md .gemini/
```

### Zed

```bash
cp adapters/zed/.zed/settings.json .zed/
```

## Automated Install

Use `milens init --target <harnesses>` (comma-separated, or `all`) to copy the adapter files for you — equivalent to the `cp` commands above, skipping any file that already exists in your project so it never clobbers your own config.

```bash
milens init --profile standard --target claude-code,opencode,cursor
```

`milens init --interactive` walks through profile, extras, and harness selection, then runs the equivalent non-interactive command for you.

## Profile Selection

Different harnesses benefit from different tool profiles:

| Profile | Tools | Recommended For |
|---|---|---|
| `minimal` | 10 | Gemini, Zed (limited context windows) |
| `standard` | 25 | Claude Code, OpenCode, Codex, Cursor, Copilot (daily coding) |
| `full` | 43 | Security audits, architecture reviews (all tools) |

Set via environment variable: `MILENS_PROFILE=standard`

## MCP Config Reference

All adapters share the same shape (milens installed globally via `npm i -g milens`); only the `-p` value differs by harness:

```json
{
  "mcpServers": {
    "milens": {
      "command": "milens",
      "args": ["serve", "-p", "<project-root>"],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

- **command**: `milens` — uses the globally installed CLI (install once: `npm i -g milens`)
- **args**: `serve` starts the MCP server; `-p <project-root>` sets the project root
  - **Claude Code, OpenCode, Codex, Zed**: use a literal `-p .` — these spawn the server with `cwd` already set to the project root
  - **Cursor, GitHub Copilot, Gemini** (VS Code–family variable substitution): use `-p "${workspaceFolder}"`
- **env.MILENS_PROFILE**: Controls which tools are active (`minimal`/`standard`/`full`)
