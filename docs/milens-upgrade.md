# Upgrading Milens

How to upgrade milens while **keeping your learning data** (annotations, sessions, evolution history).

## Storage Map

| What | Location | Keep on upgrade? |
|------|----------|:---:|
| **Index DB** — symbols, links, FTS | `<project>/.milens/milens.db` | ❌ Rebuild |
| **File hashes** (change detection) | `<project>/.milens/milens.db` | ❌ Rebuild |
| **Embedding vectors** | `<project>/.milens/milens.db` | ❌ Rebuild |
| **Snapshots** (orchestrator) | `<project>/.milens/snapshots/` | ❌ Clear |
| **Annotations** — your notes per symbol | `<project>/.milens/milens.db` | ✅ Keep |
| **Sessions** — session metadata | `<project>/.milens/milens.db` | ✅ Keep |
| **Evolution log** — pattern promotion history | `<project>/.milens/milens.db` | ✅ Keep |
| **Tool usage stats** | `<project>/.milens/milens.db` | ✅ Keep |
| **Repo metadata** (rootPath, dbPath) | `<project>/.milens/milens.db` | ✅ Keep |
| **Registry** — list of indexed repos | `~/.milens/registry.json` | ✅ Keep |
| **Global hooks config** | `~/.milens/hooks.json` | ✅ Keep |
| **Project hooks config** | `<project>/.milens/hooks.json` | ✅ Keep |
| **Tracking DB** (dashboard analytics) | `~/.milens/tracking.db` | ✅ Keep |
| **Evolve cron config** | crontab / `~/.milens/evolve.bat` | ✅ Keep |
| **npx cache** | `~/.npm/_npx/` | 🗑️ Clear |

## Quick Upgrade

```bash
# 1. Clear npx cache (so `npx milens` gets latest version)
rm -rf ~/.npm/_npx

# 2. Run the upgrade command (clears index, keeps learning data)
milens upgrade

# Or for a specific project:
milens upgrade -p /path/to/project
```

## Manual Upgrade

If you need fine-grained control:

```bash
# 1. Clear npx cache
rm -rf ~/.npm/_npx

# 2. Re-index (this rebuilds the knowledge graph while keeping annotations/sessions)
milens analyze --force

# 3. Clear snapshots if needed
rm -rf .milens/snapshots/

# 4. Update registry entry (optional — analyze does this automatically)
milens list  # verify entries
```

## What `milens upgrade` Does

1. Clears `~/.npm/_npx/` (npx cache)
2. For each indexed project, clears **index tables only**:
   - `symbols` / `symbols_fts` / `links` / `file_hashes` / `embeddings`
3. **Preserves** learning tables:
   - `annotations` / `sessions` / `evolution_log` / `tool_usage`
4. Re-runs `analyze --force` to rebuild the knowledge graph
5. Keeps registry, hooks, tracking DB intact

## After Upgrade

Reload your MCP server in VS Code:
- `Cmd+Shift+P` → **MCP: Restart All Servers**
- Or reload window: `Cmd+Shift+P` → **Developer: Reload Window**

## Troubleshooting

### "Failed to parse message" warnings
These appear when the MCP server logs to stdout instead of stderr. Ensure you're on milens ≥ 0.6.5 where this is fixed via MCP Logging Protocol. The watcher now uses `sendLoggingMessage()` (JSON-RPC notification) instead of raw stderr.

### npx still loads old version
```bash
# Force specific version (via npx for one-time testing)
npx milens@0.6.5 serve -p .
# Or use the global install
npm i -g milens@0.6.5
milens serve -p .
npm cache clean --force
```

### Database corruption after upgrade
```bash
# Full reset (removes ALL data including annotations)
milens clean --all
milens analyze --force
```
