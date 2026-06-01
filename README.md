<p align="center">
  <strong>Milens</strong><br>
  <em>AI-DOS — The Operating System for AI-Driven Development</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node"></a>
  <a href="https://github.com/fuze210699/milens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <img src="https://img.shields.io/badge/tools-41-purple" alt="41 tools">
  <img src="https://img.shields.io/badge/languages-12-blue" alt="12 languages">
  <img src="https://img.shields.io/badge/prompts-7-orange" alt="7 prompts">
  <img src="https://img.shields.io/badge/security-50%2B-red" alt="50+ rules">
  <img src="https://img.shields.io/badge/harnesses-7-lightgrey" alt="7 harnesses">
</p>

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">⭐ Star</a> ·
  <a href="https://github.com/sponsors/fuze210699">💖 Sponsor</a> ·
  <a href="https://github.com/fuze210699/milens/discussions">💬 Discussions</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Pro $1/seat</a>
</p>

---

## Quick Install

```bash
npx milens init --profile full
npx milens analyze -p . --force
```

---

## What is Milens?

Milens builds a **knowledge graph** of your codebase — functions, classes, imports, calls, and inheritance chains — then exposes it through 41 MCP tools. AI agents query the graph instead of reading files.

- **Parse 12 languages.** Tree-sitter WASM — TS, JS, Python, Java, Go, Rust, PHP, Ruby, Vue, HTML, CSS, Markdown.
- **Query instantly.** FTS5 + recursive CTE — all in SQLite, no API calls.
- **Edit safely.** Blast radius before every change. Symbol-level PR review with cross-file impact.
- **Scan once.** 50+ security rules in one call instead of multiple greps.
- **Learn continuously.** Annotations persist across sessions. High-confidence patterns can be promoted to rules.
- **Dual-path resolver.** Legacy proximity + scope-graph compared for parity.
- **Verify accuracy.** 8 test projects with expected.json validate precision/recall across all languages.

Fully offline. Zero telemetry. MCP server on `127.0.0.1`. Get started with `npx milens init`.

---

## Architecture

```
Source files (12 languages)
  │
  ▼
Parser ── tree-sitter WASM → CST
  │
  ▼
Analyzer ── extractFromTree() + dual-path resolver
  │           ├── Legacy: proximity-based (resolveLinksWithStats)
  │           └── Scope:  scope-graph-based (resolveWithScopes) → parity check
  │
  ▼
Store ──── SQLite + FTS5 (symbols, links, metadata, embeddings)
  │
  ▼
Server ─── MCP stdio/HTTP (41 tools)
  │
  ├── AI Agent (MCP client)
  └── CLI (terminal)
```


---

## Quick Start

```bash
npm install -g milens                     # install globally
cd your-project
milens init --profile full --interactive   # bootstrap everything
```

That single command analyzes your codebase, builds a knowledge graph, generates `AGENTS.md`, installs skill files, configures security rules, and sets up pre-commit hooks.

Then connect your editor:

```json
// .vscode/mcp.json — VS Code / Copilot
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

```bash
# Claude Code
claude mcp add milens -- npx -y milens serve -p .
```

<details>
<summary><b>More editors</b> — Cursor, OpenCode, Codex, Gemini, Zed</summary>

```bash
# Cursor — .cursor/mcp.json
{ "mcpServers": { "milens": { "command": "npx", "args": ["-y", "milens", "serve", "-p", "."] } } }

# OpenCode — .opencode/config.json
{ "mcp": { "milens": { "command": "npx", "args": ["-y", "milens", "serve"] } } }

# Codex — .codex/config.toml
[mcp_servers.milens]
command = "npx"
args = ["-y", "milens", "serve", "-p", "."]

# Gemini — .gemini/settings.json
{ "mcpServers": { "milens": { "command": "npx", "args": ["-y", "milens", "serve", "-p", "."] } } }

