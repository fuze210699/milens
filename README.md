<p align="center">
  <strong>milens</strong><br>
  <em>Lightweight Code Intelligence Engine</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm version"></a>
  <a href="https://github.com/fuze210699/milens/blob/develop/LICENSE"><img src="https://img.shields.io/badge/license-PolyForm--Noncommercial-blue" alt="License: PolyForm Noncommercial"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js >= 20"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Install</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#cli-commands">CLI</a> •
  <a href="#mcp-server">MCP Server</a> •
  <a href="#editor-integration">Editors</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#adding-a-language">Extend</a>
</p>

---

Parse codebases into **knowledge graphs** — symbols, imports, calls, inheritance — and serve them to **AI agents** via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

```bash
npx milens analyze          # index any codebase
npx milens serve            # start MCP server for AI agents
```

## Features

- **8 languages** — TypeScript, JavaScript, Python, Java, Go, Rust, PHP, Vue
- **Declarative grammars** — add a new language by writing a config object, not code
- **11 MCP tools** — query, grep, context, impact, status, detect_changes, explain_relationship, find_dead_code, get_file_symbols, get_type_hierarchy
- **Full-text grep** — search ALL project files (templates, SCSS, configs, docs) — not just indexed symbols
- **SQLite + FTS5** — full-text symbol search + recursive CTE graph traversal
- **Token-compact output** — minimal structured text, saving 40-60% tokens for AI agents
- **Incremental indexing** — file-hash based, only re-parses changed files
- **Multi-repo registry** — manage multiple codebases from `~/.milens/`
- **Dual transport** — MCP over stdio (VS Code / Cursor) or HTTP (localhost-bound, secure)
- **Skills generation** — auto-generate context files for Copilot, Cursor, Claude, Codex, and 40+ agents via `.agents/skills/`
- **Security hardened** — ReDoS protection, path traversal prevention, FTS5 injection sanitization, command injection prevention

## Installation

```bash
# Use directly (no install needed)
npx milens analyze -p .

# Or install globally
npm install -g milens
milens analyze -p .   # after global install, npx prefix is optional
```

## Quick Start

```bash
# Index a codebase
npx milens analyze -p /path/to/repo --verbose

# Search for symbols
npx milens search "UserService"

# 360° symbol context
npx milens inspect "AuthService"

# Blast radius — what breaks if this changes?
npx milens impact "createUser" --depth 3

# Start MCP server (stdio for editors)
npx milens serve -p /path/to/repo

# Start MCP server (HTTP for remote agents)
npx milens serve --http --port 3100
```

## CLI Commands

| Command | Description |
|---|---|
| `analyze` | Index a codebase into a knowledge graph |
| `search` | Full-text symbol search (FTS5) |
| `inspect` | 360° symbol context — incoming refs + outgoing deps |
| `impact` | Blast radius analysis via recursive CTE |
| `serve` | Start MCP server (stdio or HTTP) |
| `status` | Show index stats |
| `list` | List all indexed repositories |
| `clean` | Remove index for a repository |

### `analyze`

```bash
npx milens analyze -p /path/to/repo --verbose --force --skills
```

Scans source files, parses symbols with tree-sitter, resolves imports/calls/inheritance, and stores everything in `.milens/milens.db`.

| Flag | Description |
|---|---|
| `-p, --path` | Repository root (default: `.`) |
| `-o, --output` | Custom output directory for the database |
| `-v, --verbose` | Show detailed progress |
| `-f, --force` | Force full re-index (skip hash check) |
| `-s, --skills` | Generate SKILL.md files for Copilot, Cursor, Claude |

### `search`

```bash
npx milens search "createUser" --limit 10
```

### `inspect`

```bash
npx milens inspect "AuthService"
```

Shows incoming references (who calls/uses it) and outgoing dependencies (what it calls/imports/extends).

### `impact`

```bash
npx milens impact "UserModel" --direction upstream --depth 3
```

*"What breaks if this symbol changes?"* — traverses the dependency graph via recursive CTEs.

| Flag | Description |
|---|---|
| `-d, --direction` | `upstream` (default) or `downstream` |
| `--depth` | Max traversal depth (default: `3`) |

### `serve`

```bash
npx milens serve -p /path/to/repo              # stdio (for editors)
npx milens serve -p /path/to/repo --http --port 3100  # HTTP
```

### `list`

