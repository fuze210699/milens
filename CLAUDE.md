# Milens — Claude Code Instructions

Follow **AGENTS.md** for canonical rules. This file adds Claude Code–specific guidance.

This project is indexed by **milens** — use MCP tools (`query`, `context`, `impact`, `status`, `detect_changes`, `explain_relationship`, `find_dead_code`, `get_file_symbols`, `get_type_hierarchy`) to understand code before modifying it.

> If tools warn the index is stale, run: `npx tsx src/cli.ts analyze -p . --force`

## Scope

| | |
|---|---|
| **Reads** | `src/`, `test/`, config files as needed |
| **Writes** | Only paths required for the task; keep diffs minimal |
| **Executes** | `npm`, `npx`, `node`, `tsx` under project root |
| **Off-limits** | User secrets, production credentials, destructive git operations without confirmation |

## Validation

Before completing any task:
1. `npx tsc --noEmit` — must pass
2. `npm test` — all tests must pass
3. If symbols were modified, `context` + `impact` were run first

## MCP Tools

See **AGENTS.md** for full tool reference. Quick summary:

- `query({query: "..."})` — find symbols
- `context({name: "..."})` — 360° symbol view
- `impact({target: "...", direction: "upstream"})` — blast radius
- `detect_changes()` — git diff → affected symbols
- `explain_relationship({from: "A", to: "B"})` — trace path
- `find_dead_code()` — unreferenced exports
- `get_file_symbols({file: "..."})` — symbols in a file
- `get_type_hierarchy({name: "..."})` — inheritance tree
- `status()` — index stats

## Architecture

- **Declarative grammar architecture**: Each language = `LangSpec` config object with tree-sitter queries; one universal `extractFromTree()` processes all
- **SQLite storage**: FTS5 for search, recursive CTEs for graph traversal, WAL mode
- **MCP transports**: stdio (default) + StreamableHTTP (--http flag)
- **8 languages**: TypeScript, JavaScript, Python, Java, Go, Rust, PHP, Vue
