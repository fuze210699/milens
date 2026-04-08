# milens

Code intelligence engine — parse codebases into knowledge graphs and serve them to AI agents via MCP.

## Features

- **Declarative grammars** — add a new language by writing a config, not code
- **8 languages** — TypeScript, JavaScript, Python, Java, Go, Rust, PHP, Vue
- **SQLite + FTS5** — fast full-text search with recursive CTE graph traversal
- **Token-compact MCP** — 4 tools with minimal output for AI agent efficiency
- **Incremental indexing** — only re-parse changed files

## Quick Start

```bash
npm install

# Index a codebase
npx tsx src/cli.ts analyze -p /path/to/repo --verbose

# Search symbols
npx tsx src/cli.ts search "UserService"

# 360° symbol context
npx tsx src/cli.ts inspect "AuthService"

# Blast radius analysis
npx tsx src/cli.ts impact "createUser" --depth 3

# Start MCP server (stdio)
npx tsx src/cli.ts serve

# Start MCP server (HTTP)
npx tsx src/cli.ts serve --http --port 3100
```

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
    db.ts             — Database adapter with recursive CTE
    registry.ts       — Multi-repo registry (~/.milens/)
  server/
    mcp.ts            — MCP server (stdio + HTTP)
```

### Key Design Decisions

1. **Declarative grammars**: Each language is a config object (`LangSpec`) containing tree-sitter queries. No language-specific extraction code — one universal function processes all languages.

2. **SQLite recursive CTE for impact analysis**: No need to load the full graph into memory. The database does the traversal.

3. **Token-compact output**: MCP tools return minimal structured text, not verbose descriptions. Saves 40-60% tokens for AI agents.

4. **Incremental by default**: Files are hashed; only changed files get re-parsed.

## MCP Tools

| Tool | Description |
|---|---|
| `search` | Find symbols by name/keyword (FTS5) |
| `inspect` | 360° view: incoming refs, outgoing deps |
| `impact` | Blast radius with depth grouping |
| `status` | Index stats for a repository |

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
    // ... add queries using tree-sitter playground
  },
  resolveImport(raw, fromFile, root, aliases) {
    // return resolved file path or null
  },
};

export default spec;
```

Then register in `src/parser/languages.ts`.

## License

[MIT](LICENSE)
