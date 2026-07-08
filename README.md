<p align="center">
  <strong>Milens</strong><br>
  <em>Your AI butler</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node"></a>
  <a href="https://github.com/fuze210699/milens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <img src="https://img.shields.io/badge/tools-43-purple" alt="43 tools">
  <img src="https://img.shields.io/badge/languages-12-blue" alt="12 languages">
  <img src="https://img.shields.io/badge/prompts-6-orange" alt="6 prompts">
  <img src="https://img.shields.io/badge/security-190%2B-red" alt="190+ rules">
  <img src="https://img.shields.io/badge/harnesses-7-lightgrey" alt="7 harnesses">
  <a href="https://github.com/fuze210699/milens/actions/workflows/milens-ci-test.yml"><img src="https://github.com/fuze210699/milens/actions/workflows/milens-ci-test.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/npm/dm/milens" alt="npm downloads">
  <img src="https://img.shields.io/npm/dt/milens" alt="npm total">

</p>

<p align="center">
  <a href="https://github.com/fuze210699/milens">⭐ Star</a> ·
  <a href="https://github.com/sponsors/fuze210699">💖 Sponsor</a> ·
  <a href="https://github.com/fuze210699/milens/discussions">💬 Discussions</a> ·
</p>

## The Problem

**Burning cash** on AI with **digital amnesia**? Every **blind edit** is a **production bomb** you pay to defuse.
**Milens** — *Your AI Butler*. Full codebase **memory**, instant **context**, **zero** repeated questions. It knows what's **fragile** before your agent **breaks** it.

> **Stop burning cash. Stop burning prod.**

---

## What is Milens?

A **free**, self-hosted **knowledge graph** for your codebase — and the **MCP toolkit** that lets your AI agent query it instantly.

Instead of reading files blindly, your agent asks the graph.  
Instead of guessing side effects, it sees **exact blast radius** before editing.  
Instead of starting from zero, it **remembers** what you taught it last session.

**12 languages.** One SQLite file. **43 MCP tools.** Zero API costs.  

> Parse locally. Query locally. Learn locally. **Forever free.**

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

---

## Quick Start

```bash
npm install -g milens
cd your-project
milens init --profile full --interactive
```
One command. Your codebase becomes a queryable graph. AGENTS.md, skills, and hooks ready.

Then connect your editor:

##### Visual Studio Code

```json
.vscode/mcp.json
{
  "servers": {
    "milens": {
      "type": "stdio",
      "command": "milens",
      "args": ["serve", "-p", "${workspaceFolder}"]
    }
  }
}
```

##### Claude Code

```bash
claude mcp add milens -- milens serve -p .
```

Or drop this in `.mcp.json` at your project root (equivalent, works the same in the CLI, VS Code extension, and desktop app):

```json
{
  "mcpServers": {
    "milens": {
      "type": "stdio",
      "command": "milens",
      "args": ["serve", "-p", "."]
    }
  }
}
```

Or install as a plugin from the marketplace:

```bash
/plugin marketplace add fuze210699/milens
/plugin install milens
```

