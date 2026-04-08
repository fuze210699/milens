# Milens — Code Intelligence Engine

This project is indexed by **milens** — a lightweight code intelligence platform that parses codebases into knowledge graphs and serves them via MCP.

## MCP Tools Available

| Tool | Purpose | Usage |
|------|---------|-------|
| `query` | Find symbols by name or keyword | `query({query: "auth"})` |
| `context` | 360° view: incoming refs, outgoing deps, hierarchy | `context({name: "AuthService"})` |
| `impact` | Blast radius — what breaks if a symbol changes | `impact({target: "createUser", direction: "upstream"})` |
| `status` | Index stats for a repository | `status()` |
| `detect_changes` | Git diff → affected symbols + dependents | `detect_changes({ref: "HEAD"})` |
| `explain_relationship` | Shortest path between two symbols | `explain_relationship({from: "A", to: "B"})` |
| `find_dead_code` | Exported symbols with zero references | `find_dead_code({kind: "function"})` |
| `get_file_symbols` | All symbols in a specific file | `get_file_symbols({file: "src/foo.ts"})` |
| `get_type_hierarchy` | Inheritance/implementation tree | `get_type_hierarchy({name: "MyClass"})` |

## Workflow Rules

### Before Editing Code
1. Run `context` on the symbol you plan to modify to understand its relationships
2. Run `impact` with `direction: "upstream"` to see what depends on it
3. If many upstream dependents exist, warn the user before proceeding

### When Exploring Unfamiliar Code
- Use `query` to find relevant symbols instead of grepping
- Use `context` on key symbols to understand call chains
- Use `get_file_symbols` to see everything in a file at a glance
- Use `get_type_hierarchy` to understand class inheritance

### When Debugging
- Use `detect_changes` to find what symbols were affected by recent changes
- Use `explain_relationship` to trace how two symbols are connected

### After Modifying Code
- Re-index if needed: `npx tsx src/cli.ts analyze -p . --force`

## Impact Depth Guide

| Depth | Meaning | Action |
|-------|---------|--------|
| 1 | Direct callers/importers — will break | Must update |
| 2 | Indirect dependents — likely affected | Should test |
| 3 | Transitive — may need testing | Test if critical |

## Project Architecture

- **Parser layer** (`src/parser/`): Declarative `LangSpec` configs for 8 languages using tree-sitter WASM
- **Analyzer layer** (`src/analyzer/`): Pipeline — scan → parse → resolve links → persist
- **Storage layer** (`src/store/`): SQLite with FTS5 full-text search, recursive CTEs for graph traversal
- **Server layer** (`src/server/`): MCP server with stdio + StreamableHTTP transports
- **CLI** (`src/cli.ts`): Commands — analyze, search, inspect, impact, serve, status, list, clean

## Tech Stack

- TypeScript ESM (ES2022, NodeNext)
- web-tree-sitter + tree-sitter-wasms
- better-sqlite3 (WAL mode, FTS5, recursive CTEs)
- @modelcontextprotocol/sdk
- MIT License

## Key Commands

```bash
npm run build          # tsc → dist/
npm run test           # vitest
npm run self-analyze   # index this repo
npm run self-serve     # start MCP HTTP server on port 3100
npx tsx src/cli.ts analyze -p <path>            # index any repo
npx tsx src/cli.ts analyze -p <path> --skills   # index + generate skill files
npx tsx src/cli.ts list                          # list indexed repos
npx tsx src/cli.ts clean -p <path>               # remove index
```
