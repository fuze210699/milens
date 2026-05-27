<p align="center">
  <strong>Milens</strong><br>
  <em>AI-DOS — The Operating System for AI-Driven Development</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node"></a>
  <a href="https://github.com/fuze210699/milens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <img src="https://img.shields.io/badge/tools-33-purple" alt="33 tools">
  <img src="https://img.shields.io/badge/prompts-6-orange" alt="6 prompts">
  <img src="https://img.shields.io/badge/security-50%2B-red" alt="50+ rules">
  <img src="https://img.shields.io/badge/harnesses-7-lightgrey" alt="7 harnesses">
</p>

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">⭐ Star</a> ·
  <a href="https://github.com/sponsors/fuze210699">💖 Sponsor</a> ·
  <a href="https://github.com/fuze210699/milens/discussions">💬 Discussions</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Pro $19/seat</a>
</p>

---

## The Problem

AI coding agents are powerful — but they don't truly know your codebase.

**What happens every session:**

1. Agent edits `UserService.validate()`
2. Doesn't know 47 functions depend on its return type
3. **Breaking changes ship to production**

The deeper issue: agents waste **70% of their context window** just trying to understand the codebase. Reading files one by one. Grep'ing for references. Tracing call chains manually. Every session starts from zero — last session's discoveries are gone.

After 10-20 AI sessions, the codebase accumulates dead code, untested hubs, and forgotten security gaps. The agent gets slower, more confused, and more expensive — while the developer burns tokens and patience.

---

## Without Milens vs With Milens

| Situation | Without Milens | With Milens |
|---|---|---|
| **Understand a new codebase** | Agent reads 15 files blind (~30,000 tokens) | `codebase_summary()` — 500 tokens, complete overview |
| **Edit a function safely** | No idea what depends on it. Hope it doesn't break. | `impact({target, depth: 3})` — exact blast radius before every edit |
| **Find all references** | Grep 5 times, read 8 files, miss template usages | `context({name})` — incoming + outgoing, one call |
| **Review a PR** | Read diff, guess risk, miss hidden dependencies | `review_pr()` — every symbol scored CRITICAL/HIGH/MEDIUM/LOW |
| **Security audit** | 10 manual greps for secrets, injections, unicode | `security_scan()` — 50 rules, one tool call |
| **Start a new session** | Zero context. Re-learn everything from scratch. | `recall()` — agent remembers every past bug, caveat, and pattern |
| **Write tests** | Guess what needs testing. Guess how to mock. | `test_plan()` — mock strategy + 3 scenarios + coverage gaps sorted by risk |
| **Find dead code** | Manual search. "Is this still used? I'm not sure." | `find_dead_code()` — every exported symbol with zero references |

**Average savings: ~70% fewer tokens per session. ~50% faster task completion.**

---

## What is Milens?

Milens gives AI coding agents **instant code intelligence**. Instead of reading 15 files to understand a codebase, your agent calls one tool and gets the full picture in 500 tokens.

It builds a **knowledge graph** of your entire project — every function, class, import, call, and inheritance chain — then exposes it through 33 MCP tools. Agents query the graph instead of searching files. The result: **70% fewer tokens** per session, **zero broken dependencies**, and a system that **learns from every session**.

- **Analyze once.** Tree-sitter parses 12 languages into a SQLite knowledge graph.
- **Query instantly.** FTS5 search, recursive CTE traversal, vector similarity — all in-database.
- **Edit safely.** Every tool returns a blast radius before you change anything.
- **Scan automatically.** 50+ security rules run in one call, not ten greps.
- **Learn continuously.** Annotations persist across sessions. Patterns auto-promote to rules.

Fully offline. Zero telemetry. Localhost-only MCP server. One command to bootstrap.

```
npx milens init --profile full
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
```

Open your AI agent. It auto-loads `AGENTS.md` with codebase context. You're ready.

---

## Architecture

```
                         npx milens init
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         ANALYZE           GENERATE           CONFIGURE
    tree-sitter parse     AGENTS.md         security rules
    resolve imports       skill files       pre-commit hooks
    build graph          adapter packs      CI templates
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                       milens serve
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         33 MCP TOOLS    6 SUB-AGENT     50+ SECURITY
       query, impact,     PROMPTS            RULES
       context, trace,   planner,         secrets, injection,
       review_pr, ...    reviewer, ...    unicode, crypto, ...
                               │
                               ▼
                        AI CODING AGENT
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         CODE SAFELY     REVIEW AUTO      LEARN CONTINUOUSLY
       edit_check()    review_pr()      annotate → recall
       impact()        security_scan()  evolve → promote
```