See [adapters/README.md](adapters/README.md#claude-code--via-plugin-install-marketplace) for how this avoids the workspace-root pitfall that broke earlier plugin builds.

<details>
<summary><b>More editors</b> — Cursor, OpenCode, Codex, Gemini, Zed</summary>

```bash
# Cursor — .cursor/mcp.json
{ "mcpServers": { "milens": { "command": "milens", "args": ["serve", "-p", "${workspaceFolder}"] } } }

# OpenCode — opencode.json
{ "mcp": { "milens": { "type": "local", "command": ["milens", "serve", "-p", "."] } } }

# Codex — .codex/config.toml
[mcp_servers.milens]
command = "milens"
args = ["serve", "-p", "."]

# Gemini — .gemini/settings.json
{ "mcpServers": { "milens": { "command": "milens", "args": ["serve", "-p", "${workspaceFolder}"] } } }

# Zed — .zed/settings.json
{ "context_servers": { "milens": { "command": "milens serve -p ." } } }
```

</details>


> Verify Milens appears in your IDE's MCP server list. Then ask your agent: milens status. Green light means your codebase is indexed. You're live.

---

## Why Milens

| Capability | Without Milens | With Milens |
|---|---|---|
| **Understand a codebase** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Edit safely** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Find references** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Review PRs** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Uninstall cleanly** | ⭐ | ⭐⭐⭐⭐⭐ |
| **Security audit** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Session memory** | ⭐ | ⭐⭐⭐⭐⭐ |
| **Write tests** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Find dead code** | ⭐⭐ | ⭐⭐⭐⭐⭐ |

*And many more — see [real-world scenarios →](https://milens.vercel.app/scenarios.html)*

---

## Architecture

| Layer | Technology | Output |
|---|---|---|
| **Ingestion** | Tree-sitter WASM | CST from 12 languages |
| **Analysis** | Dual-path resolver | Symbols + verified links |
| **Storage** | SQLite + FTS5 | Queryable knowledge graph |
| **Interface** | MCP stdio / HTTP | 43 tools |
| **Clients** | AI agents, CLI, editors | Context-aware actions |
---

## Key Features

| Feature | Description |
|---|---|
| **Code Intelligence** | 43 MCP tools — search, impact, context, trace, routes |
| **Security Scanner** | 190 rules across 9 categories + dependency audit |
| **Sub-Agent Prompts** | 6 prompts — plan, review, tdd, security, architect, debugger |
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

## Security & Privacy

**Zero trust. Zero network. Zero leaks.**

|  |  |
|:---|:---|
| 🔒 **Air-gapped** | Runs entirely offline. No outbound connections. No telemetry. |
| 🏠 **Your code, your disk** | Index lives in `.milens/` per repo. Gitignored by default. Zero source code in registry. |
| 🛡️ **Localhost-only** | MCP server binds `127.0.0.1` exclusively. External requests blocked. |
| ⚡ **Safe execution** | `execFileSync` with argument arrays. No shell string interpolation. No path traversal. |
| 🔍 **Offline audits** | Optional CVE check against local database. No API calls. |
| 🔐 **Private embeddings** | Optional. Generated locally via Xenova transformers. No data leaves your machine. |
| 🧱 **Input hardening** | ReDoS-safe regex. FTS5 tokens bound as SQLite literals. |

Everything that touches your code stays on your filesystem. **Built for production. Trust nothing.**


---

## Pricing

| | Free | Pro |
|---|---|---|
| **Cost** | $0 | $5/seat/month |
| **43 MCP tools** | ✓ | ✓ |
| **CLI + workflows** | ✓ | ✓ |
| **Security scanner** | 190 rules | 190 rules + advanced |
| **Private repos** | — | ✓ |
| **PR auto-review** | — | ✓ Every PR |
| **Push auto-index** | — | ✓ On push to main |
| **Analyses/month** | 10 (public repos) | 50/seat (pooled) |
| **Custom skill packs** | — | ✓ |
| **Priority support** | — | ✓ Email + Slack |

For solo devs: all 43 tools are free forever. For teams: the GitHub App automates review and security on every PR, saving ~$300/month in AI tokens for a team of 5. [Full pricing →](docs/pricing.md)

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
| `security scan` | Scan project for vulnerabilities (190 rules, scope/severity filterable) |
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
| `security_scan` | Scan for vulnerabilities — 190 rules, 9 categories |
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
milens serve --profile full                  # 43 tools — everything
```

---

## 🔒 Security Scanner

> **190+ rules. 25 categories. One call.**

Replace ten manual greps with a single `security_scan()`. OWASP Top 10 mapped. Offline. Zero API calls.

| Category | Rules | Detects |
|:---:|:---:|:---|
| 🔑 **Secrets** | 70+ | AWS keys, GitHub tokens, JWT secrets, private keys, cloud credentials |
| 💉 **Injection** | 26 | SQLi, NoSQLi, XSS, SSTI, LDAP, XPath, CRLF, GraphQL |
| 🧨 **RCE** | 6 | `eval()`, `exec()`, `child_process`, PowerShell, dynamic class loading |
| 🧬 **Deserialization** | 9 | `pickle`, `yaml.load`, Java `readObject`, PHP `unserialize` |
| 🌐 **SSRF** | 4 | User-controlled URL fetch, file/gopher protocols, cloud metadata |
| 📁 **File Access** | 6 | Path traversal, `fs.readFile` with user input, unrestricted upload |
| 🔐 **Auth** | 12 | Missing middleware, JWT none alg, IDOR, mass assignment, session fixation |
| 🛡️ **Crypto** | 15 | MD5, SHA1, DES, ECB, weak RSA, custom crypto, `Math.random()` for tokens |
| ⚙️ **Config** | 5 | CORS wildcard, insecure cookies, debug mode in production |
| 📤 **Data Leaks** | 5 | `console.log(password)`, hardcoded URLs with credentials |
| 🔤 **Unicode** | 4 | Bidi override, zero-width chars, homoglyph attacks |
| 🐳 **IaC** | 3+ | Dockerfile secrets, K8s hardcoded creds, Terraform exposed keys |

**Dependency audit included:**
```bash
milens security scan # Full audit, 190+ rules
milens security scan --scope secrets --severity HIGH
milens security deps # Offline CVE check: npm, Python, Rust, Go, Java
```

From an AI agent: `security_scan({scope: "all", severity: "HIGH"})`

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

## Contributing

| Type | How | Where |
|---|---|---|
| **Skill files** | Create reusable agent workflows | `.agents/skills/` |
| **Security rules** | Add new vulnerability patterns | `src/security/rules.ts` |
| **Adapter packs** | Connect milens to new harnesses | `adapters/` |
| **Core features** | Improve tools, parser, analyzer | `src/` |
| **Documentation** | Fix docs, add examples | `docs/` |
| **Bug reports** | Report issues with reproduction | [Issues](https://github.com/fuze210699/milens/issues) |

```bash
git clone https://github.com/fuze210699/milens.git
cd milens
npm install && npm run build && npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details — skill format, security rule format, PR process, and code of conduct.

---

## License

Core (analyzer, parser, store, CLI, MCP tools): **MIT License**
See [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">GitHub</a> ·
  <a href="https://github.com/fuze210699/milens/tree/main/docs">Docs</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/cli.md">CLI</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/accuracy.md">Accuracy</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/languages.md">Languages</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Pricing</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/CONTRIBUTING.md">Contribute</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/SECURITY.md">Security</a>
</p>
