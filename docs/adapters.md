# Adapter Packs

Connect milens to any AI coding harness. Each adapter includes the MCP server config and agent-specific instructions.

## Available Adapters

| Harness | Configuration | Instructions | Profile |
|---|---|---|---|
| **Claude Code** | `.claude/mcp.json` | `CLAUDE.md` | standard |
| **OpenCode** | `.opencode/config.json` | `AGENTS.md` | standard |
| **Codex** | `.codex/codex.md` | `codex.md` | standard |
| **Cursor** | `.cursorrules` | `.cursorrules` | standard |
| **GitHub Copilot** | `.vscode/mcp.json` | `.github/copilot-instructions.md` | standard |
| **Gemini** | `.gemini/context.md` | `context.md` | minimal |
| **Zed** | `.zed/settings.json` | `settings.json` | minimal |

## Quick Install

All adapters are in the `adapters/` directory of the repository.

### Claude Code

```bash
cp adapters/claude-code/.claude/mcp.json .claude/
cp adapters/claude-code/CLAUDE.md CLAUDE.md
claude mcp add milens -- npx -y milens serve -p .
```

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
| `full` | 33 | Security audits, architecture reviews (all tools) |

Set via environment variable: `MILENS_PROFILE=standard`

## MCP Config Reference

All adapters use this pattern:

```json
{
  "mcpServers": {
    "milens": {
      "command": "npx",
      "args": ["-y", "milens", "serve", "-p", "."],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

- **command**: `npx` for zero-install, or `milens` if globally installed
- **args**: `serve` starts the MCP server, `-p .` sets the project root
- **env.MILENS_PROFILE**: Controls which tools are active (`minimal`/`standard`/`full`)