### Four-Layer Stack

```
┌─────────────────────────────────────────────────────────┐
│  PLATFORM LAYER                                         │
│  GitHub App · npm · 7 adapter packs · Desktop Dashboard │
│  Pricing: Free / Pro ($19/seat) / Enterprise            │
├─────────────────────────────────────────────────────────┤
│  AUTOMATION LAYER                                       │
│  6 Hooks (SessionStart, SessionEnd, PreCommit, ...)     │
│  Auto-annotate · Auto-recall · Watch mode               │
│  Scheduled evolve (cron/schtasks) · Pre-commit hooks    │
├─────────────────────────────────────────────────────────┤
│  WORKFLOW LAYER                                         │
│  6 Sub-agent Prompts (planner, reviewer, tester, ...)   │
│  6 Skill files · AGENTS.md auto-generator               │
│  Selective profiles (minimal/standard/full)             │
├─────────────────────────────────────────────────────────┤
│  INTELLIGENCE LAYER                                     │
│  Knowledge Graph (SQLite+FTS5) · 33 MCP Tools            │
│  Memory (annotations+sessions) · Learning (confidence)  │
│  50+ Security Rules (OWASP) · 7 Metrics (TER, CQI, ...) │
└─────────────────────────────────────────────────────────┘
```

### Pipeline

| Stage | What Happens | Technology |
|---|---|---|
| **Scan** | Discover source files by extension | Node.js `fs` |
| **Parse** | Extract symbols, imports, calls, heritage | tree-sitter WASM (12 languages) |
| **Resolve** | Match imports to files, calls to definitions | Cross-file linker |
| **Enrich** | Compute roles, heat scores, domain clusters | Union-find + PageRank-like |
| **Persist** | Store everything in SQLite | better-sqlite3 + FTS5 |
| **Serve** | Expose via MCP protocol | stdio + StreamableHTTP |
| **Learn** | Annotate → confidence score → promote → skill | SQLite + evolution log |
| **Scan** | 50+ regex rules across all files | Built-in security engine |

### Design Principles

| Principle | Implementation |
|---|---|
| **One parse, infinite queries** | Knowledge graph pre-computed at analyze time |
| **Zero network** | Everything offline. No API calls. No telemetry. |
| **Token-compact** | `name [kind] file:line` format saves 40-60% tokens |
| **Incremental** | SHA-256 file hashing. Only changed files re-parsed. |
| **In-database traversal** | Recursive CTEs for graph queries. No full graph in memory. |
| **Localhost only** | HTTP binds 127.0.0.1. No network exposure. |
| **MCP standard** | Works with any MCP-compatible agent. No vendor lock-in. |

---

## MCP Tools (33)

### Search & Navigation

| Tool | Does |
|---|---|
| `query` | FTS5 full-text search for symbol definitions |
| `grep` | Regex search across ALL project files (code, configs, docs, templates) |
| `context` | 360° view: who calls this + what this depends on |
| `get_file_symbols` | Every symbol in a file with ref/dep counts |
| `get_type_hierarchy` | Full inheritance tree — ancestors + descendants |

### Safety & Impact

| Tool | Does |
|---|---|
| `impact` | Blast radius: depth 1-3 traversal showing what breaks |
| `edit_check` | Pre-edit safety: callers, re-exports, test coverage, warnings |
| `detect_changes` | Git diff → which symbols changed + their dependents |
| `find_dead_code` | Exported symbols with zero incoming references |
| `overview` | context + impact + grep combined in one call |

### Understanding Code

| Tool | Does |
|---|---|
| `smart_context` | Intent-aware context: `edit` / `debug` / `test` / `understand` |
| `trace` | Full execution path from entrypoints to target (or reverse) |
| `routes` | Auto-detect API endpoints across 11 frameworks |
| `explain_relationship` | Shortest dependency chain between any two symbols |
| `domains` | Module clusters based on cross-file dependency graph |

### Review & Testing

| Tool | Does |
|---|---|
| `review_pr` | Scores every changed symbol CRITICAL/HIGH/MEDIUM/LOW |
| `review_symbol` | Deep-dive: role, heat, dependents, test status, recommendation |
| `codebase_summary` | ~500 token overview for session bootstrap |
| `test_plan` | Mock strategy + 3+ test scenarios based on dependencies |
| `test_coverage_gaps` | Untested symbols sorted by risk |
| `test_impact` | Maps changed code → which test files to run |

### Memory & Sessions

