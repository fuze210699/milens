# Milens Adapter Packs

Ready-to-use configuration files for connecting milens MCP server to popular AI coding harnesses.

## What is milens?

Milens is a code intelligence MCP server that provides deep symbol search, dependency graphs, blast-radius analysis, and pre-commit change detection. These adapter packs wire milens into your AI coding tool so it can answer questions like "what calls this function?" and "what breaks if I change this?"

## Available Adapters

| Harness | Directory | What's included |
|---|---|---|
| **Claude Code** | `claude-code/` | `.claude/mcp.json` + `CLAUDE.md` |
| **OpenCode** | `opencode/` | `.opencode/config.json` + `AGENTS.md` |
| **Codex** | `codex/` | `.codex/codex.md` |
| **Cursor** | `cursor/` | `.cursorrules` |
| **GitHub Copilot** | `copilot/` | `.github/copilot-instructions.md` |
| **Gemini** | `gemini/` | `.gemini/context.md` |
| **Zed** | `zed/` | `.zed/settings.json` |

## Installation

### Claude Code

```bash
cp -r adapters/claude-code/.claude .claude/
cp adapters/claude-code/CLAUDE.md CLAUDE.md
```

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
cp adapters/cursor/.cursorrules .cursorrules
```

### GitHub Copilot

```bash
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
