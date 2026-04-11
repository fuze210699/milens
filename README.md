<p align="center">
  <strong>milens</strong><br>
  <em>Code Intelligence Engine for AI Agents</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm version"></a>
  <a href="https://github.com/fuze210699/milens/blob/develop/LICENSE"><img src="https://img.shields.io/badge/license-PolyForm--Noncommercial-blue" alt="License: PolyForm Noncommercial"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js >= 20"></a>
  <img src="https://img.shields.io/badge/languages-11-orange" alt="11 Languages">
  <img src="https://img.shields.io/badge/MCP_tools-19-purple" alt="19 MCP Tools">
</p>

<p align="center">
  <strong>Index any codebase → Knowledge graph → AI agents that never miss code</strong>
</p>

<p align="center">
  <a href="#the-problem">Why?</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-your-ai-agent-gets">Agent Tools</a> •
  <a href="#editor-setup">Editors</a> •
  <a href="#supported-languages">Languages</a> •
  <a href="#architecture">Architecture</a>
</p>

---

## The Problem

AI agents are blind to structure. They see files as text, not as a connected graph of dependencies.

**A real scenario:**

1. You ask your agent to refactor `resolveLinks()` in your codebase
2. The agent searches for `"resolveLinks"` — finds matches in code, tests, comments, and docs
3. It renames the function, but misses that `resolveLinksWithStats` wraps it and `analyze()` calls the wrapper — a chain invisible to text search
4. **Your pipeline breaks. The agent didn't know the call graph.**

The root cause: text search can't distinguish a caller from a comment from a type annotation. It has no concept of "what actually depends on this at the code level."

### How milens Solves This

<p align="center">
  <img src="docs/diagram1.svg" alt="Without milens vs With milens comparison" width="700">
</p>

milens builds a **pre-indexed knowledge graph** at analysis time — resolving every import, call, and inheritance chain — so that any tool query returns the full dependency picture instantly, without multi-step exploration.

---

## Quick Start

**2 commands. That's it.**

```bash
npx milens analyze                          # index your codebase
npx milens analyze --skills                 # + generate AI skill files
```