| Tool | Does |
|---|---|
| `annotate` | Save observation about a symbol (persists forever) |
| `recall` | Retrieve past annotations by symbol, key, agent, or session |
| `session_start` | Begin new session with agent identity |
| `session_context` | Session metadata + tool calls + annotations |
| `session_end` | Close session, record stats |
| `handoff` | Transfer all context from one agent session to another |

### Security

| Tool | Does |
|---|---|
| `security_scan` | **50+ rules in one call.** Scopes: secrets, injection, unicode, dangerous, config, data-leak, crypto, auth, file-access |

### Overview & Similarity

| Tool | Does |
|---|---|
| `status` | Index stats, test coverage %, link accuracy |
| `repos` | List all indexed repositories |
| `semantic_search` | Meaning-based symbol search (FTS5 + vector hybrid) |
| `find_similar` | Symbols with shared callers/callees (topological similarity) |

### Developer

| Tool | Does |
|---|---|
| `ast_explore` | Parse code snippet → S-expression AST tree |
| `test_query` | Test a tree-sitter query against code |

---

## Tool Output Examples

### Context — 360° Symbol View

```
context({name: "AuthService"})

AuthService [class] src/auth.ts:15 (exported)
role: hub | heat: 0.85

incoming (3):
  calls: handleLogin [function] src/routes.ts:23
  calls: UserController [class] src/controllers/user.ts:8
  imports: authRouter [variable] src/routes.ts:1

outgoing (3):
  imports: User [class] src/models.ts:5
  calls: hashPassword [function] src/auth.ts:3
  calls: createUser [function] src/models.ts:42
```

### Impact — Blast Radius

```
impact({target: "createUser", direction: "upstream", depth: 3})

TARGET: createUser [function] src/models.ts:42

  [depth 1] WILL BREAK:
    AuthService [class] src/auth.ts:15 (calls)
    UserController [class] src/controllers/user.ts:8 (calls)

  [depth 2] LIKELY AFFECTED:
    handleLogin [function] src/routes.ts:23 (calls)
    handleRegister [function] src/routes.ts:45 (calls)

  [depth 3] MAY NEED TESTING:
    authRouter [variable] src/routes.ts:1 (imports)
    adminDashboard [function] src/admin.ts:10 (calls)

5 dependents across 3 depths
```

### Review PR — Risk Assessment

```
review_pr({})

PR Risk Assessment (vs HEAD):
  6 changed files, 12 affected symbols

  handlePayment [function] src/payment.ts:30 — heat:92 deps:15 test:no → CRITICAL(85)
  checkoutRoute [function] src/routes/checkout.ts:5 — heat:78 deps:8 test:yes → HIGH(58)
  UserModel [class] src/models.ts:20 — heat:65 deps:3 test:yes → MEDIUM(35)
  formatCurrency [function] src/utils.ts:45 — heat:10 deps:0 test:no → LOW(15)

Summary: CRITICAL=1 HIGH=2 MEDIUM=4 LOW=5
```

### Security Scan — 50 Rules at Once

```
security_scan({scope: "all", severity: "HIGH"})

{
  "summary": {
    "totalScanned": 1240,
    "findings": 8,
    "bySeverity": { "CRITICAL": 1, "HIGH": 3, "MEDIUM": 4 },
    "score": 78
  },
  "findings": [
    {
      "ruleId": "SEC-001",
      "category": "secrets",
      "severity": "CRITICAL",
      "owasp": "A02:2021",
      "file": "src/config.ts",
      "line": 15,
      "match": "password = 'admin123'",
      "fix": "Move to environment variable: process.env.DB_PASSWORD"
    },
    {
      "ruleId": "SEC-011",
      "category": "injection",
      "severity": "HIGH",
      "owasp": "A03:2021",
      "file": "src/routes/admin.ts",
      "line": 42,
      "match": "eval(userInput)",
      "fix": "Replace eval() with a safe parser or validator"
    }
  ]
}
```

---

## Sub-agent Prompts (6)

Instead of chaining 5-10 tools manually, your agent calls one prompt:

| Prompt | Input | Workflow |
|---|---|---|
| `milens-planner` | Feature description | Research → Analyze Target → Predict Impact → Plan Tests → **Implementation Plan** |
| `milens-reviewer` | Change description | Scan PR → Deep-dive Symbols → Find Dead Code → Text Search → **Review Report** |
| `milens-tester` | Symbol name | Find Gaps → Generate Plan → Implement → Verify → **Coverage Report** |
| `milens-architect` | (none) | Overview → Domains → Routes → Hierarchy → Connections → **Architecture Analysis** |
| `milens-security` | (none) | Scan PR → Secrets → Unicode → Dangerous → Data Leak → **Security Audit** |
| `milens-debugger` | Target + error | Context → Trace Execution → Impact → Find Relationship → **Root Cause Analysis** |