```bash
npx milens list    # show all indexed repositories
```

### `clean`

```bash
npx milens clean -p /path/to/repo    # remove index for one repo
npx milens clean --all               # remove all indexes
```

## MCP Server

milens exposes **11 tools** via the Model Context Protocol:

| Tool | Description | Key params |
|---|---|---|
| `query` | Search indexed symbol definitions (FTS5) | `query`, `limit` |
| `grep` | Text search across ALL project files (templates, SCSS, configs, docs) | `pattern`, `isRegex`, `include` |
| `context` | 360° symbol view — incoming refs, outgoing deps | `name` |
| `impact` | Blast radius with depth grouping (code deps only) | `target`, `direction`, `depth` |
| `status` | Index stats for a repository | `repo` |
| `detect_changes` | Git diff → affected symbols + dependents | `ref` |
| `explain_relationship` | Shortest path between two symbols | `from`, `to` |
| `find_dead_code` | Exported symbols with zero references | `kind`, `limit` |
| `get_file_symbols` | All symbols in a specific file | `file` |
| `get_type_hierarchy` | Inheritance/implementation tree | `name` |

> **`query` vs `grep`**: `query` searches indexed symbol definitions only. `grep` searches raw text across every file — essential for finding references in templates, SCSS, configs, routes, and docs that `query`/`impact` cannot see.

> When only one repo is indexed, the `repo` parameter is optional on all tools.

### Tool Examples

```
# Search indexed symbols
query({query: "auth"})
→ AuthService [class] src/auth/service.ts:10
  validateUser [function] src/auth/validate.ts:15

# Grep ALL files (templates, SCSS, configs, docs)
grep({pattern: "AuthService"})
→ src/auth/service.ts L10: export class AuthService {
  src/components/Login.vue L5: <AuthForm @submit="handleAuth" />
  src/routes/index.ts L12: import { AuthService } from '../auth'
  docs/api.md L42: The `AuthService` handles JWT...

# Context
context({name: "validateUser"})
→ incoming:
    calls: handleLogin (src/api/auth.ts)
  outgoing:
    calls: checkPassword (src/auth/hash.ts)

# Impact
impact({target: "UserService", direction: "upstream"})
→ depth 1:
    handleLogin [function] src/api/auth.ts:45 (calls)
    UserController [class] src/controllers/user.ts:12 (calls)
  depth 2:
    authRouter [module] src/routes/auth.ts (imports)

# Detect changes
detect_changes({ref: "HEAD"})
→ changed: src/auth/service.ts
  affected: handleLogin, UserController

# Dead code
find_dead_code({kind: "function"})
→ legacyHash [function] src/utils/hash.ts:42 (0 refs)
```

## Editor Integration

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

### Cursor

Add to `.cursor/mcp.json` (per-project):

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

### Claude Code

```bash
claude mcp add milens -- npx -y milens serve -p .
```

### Codex

Add to `.codex/config.toml`:

```toml
[mcp_servers.milens]
command = "npx"
args = ["-y", "milens", "serve", "-p", "."]
```

### HTTP Mode (remote agents)

```bash
npx milens serve --http --port 3100
```

Endpoint: `POST http://localhost:3100/mcp`

## Skills Generation

Generate editor-specific context files from your codebase's knowledge graph:

```bash
npx milens analyze -p . --skills
```

This creates:

