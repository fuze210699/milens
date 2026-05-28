<p align="center">
  <strong>Milens</strong><br>
  <em>AI-DOS — The Operating System for AI-Driven Development</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node"></a>
  <a href="https://github.com/fuze210699/milens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <img src="https://img.shields.io/badge/tools-41-purple" alt="41 tools">
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

Milens is a code intelligence platform that gives AI coding agents instant understanding of your codebase. 41 MCP tools, 7 sub-agent prompts, 7 CLI workflows, and 50 security rules. It builds a knowledge graph of your entire project — every function, class, import, call, and inheritance chain — then exposes it through MCP tools. Agents query the graph instead of searching files. **70% fewer tokens** per session, **zero broken dependencies**, and a system that **learns from every session**.

- **Analyze once.** Tree-sitter parses 12 languages into a SQLite knowledge graph.
- **Query instantly.** FTS5 search, recursive CTE traversal — all in-database.
- **Edit safely.** Every tool returns a blast radius before you change anything.
- **Scan automatically.** 50+ security rules run in one call, not ten greps.
- **Learn continuously.** Annotations persist across sessions. Patterns auto-promote to rules.

Fully offline. Zero telemetry. Localhost-only MCP server. One command to bootstrap.

---

## Architecture

```
                         npx milens init
                               │
                         ┌─────▼──────┐
                         │  Analyzer   │  ── Parse 12 langs
                         └─────┬──────┘       (tree-sitter WASM)
                               │
                         ┌─────▼──────┐
                         │   Store     │  ── SQLite + FTS5
                         └─────┬──────┘       (symbols, links, metadata)
                               │
                         ┌─────▼──────┐
                         │   Server    │  ── MCP stdio/HTTP
                         └─────┬──────┘       41 tools
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              AI Agent (MCP)        CLI (terminal)

Pipeline stages: Parser (tree-sitter CST) → Analyzer (symbol extraction + dependency resolution) → Store (SQLite insert + index) → Server (MCP tool dispatch)
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

Open your AI agent. It auto-loads `AGENTS.md` with codebase context. You're ready.

---

## Without Milens vs With Milens

| Situation | Without Milens | With Milens |
|---|---|---|
| **Understand a new codebase** | Agent reads 15 files blind (~30,000 tokens) | `codebase_summary()` — 500 tokens |
| **Edit a function safely** | No idea what depends on it | `impact({target, depth: 3})` — exact blast radius |
| **Find all references** | Grep 5 times, read 8 files | `context({name})` — incoming + outgoing, one call |
| **Review a PR** | Read diff, guess risk | `review_pr()` — every symbol scored CRITICAL/HIGH/MEDIUM/LOW |
| **Security audit** | 10 manual greps | `security_scan()` — 50 rules, one tool call |
| **Start a new session** | Zero context | `recall()` — agent remembers every past lesson |
| **Write tests** | Guess what needs testing | `test_plan()` — mock strategy + 3 scenarios |
| **Find dead code** | Manual search | `find_dead_code()` — every symbol with zero references |

**Average savings: ~70% fewer tokens per session. ~50% faster task completion.**

---

## Features at a Glance

| Feature | Description |
|---|---|
| 🔍 Code Intelligence | 41 MCP tools — query, impact, context, trace, routes |
| 🛡️ Security Scanner | 50 rules, 9 categories, OWASP-mapped, dependency audit |
| 🤖 Sub-Agent Prompts | 7 prompts — plan, review, tdd, security, architect, debug, dead_code_remove |
| 🔄 CLI Workflows | 7 commands — tdd, review, plan, onboard, security-scan, refactor, handoff |
| 📊 Metrics | 7 quantified metrics — TER, LR, CQI, BRR, TCGR, DCER, CTR |
| 🧠 Learning Engine | Annotate → Recall → Evolve — confidence-based knowledge base |
| 🔌 12 Languages | TS, JS, Python, Java, Go, Rust, PHP, Ruby, Vue, HTML, CSS, Markdown |
| 🖥️ 7 Editors | Claude Code, Cursor, Copilot, OpenCode, Codex, Gemini CLI, Zed |

---

## CLI Commands

### Core

| Command | Description |
|---|---|
| `analyze` | Index codebase into knowledge graph |
| `serve` | Start MCP server (stdio/HTTP) |
| `search` | FTS5 search across symbols |
| `status` | Index health check |
| `metrics` | 7-metric quality report |
| `init` | Bootstrap project with profile presets |
| `watch` | Auto-reindex on file changes |

### Workflows

| Command | Description |
|---|---|
| `milens workflow tdd` | Test coverage gaps + risk-prioritized untested symbols |
| `milens workflow review` | PR risk analysis — git diff + heat scoring |
| `milens workflow plan` | Codebase summary — domains, top hubs |
| `milens workflow onboard` | Onboarding report — structure, entry points, next steps |
| `milens workflow security-scan` | Full security audit with all 50 rules |
| `milens workflow refactor` | Dead code detection + candidates |
| `milens workflow handoff` | Session knowledge summary + promotable annotations |

### Security

| Command | Description |
|---|---|
| `security scan` | Scan for vulnerabilities (scope, severity filterable) |
| `security deps` | Audit dependencies against offline CVE database |

### Maintenance

| Command | Description |
|---|---|
| `evolve` | Promote high-confidence annotations to rules/skills |
| `hooks` | Session lifecycle hook management |

---

## MCP Tools

### Search & Navigation

| Tool | Description |
|---|---|
| `query` | Find symbol definitions by name (FTS5) |
| `grep` | Text search ALL files (templates, styles, configs, docs) |
| `context` | 360° view: incoming refs + outgoing deps |
| `get_file_symbols` | All symbols in a file |
| `get_type_hierarchy` | Inheritance/implementation tree |
| `semantic_search` | Hybrid FTS5 + vector search |
| `find_similar` | Find symbols similar by topology |

### Impact & Safety

| Tool | Description |
|---|---|
| `impact` | Blast radius: what breaks if target changes |
| `edit_check` | Pre-edit safety: callers + export status + re-export chains |
| `overview` | Combined context + impact + grep in one call |
| `detect_changes` | Git diff → affected symbols + dependents |
| `find_dead_code` | Exported symbols with zero incoming references |
| `pre_commit_check` | Pre-commit risk: review_pr + dead code + coverage gaps |
| `compare_impact` | Compare impact graph before/after edit — detects regressions |

### Review & Testing

| Tool | Description |
|---|---|
| `review_pr` | PR risk assessment: scored by blast radius + test coverage |
| `review_symbol` | Single symbol deep-dive: role, heat, dependents, risk |
| `codebase_summary` | Compact ~500 token overview |
| `test_plan` | Dependency-aware test plan: mocks, strategies, scenarios |
| `test_generate` | Auto-generate test file with framework detection |
| `test_coverage_gaps` | Untested exported symbols sorted by risk |
| `test_impact` | Which tests to run for current changes |

### Orchestration

| Tool | Description |
|---|---|
| `orchestrate` | Full cycle: changes → risk → gaps → dead code → action plan |

### Understanding

| Tool | Description |
|---|---|
| `smart_context` | Intent-aware context: understand/edit/debug/test |
| `trace` | Execution flow: call chains from entrypoints to target |
| `routes` | Detect framework routes/endpoints |
| `explain_relationship` | Shortest dependency path between two symbols |
| `domains` | Domain clusters: files forming logical modules |

### Memory & Sessions

| Tool | Description |
|---|---|
| `annotate` | Record a note about a symbol (persists across sessions) |
| `recall` | Retrieve annotations from past sessions |
| `session_start` | Register agent session |
| `session_end` | End session and record stats |
| `session_context` | Get session metadata + annotations |
| `handoff` | Transfer context between agent sessions |

### Security

| Tool | Description |
|---|---|
| `security_scan` | Scan for vulnerabilities (50+ rules, 9 categories) |
| `fix_apply` | Apply security fix to a file (creates backup) |

### Hooks

| Tool | Description |
|---|---|
| `hook_onFileChange` | Re-analyze changed files + impact summary |
| `hook_preCompact` | Save metrics snapshot before context compaction |
| `hook_postCompact` | Restore context by recalling annotations |

### Developer

| Tool | Description |
|---|---|
| `ast_explore` | Parse code snippet to S-expression AST tree |
| `test_query` | Run tree-sitter query against code snippet |

### Overview

| Tool | Description |
|---|---|
| `status` | Index stats: symbols, links, files, coverage |
| `repos` | List all indexed repositories |

---

## Sub-Agent Prompts

| Prompt | Purpose |
|---|---|
| `milens-planner` | 5-step implementation planning with blast radius |
| `milens-reviewer` | PR review — risk scan → deep dive → dead code → security |
| `milens-tester` | TDD — coverage gaps → test plans → implement → verify |
| `milens-security` | Security audit — secrets, injection, unicode, crypto, config |
| `milens-architect` | Architecture analysis — domains, routes, coupling, hierarchy |
| `milens-debugger` | Root cause analysis — trace → blast radius → hypotheses → fixes |
| `dead_code_remove` | Safe dead code removal with impact verification |

---

## Security (50+ Rules)

All 50 rules map to **OWASP Top 10 (2021)**. One tool call covers what used to take 10 manual greps.

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
milens security deps                    # Offline CVE check (35 CVEs, 5 ecosystems)
```