Then add the MCP server to your editor ([setup below](#editor-setup)) and your agent immediately gets 19 tools + 4 resources + 3 prompts — with built-in instructions that teach it how to use them.

> **No config files needed.** milens sends tool usage guidance via the MCP protocol `initialize` response — every connected agent automatically learns the workflows.

---

## What Your AI Agent Gets

### 19 MCP Tools

| Tool | What It Does |
|---|---|
| **Search & Navigate** | |
| `query` | Symbol search (FTS5 full-text) |
| `grep` | Text search ALL files — templates, SCSS, configs, docs. Scoped: `all`, `code`, `imports`, `definitions` |
| `context` | 360° symbol view — incoming refs + outgoing deps |
| `get_file_symbols` | All symbols in a file with ref/dep counts |
| `get_type_hierarchy` | Inheritance/implementation tree |
| **Impact & Safety** | |
| `impact` | Blast radius: what breaks if this changes? Depth-grouped |
| `edit_check` | Pre-edit safety: callers + exports + re-export chains + test coverage + ⚠ warnings |
| `detect_changes` | `git diff` → affected symbols + direct dependents |
| `find_dead_code` | Exported symbols with zero references |
| **Understanding** | |
| `smart_context` | Intent-aware context: `understand` / `edit` / `debug` / `test` — returns only what matters |
| `trace` | Execution flow: call chains from entrypoints to a target (or downstream) |
| `routes` | Detect framework routes/endpoints (Express, FastAPI, NestJS, Flask, Go, PHP, Rails) |
| `explain_relationship` | Shortest dependency path between two symbols |
| **Codebase Overview** | |
| `overview` | Combined context + impact + grep in ONE call (saves 2-3 round trips) |
| `domains` | Domain clusters — groups of files forming logical modules |
| `repos` | List all indexed repositories with summary stats |
| `status` | Index stats, domains, test coverage, staleness |

### 4 MCP Resources

| Resource | What It Returns |
|---|---|
| `milens://overview` | Index overview: stats, domains, coverage, staleness |
| `milens://symbol/{name}` | Symbol definition + relationships |
| `milens://file/{path}` | All symbols in a file |
| `milens://domain/{name}` | Domain cluster details |

### 3 Guided Prompts

| Prompt | Workflow |
|---|---|
| `delete-feature` | grep → impact → context → full deletion plan |
| `refactor-symbol` | context → impact → grep → hierarchy → every file to update |
| `explore-symbol` | query → context → impact (both directions) → grep → summary |

### Built-in Agent Instructions

The MCP server sends **tool usage guidance** on every `initialize` — agents automatically learn:

- When to combine `impact` + `grep` (code deps + text references)
- Pre-edit workflow (`edit_check` or `smart_context intent=edit`)
- `query` for code identifiers vs `grep` for display text
- Impact depth meaning: 1 = WILL BREAK, 2 = LIKELY AFFECTED, 3 = MAY NEED TESTING
- ⚠ unresolved markers vs ✓ external (expected) classification

---

## Editor Setup

### VS Code / GitHub Copilot (recommended)

```bash
npx milens analyze -p .                     # index your repo (run once)
```

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

**Done.** Copilot now has access to 19 code intelligence tools.

<details>
<summary><strong>Other Editors</strong></summary>

#### Cursor

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

#### Claude Code

```bash
claude mcp add milens -- npx -y milens serve -p .
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

#### Codex

Add to `.codex/config.toml`:

```toml
[mcp_servers.milens]
command = "npx"
args = ["-y", "milens", "serve", "-p", "."]
```

#### HTTP Mode (remote agents)

```bash
npx milens serve --http --port 3100         # localhost only, no auth needed
```

Endpoint: `POST http://localhost:3100/mcp`

</details>

---

## Skills Generation

Generate editor-specific context files from your knowledge graph:

```bash
npx milens analyze -p . --skills            # all editors at once
npx milens analyze -p . --skills-copilot    # GitHub Copilot only
npx milens analyze -p . --skills-cursor     # Cursor only
npx milens analyze -p . --skills-claude     # Claude Code only
npx milens analyze -p . --skills-agents     # AGENTS.md only
npx milens analyze -p . --skills-windsurf   # Windsurf only
```

This generates per-area skill files with: key symbols, entry points, cross-area dependencies, and **MCP tool usage instructions** — so agents know both the codebase structure and how to use milens tools.

| Output Path | Editor |
|---|---|
| `.github/instructions/*.instructions.md` + `.github/copilot-instructions.md` | GitHub Copilot |
| `.cursor/rules/*.mdc` + `.cursor/index.mdc` | Cursor |
| `.claude/skills/generated/*/SKILL.md` + `.claude/rules/*.md` + `CLAUDE.md` | Claude Code |
| `.agents/skills/*/SKILL.md` + `AGENTS.md` | 40+ agents |
| `.windsurfrules` | Windsurf |

> Root config files use `<!-- milens:start/end -->` markers for **idempotent injection** — re-running replaces the milens section without overwriting your custom content.

---

## CLI Commands

```bash
# ── Index & Explore ──
npx milens analyze -p .                     # index current directory
npx milens analyze -p . --force --verbose   # full re-index with progress
npx milens search "UserService"             # search symbols (FTS5)
npx milens inspect "AuthService"            # 360° view: refs + deps

# ── Impact Analysis ──
npx milens impact "createUser"              # what breaks if this changes?
npx milens impact "UserModel" -d downstream # what does this depend on?

# ── MCP Server ──
npx milens serve -p .                       # stdio (for editors)
npx milens serve --http --port 3100         # HTTP (for remote agents)

# ── Management ──
npx milens status -p .                      # index stats
npx milens list                             # all indexed repos
npx milens clean -p .                       # remove index
npx milens clean --all                      # remove all indexes

# ── Dashboard ──
npx milens dashboard                        # usage analytics on port 3200
npx milens dashboard --port 8080            # custom port
```

---

## Supported Languages

| Language | Extensions | Imports | Calls | Heritage | Frameworks |
|---|---|---|---|---|---|
| TypeScript | `.ts` `.tsx` | ✓ ESM + require | ✓ + decorators | ✓ extends/implements | NestJS, React JSX |
| JavaScript | `.js` `.jsx` `.mjs` `.cjs` | ✓ ESM + require | ✓ | ✓ | React JSX, Express |
| Python | `.py` | ✓ | ✓ + decorators | ✓ | FastAPI, Flask |
| Java | `.java` | ✓ + static | ✓ + annotations, new | ✓ | Spring |
| Go | `.go` | ✓ | ✓ | — | net/http |
| Rust | `.rs` | ✓ | ✓ + macros | ✓ | — |
| PHP | `.php` | ✓ + include | ✓ + static, new | ✓ + traits | Laravel |
| Ruby | `.rb` | ✓ | ✓ | ✓ | Rails |
| Vue | `.vue` | ✓ | ✓ template refs | ✓ | Vue 3 SFC |
| HTML | `.html` `.htm` | ✓ `<script src>` `<link>` | ✓ inline `<script>` | — | — |
| CSS | `.css` | ✓ `@import` | — | — | Custom properties |

---

## Architecture

<p align="center">
  <img src="docs/diagram2.svg" alt="milens architecture: Indexing Pipeline → MCP Server → AI Agent" width="700">
</p>

### Multi-Repo Architecture

milens uses a **global registry** — one MCP server serves all indexed repos. No per-project server config needed.

<p align="center">
  <img src="docs/diagram3.svg" alt="Multi-repo architecture: CLI → Registry → Per-Repo DBs → MCP Server" width="500">
</p>

> With a single indexed repo, all tools work without specifying `repo`. When multiple repos are registered, pass `repo` to target a specific one.

### Design Decisions

| Decision | Rationale |
|---|---|
| **Declarative LangSpec** | Each language = 1 config object with tree-sitter queries. One universal extractor for all 11 languages |
| **SQLite + recursive CTE** | Impact analysis runs entirely in the database — no full graph in memory |
| **Token-compact output** | `name [kind] file:line` format — saves 40-60% tokens for AI |
| **Incremental by hash** | SHA-256 file hashing — only changed files get re-parsed |
| **Union-Find domains** | Graph-based clustering (files with ≥2 mutual links = same domain) — smarter than directory-based |
| **External-aware resolution** | Separates internal unresolved (⚠ data quality) from external packages (✓ expected) |
| **Lazy DB pools** | Connections opened on demand, evicted after 5min idle |
| **Localhost-only HTTP** | Binds `127.0.0.1` — no network exposure without explicit intent |

---

## Security & Privacy

milens is **offline by design** — zero network calls, zero telemetry. Everything executes on your machine.

| Layer | Protection |
|---|---|
| **Data locality** | Index lives in `.milens/` per repo (gitignored). Global registry (`~/.milens/`) stores only file paths — no source code |
| **HTTP transport** | Binds to `127.0.0.1` only — requires explicit `--http` flag, never auto-exposed |
| **User-supplied regex** | Validated against ReDoS patterns before execution |
| **FTS5 queries** | Each search token quoted as a literal — no query injection |
| **File access** | All reads bounded to the repo root — no path traversal |
| **Git integration** | Uses `execFileSync` with argument arrays — no shell interpolation |

---

## Tool Examples

These examples are from **milens indexing itself** (`npx milens analyze -p .`):

```
# Pre-edit safety check — real output from milens self-index
edit_check({name: "createMcpServer"})
→ createMcpServer [function] src/server/mcp.ts:272 {utility,heat:70} (exported)
  callers (2):
    calls: startStdio [function] src/server/mcp.ts:1475
    calls: startHttp [function] src/server/mcp.ts:1483
  deps (32): searchSymbols, findSymbolByName, getIncomingLinks, findUpstream,
             grepFiles, traceToEntrypoints, getDomainStats, getStaleFiles, ...

# Context — 360° view with callers and callees
context({name: "analyze"})
→ analyze [function] src/analyzer/engine.ts:23 {utility,heat:55} (exported)
  incoming:
    calls: src/cli.ts (CLI entry point)
  outgoing (26 deps):
    calls: scanFiles [function] src/analyzer/scanner.ts:11
    calls: resolveLinksWithStats [function] src/analyzer/resolver.ts:27
    calls: enrichMetadata [function] src/analyzer/enrich.ts:21
    calls: loadLanguage [function] src/parser/loader.ts:20
    calls: transaction, insertSymbol, insertLink, rebuildSearch ... (db ops)

# Impact analysis — what breaks if searchSymbols changes?
impact({target: "searchSymbols", direction: "upstream"})
→ depth 1:
    createMcpServer [function] src/server/mcp.ts:272 (calls)
  depth 2:
    startStdio [function] src/server/mcp.ts:1475 (calls)
    startHttp [function] src/server/mcp.ts:1483 (calls)

# File symbols — what's inside a file?
get_file_symbols({file: "src/store/db.ts"})
→ src/store/db.ts: 45 symbols
    Database [class] L10-461 (exported) ← 0 refs, → 0 deps
    searchSymbols [method] L150-165 ← 3 refs, → 0 deps
    findUpstream [method] L192-195 ← 3 refs, → 1 deps
    traceToEntrypoints [method] L346-388 ← 2 refs, → 2 deps
    getDomainStats [method] L406-417 ← 3 refs, → 0 deps
    ... (40 more)
```

---

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
  },
  resolveImport(raw, fromFile, root, aliases) {
    // return resolved file path or null
  },
};

export default spec;
```

Then register it in `src/parser/languages.ts`.

---

## Development

```bash
npm install              # install dependencies
npm run build            # tsc → dist/
npm test                 # vitest (43 tests)
npm run lint             # tsc --noEmit
npm run self-analyze     # index this repo
npm run self-serve       # start MCP server on port 3100
npx milens dashboard     # open usage analytics dashboard
```

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE)

Architectural inspiration from [GitNexus](https://github.com/abhigyanpatwari/GitNexus) by Abhigyan Patwari.