# Zed — .zed/settings.json
{ "mcp_servers": { "milens": { "command": "npx", "args": ["-y", "milens", "serve", "-p", "."] } } }
```

</details>

Open your AI agent. It auto-loads `AGENTS.md` with codebase context. You're ready.

---

## Without Milens vs With Milens

| Situation | Without Milens | With Milens |
|---|---|---|
| **Understand a new codebase** | Agent reads many files blind | `codebase_summary()` — compact overview |
| **Edit a function safely** | No idea what depends on it | `impact({target, depth: 3})` — exact blast radius |
| **Find all references** | Grep multiple times, read several files | `context({name})` — incoming + outgoing, one call |
| **Review a PR** | Read diff, guess risk | `review_pr()` — changed symbols scored by blast radius + test coverage |
| **Review a PR accurately** | Review guesses which functions changed | Symbol-level diff via git show — flags only actually changed symbols |
| **Clean uninstall** | Manually delete files, hooks, configs | `milens uninstall` — scan 11 categories, interactive or auto |
| **Security audit** | Multiple manual greps | `security_scan()` — 50+ rules, one tool call |
| **Start a new session** | Zero context | `recall()` — retrieves past annotations |
| **Write tests** | Guess what needs testing | `test_plan()` — dependency-aware strategy + scenarios |
| **Find dead code** | Manual search | `find_dead_code()` — exported symbols with zero references |

*And many more — see [real-world scenarios →](docs/scenarios.html)*

---

## Features

| Feature | Description |
|---|---|
| **Code Intelligence** | 41 MCP tools — search, impact, context, trace, routes |
| **Security Scanner** | 50+ rules across 9 categories + dependency audit |
| **Sub-Agent Prompts** | 7 prompts — plan, review, tdd, security, architect, debug, dead_code_remove |
| **CLI Workflows** | 7 commands — tdd, review, plan, onboard, security-scan, refactor, handoff |
| **Uninstall** | Full cleanup — 11 trace categories, interactive or auto |
| **Metrics** | 7 metrics — TER, LR, CQI, BRR, TCGR, DCER, CTR |
| **Learning Engine** | Annotate → Recall → Evolve — confidence-based annotations |
| **12 Languages** | TS, JS, Python, Java, Go, Rust, PHP, Ruby, Vue, HTML, CSS, Markdown |
| **Cross-Language Linking** | HTML class → CSS selectors, Vue template → script symbols |
| **Type Bindings & MRO** | Infer types from constructors. C3, first-wins, ruby-mixin strategies |
| **Accuracy Validation** | 8 test projects with expected.json for precision/recall |
| **Symbol-Level PR Diff** | `review_pr` diffs actual symbols between commits, not entire files |
| **7 Editor Adapters** | Claude Code, Cursor, Copilot, OpenCode, Codex, Gemini, Zed |

---

## CLI Commands

### Core

| Command | Description |
|---|---|
| `init` | Bootstrap milens: index + AGENTS.md + skills + hooks |
| `analyze` | Index a codebase: parse symbols, resolve dependencies, build search index |
| `serve` | Start MCP server (stdio/HTTP) |
| `watch` | Watch files for changes and auto re-index |
| `status` | Show index status |

### Search & Inspect

| Command | Description |
|---|---|
| `search <query>` | Search symbols by name |
| `inspect <symbol>` | 360° view: refs, deps, hierarchy |
| `impact <symbol>` | Blast radius: what breaks if this symbol changes? |

### Maintenance

| Command | Description |
|---|---|
| `clean` | Remove index for a repository |
| `uninstall` | Remove all milens traces: injected blocks, generated files, hooks, cron, database, registry, MCP configs, deps, env vars |
| `upgrade` | Upgrade milens: clear npx cache, rebuild index while keeping annotations/sessions |
| `list` | List all indexed repositories |

### Security

| Command | Description |
|---|---|
| `security scan` | Scan project for vulnerabilities (50+ rules, scope/severity filterable) |
| `security deps` | Audit dependencies for known vulnerabilities |

### Quality & Evolution

| Command | Description |
|---|---|
| `metrics` | Compute code quality and efficiency metrics |
| `evolve` | Promote high-confidence annotations to rules/skills |
| `orchestrate` | Full review cycle: detect changes → risk → coverage gaps → dead code |

### Workflows

| Command | Description |
|---|---|
| `workflow tdd` | Test coverage gaps + risk-prioritized untested symbols |
| `workflow review` | PR risk analysis — git diff + heat scoring |
| `workflow plan` | Codebase summary — domains, top hubs |
| `workflow onboard` | Onboarding report — structure, entry points |
| `workflow security-scan` | Full security audit |
| `workflow refactor` | Dead code detection + candidates |
| `workflow handoff` | Session knowledge summary |

### Hooks

| Command | Description |
|---|---|
| `hooks enable` | Turn on all hooks |
| `hooks disable` | Turn off hooks |
| `hooks profile <name>` | Apply hook presets (minimal, standard, full) |

### Dashboard

| Command | Description |
|---|---|
| `dashboard` | Open usage analytics dashboard in browser |

---

## MCP Tools

### Search & Navigation

| Tool | Description |
|---|---|
| `query` | Find symbol definitions by name (FTS5) |
| `grep` | Text search across all files — code, templates, configs, docs |
| `context` | 360° view: incoming refs + outgoing deps |
| `get_file_symbols` | All symbols in a file |
| `get_type_hierarchy` | Inheritance/implementation tree |
| `semantic_search` | Hybrid FTS5 + vector search (requires `--embeddings`) |
| `find_similar` | Find symbols topologically similar |

### Impact & Safety

| Tool | Description |
|---|---|
| `impact` | Blast radius — what breaks if this symbol changes? |
| `edit_check` | Pre-edit safety: callers, export status, re-export chains, warnings |
| `overview` | Combined context + impact + grep in one call |
| `detect_changes` | Git diff → affected symbols + dependents |
| `find_dead_code` | Exported symbols with zero incoming references |
| `pre_commit_check` | Pre-commit risk: review_pr + dead code + coverage gaps |
| `compare_impact` | Compare impact graph before/after edit |

### Review & Testing

| Tool | Description |
|---|---|
| `review_pr` | PR risk assessment: symbol-level diff via git show, cross-file impact |
| `review_symbol` | Single symbol deep-dive: role, heat, dependents, test status, risk |
| `codebase_summary` | Compact codebase overview: domains, top hubs, coverage |
| `test_plan` | Dependency-aware test strategy: mocks, scenarios |
| `test_generate` | Auto-generate test file with framework detection |
| `test_coverage_gaps` | Untested exported symbols sorted by risk |
| `test_impact` | Map code changes to which test files to run |

### Orchestration

| Tool | Description |
|---|---|
| `orchestrate` | detect_changes → review_pr → impact → coverage gaps → dead code → action plan |

### Understanding

| Tool | Description |
|---|---|
| `smart_context` | Intent-aware: understand/edit/debug/test |
| `trace` | Execution flow: call chains from entrypoints to target |
| `routes` | Detect framework routes/endpoints (Express, FastAPI, NestJS, etc.) |
| `explain_relationship` | Shortest dependency path between two symbols |
| `domains` | Domain clusters: files forming logical modules |

### Memory & Sessions

| Tool | Description |
|---|---|
| `annotate` | Record a note about a symbol (persists across sessions) |
| `recall` | Retrieve annotations from past sessions |
| `session_start` | Register agent session for multi-agent coordination |
| `session_end` | End session and record stats |
| `session_context` | Get session metadata + annotations |
| `handoff` | Transfer context between agent sessions |

### Security

| Tool | Description |
|---|---|
| `security_scan` | Scan for vulnerabilities — 50+ rules, 9 categories |
| `fix_apply` | Apply security fix to a file (creates backup) |

### Hooks

| Tool | Description |
|---|---|
| `hook_onFileChange` | Trigger when files are modified → impact summary |
| `hook_preCompact` | Save metrics snapshot before context compaction |
| `hook_postCompact` | Restore context by recalling annotations after compaction |

### Codebase Overview

| Tool | Description |
|---|---|
| `status` | Index stats: symbols, links, files, coverage, staleness |
| `repos` | List all indexed repositories with summary stats |

### Developer

| Tool | Description |
|---|---|
| `ast_explore` | Parse code snippet to S-expression AST tree |
| `test_query` | Run tree-sitter query against code snippet |

---

## Sub-Agent Prompts

| Prompt | Purpose |
|---|---|
| `milens-planner` | Implementation planning with blast radius + test strategy |
| `milens-reviewer` | PR review — risk scan → deep dive → dead code → security |
| `milens-tester` | TDD — coverage gaps → test plans → implement → verify |
| `milens-security` | Security audit — secrets, injection, unicode, crypto, config |
| `milens-architect` | Architecture analysis — domains, routes, coupling, hierarchy |
| `milens-debugger` | Root cause analysis — trace → blast radius → hypotheses → fixes |
| `dead_code_remove` | Safe dead code removal with impact verification |

---

## Security (50+ Rules)

Rules cover common vulnerability patterns. One `security_scan()` call replaces multiple manual greps.

| Category | Rules | Detects |
|---|---|---|
| **secrets** | 10 | AWS keys, GitHub tokens, OpenAI keys, private keys, hardcoded passwords |
| **injection** | 9 | SQL injection, XSS, command injection, `eval()`, `exec()`, dangerous DOM |
| **unicode** | 4 | Zero-width chars, bidi override, homoglyph attacks |
| **dangerous** | 7 | `os.system`, `subprocess shell`, unsafe deserialization, `spawn shell` |
| **config** | 5 | CORS wildcards, insecure cookies, debug mode |
| **data-leak** | 5 | `console.log` of secrets, hardcoded URLs |
| **crypto** | 4 | MD5, SHA1, `Math.random()` for crypto, hardcoded salt/IV |
| **auth** | 4 | String comparison, missing middleware, JWT without expiry |
| **file-access** | 2 | Path traversal, unsafe file reads |

```bash
milens security scan --scope secrets --severity HIGH --format json
milens security deps                    # Offline CVE database check
```

From an AI agent: `security_scan({scope: "all", severity: "HIGH"})`

---

---

## Editor Adapters

Milens works with any MCP-compatible agent:

| Harness | Config File | Recommended Profile |
|---|---|---|
| **Claude Code** | `.claude/mcp.json` | standard |
| **OpenCode** | `.opencode/config.json` | standard |
| **VS Code / Copilot** | `.vscode/mcp.json` | standard |
| **Cursor** | `.cursorrules` | standard |
| **Codex** | `.codex/codex.md` | standard |
| **Gemini** | `.gemini/context.md` | minimal (10 tools) |
| **Zed** | `.zed/settings.json` | minimal |

Each adapter is in the `adapters/` directory with ready-to-copy config files and agent instructions.

### Profile Selection

```bash
MILENS_PROFILE=minimal milens serve          # 10 tools — lighter footprint
MILENS_PROFILE=standard milens serve         # 25 tools — full daily coding
milens serve --profile full                  # 41 tools — everything
```

---

## Metrics

Seven quantified metrics for AI-driven development:

| Metric | Full Name | What It Tracks |
|---|---|---|
| **TER** | Token Efficiency Ratio | Useful tokens ÷ total tokens |
| **LR** | Learning Rate | Savings gained ÷ savings possible |
| **CQI** | Code Quality Index | Coverage + security + coupling + docs |
| **BRR** | Bug Recurrence Rate | Bugs repeated ÷ total fixed |
| **TCGR** | Test Coverage Growth Rate | Weekly coverage improvement |
| **DCER** | Dead Code Elimination Rate | Dead symbols ÷ total exported |
| **CTR** | Cycle Time Reduction | Time saved vs manual approach |

```bash
milens metrics
```

---

## Learning & Evolution

The system gets smarter every session:

```
SESSION 1:  Agent finds bug in createUser()
            → annotate({symbol: "createUser", key: "bug", value: "Call createUser() before normalizeEmail()"})
            → confidence: 0.5