---

## CLI Commands

```
milens init [--profile minimal|standard|full] [--interactive]    Bootstrap a project
milens analyze [-p .] [--force] [--skills] [--embeddings]        Index a codebase
milens serve [-p .] [--http] [--port 3100] [--profile minimal]   Start MCP server
milens workflow <name>                                            Run predefined pipeline
milens security scan [--scope secrets] [--severity HIGH]          Security audit
milens security deps                                              Dependency CVE check
milens hooks enable|disable|list|profile                          Manage automation
milens watch [--debounce 2000]                                    Auto re-index on change
milens evolve [--schedule install|uninstall|status]               Promote learned patterns
milens metrics                                                    TER, CQI, BRR, CTR...
milens search <query> [--limit 50]                                Find symbols
milens inspect <symbol>                                           Incoming + outgoing deps
milens impact <symbol> [-d downstream] [--depth 2]                Blast radius
milens status [-p .]                                              Index health
milens list                                                       All indexed repos
milens clean [-p .] [--all]                                       Remove index
milens dashboard [--port 8080]                                    Usage analytics
```

### Workflow Examples

```bash
milens workflow tdd                          # Find test gaps → plan → verify
milens workflow review                       # PR review → risk scores → dead code
milens workflow plan "Add Stripe billing"    # Full implementation plan
milens workflow onboard                      # Session startup checklist
milens workflow security-scan                # All 50 rules at once
```

### Profile Selection

Control how many tools are active to optimize token overhead:

```bash
MILENS_PROFILE=minimal milens serve          # 10 tools — ~500 token overhead
MILENS_PROFILE=standard milens serve         # 25 tools — full daily coding
milens serve --profile full                  # 33 tools — everything
```

---

## Security (50+ Rules)

All 50 rules map to **OWASP Top 10 (2021)**. One tool call covers what used to take 10 manual greps.

| Category | Rules | Detects |
|---|---|---|
| **secrets** | 10 | AWS keys, GitHub tokens, OpenAI keys, private keys, hardcoded passwords |
| **injection** | 9 | SQL injection, XSS, command injection, `eval()`, `exec()`, dangerous DOM |
| **unicode** | 4 | Zero-width chars, bidi override, homoglyph attacks |
| **dangerous** | 7 | `os.system`, `subprocess shell`, unsafe deserialization, `spawn shell` |
| **config** | 5 | CORS wildcards, insecure cookies, debug mode, `--dangerously-skip-permissions` |
| **data-leak** | 5 | `console.log` of secrets, hardcoded URLs |
| **crypto** | 4 | MD5, SHA1, `Math.random()` for crypto, hardcoded salt/IV |
| **auth** | 4 | String comparison, missing middleware, JWT without expiry, session in URL |
| **file-access** | 2 | Path traversal, unsafe file reads |

```bash
milens security scan --scope secrets --severity HIGH --format json
milens security deps                    # Offline CVE check (34 known vulns, 5 ecosystems)
```

From an AI agent: `security_scan({scope: "all", severity: "HIGH"})`

---

## Hook System (6 Triggers)

Automation so your agent never forgets:

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

```bash
milens evolve                           # Promote high-confidence patterns now
milens evolve --schedule install        # Auto-run weekly (cron/schtasks)
```

---

## Supported Languages

12 languages through tree-sitter:

| Language | Files | Imports | Calls | Heritage |
|---|---|---|---|---|
| TypeScript | `.ts` `.tsx` | ESM + CJS + decorators | ✓ + decorators | extends / implements |
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

## Editor & Harness Support

Milens works with any MCP-compatible agent. Two ways to use:

| | MCP Server | CLI |
|---|---|---|
| **What** | Real-time tools for AI agents during coding | Direct commands from terminal |
| **For** | Daily development with AI agents | Scripts, CI/CD, one-off analysis |
| **Setup** | Add MCP config to editor | `npm install -g milens` |
| **Tools** | All 33 tools + 6 prompts | Full CLI command set |
| **Example** | Agent calls `impact()` before editing | `milens security scan --scope secrets` |

**Harness adapters available for 7 editors:**

