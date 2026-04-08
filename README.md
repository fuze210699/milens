<p align="center">
  <strong>milens</strong><br>
  <em>Lightweight Code Intelligence Engine</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#cli-commands">CLI</a> •
  <a href="#mcp-server">MCP Server</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#adding-a-language">Extend</a>
</p>

---

Parse codebases into **knowledge graphs** — symbols, imports, calls, inheritance — and serve them to **AI agents** via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## Features

- **8 languages** — TypeScript, JavaScript, Python, Java, Go, Rust, PHP, Vue
- **Declarative grammars** — add a new language by writing a config object, not extraction code
- **SQLite + FTS5** — full-text symbol search + recursive CTE graph traversal
- **Token-compact MCP** — 4 tools with minimal output, saving 40-60% tokens for AI agents
- **Incremental indexing** — file-hash based, only re-parses changed files
- **Multi-repo registry** — manage multiple codebases from `~/.milens/`
- **Dual transport** — MCP over stdio (VS Code / Cursor) or HTTP (remote agents)

## Quick Start

```bash
# Install dependencies
npm install

# Index the current project
npx tsx src/cli.ts analyze -p . --verbose

# Search for symbols
npx tsx src/cli.ts search "UserService"

# Start MCP server for AI agents
npx tsx src/cli.ts serve --http --port 3100
```

## CLI Commands

### `analyze` — Index a codebase

```bash
milens analyze -p /path/to/repo --verbose --force
```

Scans source files, parses symbols using tree-sitter, resolves imports/calls/inheritance, and stores everything in a local SQLite database at `.milens/milens.db`.

| Flag | Description |
|---|---|
| `-p, --path` | Repository root (default: `.`) |
| `-o, --output` | Custom output directory for the database |
| `-v, --verbose` | Show detailed progress |
| `-f, --force` | Force full re-index (skip hash check) |

### `search` — Find symbols

```bash
milens search "createUser" --limit 10
```

Full-text search across all indexed symbol names using FTS5.

### `inspect` — 360° symbol context

```bash
milens inspect "AuthService"
```

Shows a symbol's incoming references (who calls/uses it) and outgoing dependencies (what it calls/imports/extends).

### `impact` — Blast radius analysis

```bash
milens impact "UserModel" --direction upstream --depth 3
```

Answers: *"What breaks if this symbol changes?"* Uses recursive CTEs to traverse the dependency graph up to N levels deep.

| Flag | Description |
|---|---|
| `-d, --direction` | `upstream` (default) or `downstream` |
| `--depth` | Max traversal depth (default: `3`) |

### `status` — Index stats

```bash
milens status -p /path/to/repo
```

Shows symbol count, link count, file count, and last indexed time.

### `serve` — Start MCP server

```bash
# stdio transport (for VS Code / Cursor)
milens serve -p /path/to/repo

# HTTP transport (for remote agents)
milens serve -p /path/to/repo --http --port 3100
```

## MCP Server

milens exposes 4 tools via the Model Context Protocol:

| Tool | Description | Key params |
|---|---|---|
| `search` | Find symbols by name/keyword (FTS5) | `query`, `limit` |
| `inspect` | Incoming refs, outgoing deps, hierarchy | `name` |
| `impact` | Blast radius with depth grouping | `target`, `direction`, `depth` |
| `status` | Index stats for a repository | `repo` |

### VS Code / Cursor Integration

Add to your MCP settings (`mcp.json`):

```json
{
  "servers": {
    "milens": {
      "command": "npx",
      "args": ["tsx", "/path/to/milens/src/cli.ts", "serve", "-p", "/path/to/repo"]
    }
  }
}
```

### HTTP Mode

```bash
milens serve --http --port 3100
```

Endpoint: `POST http://localhost:3100/mcp`

## Architecture

```
src/
  cli.ts              — CLI entry point (commander)
  types.ts            — Shared type definitions
  parser/
    loader.ts         — Tree-sitter WASM loading
    extract.ts        — Universal extractor + LangSpec interface
    lang-*.ts         — Declarative grammar per language
    languages.ts      — Language registry
  analyzer/
    scanner.ts        — File discovery (.gitignore aware)
    resolver.ts       — Import + call + heritage resolution
    engine.ts         — Pipeline orchestrator
  store/
    schema.sql        — SQLite schema with FTS5
    db.ts             — Database adapter with recursive CTE queries
    registry.ts       — Multi-repo registry (~/.milens/)
  server/
    mcp.ts            — MCP server (stdio + HTTP transports)
```

### How It Works

1. **Scan** — Discover source files respecting `.gitignore`
2. **Parse** — Extract symbols (functions, classes, interfaces, ...) via tree-sitter WASM grammars
3. **Resolve** — Link imports → symbols, calls → definitions, inheritance chains
4. **Store** — Write symbols + links to SQLite with FTS5 search index
5. **Serve** — Expose the knowledge graph via MCP tools or CLI

### Design Decisions

- **Declarative `LangSpec`**: Each language is a config object with tree-sitter queries. One universal extractor processes all languages — no per-language extraction code.
- **SQLite recursive CTE**: Impact analysis traverses the graph inside the database. No need to load the full graph into memory.
- **Token-compact output**: MCP responses use minimal structured text, not verbose descriptions.
- **Incremental by default**: File content is hashed; only changed files get re-parsed on subsequent runs.

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

## Requirements

- Node.js >= 20.0.0

## License

[MIT](LICENSE)
