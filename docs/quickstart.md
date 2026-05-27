# Quick Start

Get milens running in 30 seconds.

## 1. Install

```bash
npm install -g milens
```

Or use without installing:

```bash
npx milens init --profile full
```

## 2. Initialize Your Project

```bash
cd your-project
milens init --profile full --interactive
```

This interactive command walks you through:
- **Profile selection** — minimal (10 tools), standard (25), or full (33)
- **Security rules** — include 50+ built-in vulnerability scanners
- **CI/CD templates** — GitHub Actions workflows
- **Git hooks** — pre-commit checks
- **Harness adapters** — choose which AI agent you use

What happens under the hood:
1. **Analyzes** your codebase (tree-sitter → knowledge graph)
2. **Generates `AGENTS.md`** with codebase context
3. **Installs 6 skill files** in `.agents/skills/`
4. **Configures security rules**
5. **Installs pre-commit hooks** (if selected)

## 3. Start Coding

Open your project in any AI coding agent. The agent will:
- Auto-load `AGENTS.md` for immediate codebase context
- Use milens MCP tools for code intelligence
- Follow skill workflows for common tasks

## 4. Try a Workflow

```bash
milens workflow tdd              # Find test gaps and plan tests
milens workflow review           # Review current changes
milens security scan             # Full security audit
milens workflow plan "Add Stripe billing"  # Generate implementation plan
```

## 5. Advanced

```bash
# Reduce token overhead with minimal profile
MILENS_PROFILE=minimal milens serve

# Auto re-index on file changes
milens watch

# Schedule automatic evolution (pattern promotion)
milens evolve --schedule install

# View code quality metrics
milens metrics

# Open analytics dashboard
milens dashboard
```

## Editor Setup

### VS Code / GitHub Copilot
Add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "milens": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "milens", "serve", "-p", "${workspaceFolder}"]
    }
  }
}
```

### Claude Code
```bash
claude mcp add milens -- npx -y milens serve -p .
```

### Cursor
Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "milens": {
      "command": "npx",
      "args": ["-y", "milens", "serve", "-p", "."]
    }
  }
}
```

### OpenCode
Add to `.opencode/config.json`:
```json
{
  "mcp": {
    "milens": {
      "command": "npx",
      "args": ["-y", "milens", "serve"],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

For other editors (Codex, Gemini, Zed), see `adapters/` in the repository.

## What's Next?

- [All 33 MCP Tools](tools.md) — Complete tool reference
- [Skills & Prompts](../.agents/skills/) — Pre-built agent workflows
- [Security Rules](security-presets.md) — 50+ rules with OWASP mapping
- [Adapters](adapters.md) — Connect your harness
- [Pricing](pricing.md) — Free / Pro / Enterprise
