# Adapter Packs

Connect milens to any AI coding harness. Each adapter includes the MCP server config and agent-specific instructions.

## Available Adapters

| Harness | Configuration | Instructions | Profile |
|---|---|---|---|
| **Claude Code** | `.claude-plugin/plugin.json` + `.mcp.json` (plugin) or `.claude/mcp.json` (manual) | `CLAUDE.md` | standard |
| **OpenCode** | `.opencode/config.json` | `AGENTS.md` | standard |
| **Codex** | `.codex/codex.md` | `codex.md` | standard |
| **Cursor** | `.cursorrules` | `.cursorrules` | standard |
| **GitHub Copilot** | `.vscode/mcp.json` | `.github/copilot-instructions.md` | standard |
| **Gemini** | `.gemini/context.md` | `context.md` | minimal |
| **Zed** | `.zed/settings.json` | `settings.json` | minimal |

## Quick Install

All adapters are in the `adapters/` directory of the repository.

### Claude Code

**Method 1: Plugin (recommended)**

`.claude-plugin/plugin.json` holds the plugin metadata; `.mcp.json` at the plugin root is what actually registers milens as an MCP server (Claude Code currently drops an `mcpServers` block placed directly inside `plugin.json` — see [anthropics/claude-code#16143](https://github.com/anthropics/claude-code/issues/16143) — so keep the two files separate). Copy both into your project and install from the local directory:

```bash
cp -r adapters/claude-code/.claude-plugin/ .claude-plugin/
cp adapters/claude-code/.mcp.json .mcp.json
```

```text
/plugin install .
```

> No public marketplace listing yet — `/plugin install .` installs directly from the folder in your project. Once milens is published to a plugin marketplace, this doc will be updated with the marketplace install command.

**Method 2: Manual MCP Registration**

```bash
cp adapters/claude-code/.claude/mcp.json .claude/
cp adapters/claude-code/CLAUDE.md CLAUDE.md
claude mcp add milens -- milens serve -p .
```

> **Prerequisite:** `npm i -g milens` (required for both methods)

### OpenCode

```bash
cp adapters/opencode/.opencode/config.json .opencode/
cp adapters/opencode/AGENTS.md AGENTS.md
```

### Cursor

```bash
cp adapters/cursor/.cursorrules .cursorrules
```

### GitHub Copilot

```bash
cp adapters/copilot/.github/copilot-instructions.md .github/
```

### Codex

```bash
cp adapters/codex/.codex/codex.md .codex/
```

### Gemini

```bash
cp adapters/gemini/.gemini/context.md .gemini/
```

### Zed

```bash
cp adapters/zed/.zed/settings.json .zed/
```

## Automated Install

Use `milens init --interactive` and select your harnesses during setup. Milens will copy the appropriate adapter files automatically.

```bash
milens init --profile standard --target claude-code,opencode,cursor
```

## Profile Selection

Different harnesses benefit from different tool profiles:

| Profile | Tools | Recommended For |
|---|---|---|
| `minimal` | 10 | Gemini, Zed (limited context windows) |
| `standard` | 25 | Claude Code, OpenCode, Codex, Cursor, Copilot (daily coding) |
| `full` | 43 | Security audits, architecture reviews (all tools) |

Set via environment variable: `MILENS_PROFILE=standard`

## MCP Config Reference

All adapters use this pattern (milens installed globally via `npm i -g milens`):

```json
{
  "mcpServers": {
    "milens": {
      "command": "milens",
      "args": ["serve", "-p", "${workspaceFolder}"],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

- **command**: `milens` — uses the globally installed CLI (install once: `npm i -g milens`)
- **args**: `serve` starts the MCP server, `-p ${workspaceFolder}` sets the project root
- **env.MILENS_PROFILE**: Controls which tools are active (`minimal`/`standard`/`full`)