From an AI agent: `security_scan({scope: "all", severity: "HIGH"})`

---

## Supported Languages

12 languages through tree-sitter:

| Language | Files | Imports | Calls | Heritage |
|---|---|---|---|---|
| TypeScript | `.ts` `.tsx` | ESM + CJS + decorators | ✓ | extends / implements |
| JavaScript | `.js` `.jsx` `.mjs` `.cjs` | ESM + CJS | ✓ | extends |
| Python | `.py` | import + relative | ✓ + decorators | extends |
| Java | `.java` | import + static | ✓ + annotations | extends / implements |
| Go | `.go` | import + go.mod | ✓ | embedding |
| Rust | `.rs` | use | ✓ + macros | trait impl |
| PHP | `.php` | use + include | ✓ + static, new | extends + traits |
| Ruby | `.rb` | require | ✓ | extends |
| Vue | `.vue` | ESM | ✓ template refs | extends |
| HTML | `.html` `.htm` | `<script src>` `<link>` | ✓ inline | — |
| CSS | `.css` | `@import` | — | — |
| Markdown | `.md` `.mdx` | local `[links]()` | — | headings as sections |

**Framework detection** (via `routes()`)**: Express, FastAPI, NestJS, Flask, Django, Go net/http, Gin, PHP Laravel, Rails, Sinatra, Spring.

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
MILENS_PROFILE=minimal milens serve          # 10 tools — ~500 token overhead
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