| Path | For |
|---|---|
| `.github/instructions/*.instructions.md` | GitHub Copilot |
| `.cursor/rules/*.mdc` | Cursor |
| `.claude/skills/generated/*/SKILL.md` | Claude Code |
| `.agents/skills/*/SKILL.md` | 40+ agents ([Agent Skills](https://agentskills.io)) |
| `.milens/skills/*.md` | milens internal |

Each skill file contains: key symbols, entry points, cross-area dependencies, file listings, and **MCP tool usage instructions** — so AI agents know both the codebase structure and how to use milens tools effectively.

## Architecture

```
src/
  cli.ts              — CLI entry point (commander, 8 commands)
  types.ts            — Shared types (CodeSymbol, SymbolLink, etc.)
  skills.ts           — Skills/context file generator
  parser/
    loader.ts         — Tree-sitter WASM loading + caching
    extract.ts        — Universal extractor + LangSpec interface
    lang-ts.ts        — TypeScript (+ .tsx)
    lang-js.ts        — JavaScript (+ .jsx, .mjs, .cjs)
    lang-py.ts        — Python
    lang-java.ts      — Java
    lang-go.ts        — Go
    lang-rust.ts      — Rust
    lang-php.ts       — PHP
    lang-vue.ts       — Vue (extracts <script> + <template> refs)
    languages.ts      — Language registry
  analyzer/
    scanner.ts        — File discovery (.gitignore aware)
    resolver.ts       — Import + call + heritage resolution
    engine.ts         — Pipeline orchestrator (6 phases)
  store/
    schema.sql        — SQLite schema (FTS5, triggers, indexes)
    db.ts             — Database adapter (30+ methods, recursive CTEs)
    registry.ts       — Multi-repo registry (~/.milens/)
  server/
    mcp.ts            — MCP server (11 tools, stdio + HTTP)
```

### How It Works

```
Source Files → [Scan] → [Parse] → [Resolve] → [Store] → [Serve]
                 │         │          │           │          │
            .gitignore  tree-sitter  imports   SQLite     MCP
             filter      WASM AST    calls     FTS5      stdio/HTTP
                                    heritage   CTE
```

1. **Scan** — Walk file tree respecting `.gitignore`, skip `node_modules`/`dist`/`build`/etc.
2. **Parse** — Extract symbols (functions, classes, methods, interfaces, enums, structs, traits) via tree-sitter WASM grammars
3. **Resolve** — Link imports → symbols, calls → definitions, inheritance chains. Confidence-scored.
4. **Store** — Write symbols + links to SQLite with FTS5 search index in a single transaction
5. **Serve** — Expose the knowledge graph via 10 MCP tools or CLI commands

### Design Decisions

- **Declarative `LangSpec`**: Each language is a config object with tree-sitter queries. One universal extractor processes all — no per-language extraction code.
- **SQLite recursive CTE**: Impact analysis (upstream/downstream) runs entirely in the database. No need to load the full graph into memory.
- **Token-compact output**: MCP responses use `name [kind] file:line` format. Saves 40-60% tokens for AI agents.
- **Incremental by default**: File content is SHA-256 hashed; only changed files get re-parsed.
- **Lazy DB pools**: MCP server opens database connections on demand and evicts them after 5 minutes of inactivity.

## Supported Languages

| Language | Extensions | Symbols | Imports | Calls | Heritage |
|---|---|---|---|---|---|
| TypeScript | `.ts`, `.tsx` | functions, classes, methods, interfaces, enums | ✓ (ESM + require) | ✓ | ✓ |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | functions, classes, methods | ✓ (ESM + require) | ✓ | ✓ |
| Python | `.py` | functions, classes, methods (+ decorated) | ✓ | ✓ (+ decorators) | ✓ |
| Java | `.java` | classes, records, interfaces, methods, enums | ✓ (+ static) | ✓ (+ annotations, new) | ✓ |
| Go | `.go` | functions, methods, structs, interfaces, consts, vars | ✓ | ✓ | — |
| Rust | `.rs` | functions, structs, enums, traits, methods, consts, mods | ✓ | ✓ (+ macros) | ✓ |
| PHP | `.php` | functions, classes, interfaces, traits, methods, consts | ✓ (+ include) | ✓ | ✓ (+ traits) |
| Vue | `.vue` | `<script>` symbols + `<template>` refs (components, events, directives, interpolations) | ✓ | ✓ | ✓ |

## Adding a Language

Create `src/parser/lang-xxx.ts`:

```typescript
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'xxx',
  extensions: ['.xxx'],
  wasmName: 'tree-sitter-xxx',
  queries: {
    functions: `(function_definition name: (identifier) @name) @def`,
    classes: `(class_definition name: (identifier) @name) @def`,
    // add queries using tree-sitter playground
  },
  resolveImport(raw, fromFile, root, aliases) {
    // return resolved file path or null
  },
};

export default spec;
```

Then register it in `src/parser/languages.ts`.

## Development

```bash
npm install            # install dependencies
npm run build          # tsc → dist/
npm test               # vitest
npm run lint           # tsc --noEmit
npm run self-analyze   # index this repo
npm run self-serve     # start MCP server on port 3100
```

## Requirements

- Node.js >= 20.0.0

## License

[PolyForm Noncommercial 1.0.0](LICENSE)

Architectural inspiration from [GitNexus](https://github.com/abhigyanpatwari/GitNexus) by Abhigyan Patwari.
