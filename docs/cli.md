# CLI Commands

## `milens uninstall`

Full cleanup of all milens traces from a project. Scans 11 categories of traces and removes them interactively or automatically.

### Quick Usage

```bash
npx milens uninstall              # Interactive mode
npx milens uninstall --dry-run    # Preview without deleting
npx milens uninstall --scan-only  # Only detect, no removal
npx milens uninstall --keep-agents # Keep .agents/ directory
```

### What It Scans & Removes

| Category | Description | Auto-Remove |
|----------|-------------|:----------:|
| Injected blocks | Milens markers in `.gitignore`, `package.json` scripts | ✅ |
| Generated files | `.agents/`, AGENTS.md, `.milens/backups/` | ✅ |
| Git hooks | `pre-commit`, `post-commit` (milens-managed) | ✅ |
| Cron entries | User crontab entries referencing milens | ✅ |
| Windows tasks | Task Scheduler entries | ✅ |
| Database | `.milens/*.db` SQLite database files | ✅ |
| Registry | `~/.milens/registry.json` entries | ✅ |
| MCP configs | `claude_desktop_config.json`, `.cursor/mcp.json`, opencode config | ✅ |
| Dependencies | `package.json` milens dependency | ❌ Manual |
| Environment files | `.env`, `.bashrc`, `.zshrc` milens variables | ❌ Manual |
| Other references | README, docs, configuration files | ❌ Manual |

### Architecture

The uninstall pipeline runs in 3 phases:

```
Phase 1: Scan    →  scanInjectedBlocks() + scanGeneratedFiles() + scanGitHooks() + ...
Phase 2: Remove  →  removeInjectedBlock() + removeDatabase() + removeRegistryEntry() + ...
Phase 3: Verify  →  Re-scan to confirm cleanup
```

### Interactive Mode

When run without flags, presents a step-by-step wizard:

1. Initial scan — shows what was found
2. Auto-remove — items that can be safely deleted
3. Manual steps — items requiring user action (npm uninstall, env cleanup)
4. Final verification — confirms everything removed

### Related

- [Quick Start](quickstart.md) — bootstrap a project
- [Tools Reference](tools.md) — MCP tools