## Pricing

| Tier | Price | Key Features |
|---|---|---|
| **Free** | $0 | All 41 tools, 7 prompts, 7 workflows, 50+ security rules, CLI, community support. MIT core. |

[Full pricing details →](docs/pricing.md)

---

## Changelog

### v0.6.5 (May 2026)

- 14 new test files (168 → 554 tests, 23% → 58% coverage)
- 7 CLI workflow commands: tdd, review, plan, onboard, security-scan, refactor, handoff
- Enhanced orchestrator with snapshot persistence
- Compare impact for regression detection
- Coverage thresholds in vitest.config.ts
- CI/CD: milens-ci-test.yml workflow
- 41 MCP tools in full profile (up from 33)

### v0.6.0 (March 2026)

- 41 MCP tools, 7 sub-agent prompts
- Learning engine: annotate → recall → evolve
- Offline CVE database with 35+ CVEs across 5 ecosystems
- 7 editor harness adapters
- Hook system with 6 event triggers

[Full changelog →](https://github.com/fuze210699/milens/releases)

---

## Security & Privacy

**Zero network. Zero telemetry. Zero data leaving your machine.**

| Layer | Guarantee |
|---|---|
| **Data** | Index stored in `.milens/` per repo (gitignored). No source code in registry. |
| **Network** | HTTP binds `127.0.0.1` only. No outbound connections. |
| **Input** | User regex validated against ReDoS. FTS5 tokens quoted as literals. |
| **File access** | All paths bounded to repo root. No traversal possible. |
| **Git** | `execFileSync` with arg arrays. No shell interpolation. |
| **Embeddings** | Optional. Generated locally via Xenova transformers. No API calls. |

---

## Development

```bash
git clone https://github.com/fuze210699/milens.git
cd milens
npm install
npm run build          # tsc → dist/
npm test               # vitest (554 tests, 30 test files)
npm run lint           # tsc --noEmit
npm run self-analyze   # Index milens with milens
npm run self-serve     # Start MCP on port 3100
```

**Tech Stack:** TypeScript (ESM) · tree-sitter (WASM) · SQLite (better-sqlite3 + FTS5) · MCP SDK · Vitest · Commander

---

## License

Core (analyzer, parser, store, CLI, MCP tools): **MIT License**
Advanced features (GitHub App, enterprise): Commercial license
See [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">GitHub</a> ·
  <a href="https://github.com/fuze210699/milens/tree/main/docs">Docs</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Pricing</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/CONTRIBUTING.md">Contribute</a>
</p>