SESSION 2:  Agent auto-recalls the annotation
            → "I know createUser() has a known issue. I'll handle the order correctly."
            → Bug avoided. confidence ↑ 0.7

SESSION 5:  Confidence reaches 0.9
            → milens evolve promotes it to .agents/skills/milens-bug/SKILL.md
            → Now enforced as a rule for every future session
```

---

## Hook System (6 Triggers)

| Hook | When | Default Action |
|---|---|---|
| `onSessionStart` | Agent begins work | Refresh index + codebase_summary + recall past warnings |
| `onSessionEnd` | Agent finishes | detect_changes + review_pr + auto-annotate changed symbols |
| `onPreCommit` | Before `git commit` | detect_changes + review_pr + find_dead_code |
| `onFileChange` | Files modified | Re-analyze changed files + impact on affected symbols |
| `onPreCompact` | Before context window compaction | Save codebase_summary snapshot |
| `onPostCompact` | After compaction | recall annotations to restore lost context |

```bash
milens hooks enable                          # Turn on all hooks
milens hooks profile standard                # Preset: SessionStart, SessionEnd, PreCommit
milens hooks disable --hook preCommit        # Turn off one hook
```

---

## Security & Privacy

Milens runs entirely on your machine. **No network calls. No telemetry. No data ever leaves your device.**

| What you worry about | How milens protects you |
|---|---|
| Source code leaking | Index stored in `.milens/` per repo, gitignored by default. Registry tracks repo paths only — zero source code stored. |
| Network calls | MCP server binds `127.0.0.1` exclusively. No outbound connections. Works fully offline. |
| Shell injection | All system calls use `execFileSync` with argument arrays — no string interpolation into shell. |
| Path traversal | File paths bounded to repo root. Symlinks outside root are rejected. |
| Dependency CVEs | Optional `security deps` audit against offline CVE database. No external API calls. |
| Embeddings privacy | Optional. Generated locally via Xenova transformers. No data sent to any service. |
| Input attacks | Regex validated against ReDoS. FTS5 tokens passed as SQLite literals. |

Everything that touches your code stays on your filesystem. Built for production use with zero trust required.

---

## Supported Languages

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-.ts%20.tsx-3178C6?logo=typescript&logoColor=white" alt="TS">
  <img src="https://img.shields.io/badge/JavaScript-.js%20.jsx-F7DF1E?logo=javascript&logoColor=black" alt="JS">
  <img src="https://img.shields.io/badge/Python-.py-3776AB?logo=python&logoColor=white" alt="PY">
  <img src="https://img.shields.io/badge/Java-.java-ED8B00?logo=openjdk&logoColor=white" alt="Java">
  <img src="https://img.shields.io/badge/Go-.go-00ADD8?logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Rust-.rs-000000?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/PHP-.php-777BB4?logo=php&logoColor=white" alt="PHP">
  <img src="https://img.shields.io/badge/Ruby-.rb%20.rake-CC342D?logo=ruby&logoColor=white" alt="Ruby">
  <img src="https://img.shields.io/badge/Vue-.vue-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue">
  <img src="https://img.shields.io/badge/HTML-.html%20.htm-E34F26?logo=html5&logoColor=white" alt="HTML">
  <img src="https://img.shields.io/badge/CSS-.css-1572B6?logo=css3&logoColor=white" alt="CSS">
  <img src="https://img.shields.io/badge/Markdown-.md%20.mdx-000000?logo=markdown&logoColor=white" alt="MD">
</p>

12 languages parsed via tree-sitter WASM. [Full support details →](docs/languages.md)

## License

Core (analyzer, parser, store, CLI, MCP tools): **MIT License**
Advanced features (GitHub App, enterprise): Commercial license
See [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">GitHub</a> ·
  <a href="https://github.com/fuze210699/milens/tree/main/docs">Docs</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/cli.md">CLI</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/accuracy.md">Accuracy</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/languages.md">Languages</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Pricing</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/CONTRIBUTING.md">Contribute</a>
</p>