| Harness | Config File | Recommended Profile |
|---|---|---|
| **Claude Code** | `.claude/mcp.json` | standard (25 tools) |
| **OpenCode** | `.opencode/config.json` | standard |
| **VS Code / Copilot** | `.vscode/mcp.json` | standard |
| **Cursor** | `.cursorrules` | standard |
| **Codex** | `.codex/codex.md` | standard |
| **Gemini** | `.gemini/context.md` | minimal (10 tools) |
| **Zed** | `.zed/settings.json` | minimal |

Each adapter is in the `adapters/` directory with ready-to-copy config files and agent instructions.

---

## Metrics

Seven quantified metrics for AI-driven development:

```
$ milens metrics

╔══════════════════════════════════════════════╗
║         Milens Metrics Report               ║
╠══════════════════════════════════════════════╣
║ TER:   Token Efficiency Ratio       0.85     ║
║ LR:    Learning Rate                0.59     ║
║ CQI:   Code Quality Index           7.2/10   ║
║ BRR:   Bug Recurrence Rate          8%       ║
║ TCGR:  Test Coverage Growth Rate    5.2%/wk  ║
║ DCER:  Dead Code Elimination Rate   3%       ║
║ CTR:   Cycle Time Reduction         67%      ║
╚══════════════════════════════════════════════╝
```

| Metric | Full Name | What It Tracks |
|---|---|---|
| **TER** | Token Efficiency Ratio | Useful tokens ÷ total tokens |
| **LR** | Learning Rate | Savings gained ÷ savings possible |
| **CQI** | Code Quality Index | Coverage + security + coupling + docs |
| **BRR** | Bug Recurrence Rate | Bugs repeated ÷ total fixed |
| **TCGR** | Test Coverage Growth Rate | Weekly coverage improvement |
| **DCER** | Dead Code Elimination Rate | Dead symbols ÷ total exported |
| **CTR** | Cycle Time Reduction | Time saved vs manual approach |

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

## Pricing

| Tier | Price | Key Features |
|---|---|---|
| **Free** | $0 | All 33 tools, public repos, 50+ security rules, CLI, community support. MIT core. |
| **Pro** | $19/seat/mo | Private repos, GitHub App, advanced scanning, priority support, custom skills |
| **Enterprise** | Contact | SSO/SAML, audit logging, on-prem, custom rules, SLAs, rollout consulting |

OSS stays free forever. [Full pricing details →](docs/pricing.md)

---

## What's New in v0.7.0

- **6 Sub-agent MCP Prompts** — planner, reviewer, tester, architect, security-auditor, debugger. One prompt replaces 5-10 chained tool calls.
- **50+ Built-in Security Rules** — OWASP Top 10 mapped. `security_scan()` replaces 10 manual greps. Dependency audit for 5 ecosystems.
- **Hook System** — 6 event triggers (SessionStart, SessionEnd, PreCommit, FileChange, PreCompact, PostCompact). Auto-annotate, auto-recall.
- **`milens init`** — One-command bootstrap: analyze + AGENTS.md + skill files + security rules + pre-commit hooks.
- **`milens workflow`** — 7 predefined pipelines: tdd, review, plan, security-scan, refactor, onboard, handoff.
- **Selective Profiles** — `minimal` (10 tools), `standard` (25), `full` (33). Control token overhead.
- **Watch Mode** — Auto re-index on file changes. `milens watch`.
- **Scheduled Evolve** — Auto-promote high-confidence patterns to skills. `milens evolve --schedule install`.
- **7 Harness Adapters** — Claude Code, OpenCode, Codex, Cursor, Copilot, Gemini, Zed.
- **GitHub App** — Probot-based app for automated PR review and `/milens analyze` on repos.
- **Desktop Dashboard** — Electron-based desktop app with 6 tabs (Overview, Domains, Learning, Metrics, Security, Settings).
- **Interactive Installer** — `milens init --interactive` walks through every option step by step.

[Full changelog →](https://github.com/fuze210699/milens/releases)

---

## Environment Variables

| Variable | Default | Effect |
|---|---|---|
| `MILENS_PROFILE` | (unset = full) | Tool set: `minimal` (10 tools), `standard` (25), `full` (33) |
| `MILENS_VERSION` | (from package.json) | Override version reported in MCP server metadata |

Use in MCP config:
```json
{
  "mcpServers": {
    "milens": {
      "command": "npx",
      "args": ["-y", "milens", "serve"],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

Or from CLI:
```bash
MILENS_PROFILE=minimal milens serve
```

---

## Development

```bash
git clone https://github.com/fuze210699/milens.git
cd milens
npm install
npm run build          # tsc → dist/
npm test               # vitest (136 tests)
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
