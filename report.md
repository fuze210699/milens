# Milens — Deep Architecture & Vibe Coding Capability Analysis

**Date:** 2026-05-28 | **Version:** 0.6.4 | **Analyzed by:** Milens self-analysis

---

## 1. Executive Summary

**Milens** is a code intelligence platform branded as "AI-DOS — The Operating System for AI-Driven Development." It builds a knowledge graph (SQLite+FTS5) from source code via tree-sitter WASM parsers (12 languages) and exposes 41 MCP tools for AI coding agents. The system integrates with 7 AI harnesses (Claude Code, OpenCode, Cursor, Copilot, Codex, Gemini, Zed), provides 7 sub-agent prompts, 50+ OWASP-mapped security rules, a hook lifecycle system, an orchestration engine, a confidence-based learning loop, and an SEO-friendly docs site.

**Current vibe coding status: Perception built, automation missing.** Milens has a comprehensive perception/analysis layer but lacks the autonomous execution loop needed for true "vibe coding" — where an AI agent autonomously implements, tests, reviews, fixes, and learns in a closed cycle without human intervention.

---

## 2. Architecture — Four-Layer Stack

```
┌─────────────────────────────────────────────────────────┐
│  PLATFORM LAYER                                         │
│  GitHub App · npm package · 7 adapter packs · Dashboard │
│  Pricing: Free (MIT) / Pro ($19/seat) / Enterprise      │
├─────────────────────────────────────────────────────────┤
│  AUTOMATION LAYER                                       │
│  6 Hooks · Watch mode · Scheduled evolve · Pre-commit   │
│  Annotations + confidence decay + auto-promote           │
├─────────────────────────────────────────────────────────┤
│  WORKFLOW LAYER                                         │
│  6 Sub-agent Prompts · 6 Inline Prompts · Skill files   │
│  AGENTS.md auto-generator · Profiles (min/std/full)     │
├─────────────────────────────────────────────────────────┤
│  INTELLIGENCE LAYER                                     │
│  Knowledge Graph (SQLite+FTS5+CTE) · 41 MCP Tools       │
│  50+ Security Rules (OWASP) · 7 Metrics · Vector Search │
└─────────────────────────────────────────────────────────┘
```

### 2.1 Analyzer Pipeline (8 Phases)

| # | Phase | Technology | What Happens |
|---|-------|-----------|-------------|
| 1 | Scan | Node.js `fs` + `.gitignore` | Discover source files, skip `node_modules`, `.git`, `dist`, etc. |
| 2 | Group by language | tree-sitter WASM registry | Group files by language for cache-friendly batch parsing |
| 2.5 | Document files | Regex patterns | Parse Markdown/Doc files for sections and links (no tree-sitter) |
| 3 | Parse & Extract | tree-sitter queries | Extract symbols (function/class/interface/type/etc.), imports, calls, heritage, re-exports, type bindings, assignment bindings, return types, call-result bindings |
| 4 | Load unchanged | SHA-256 hash + DB read | In incremental mode, load previously-indexed symbols from changed files, and load unchanged symbols from DB |
| 5 | Resolve Links | Cross-file linker with 5-layer strategy | Match imports to files, calls to definitions using receiver narrowing, proximity scoring, type propagation |
| 6 | Enrich | Union-Find + PageRank-like | Compute roles (entrypoint/hub/utility/leaf/datatype), heat scores (0-100), domain clusters (zones) |
| 6.5 | Test coverage | File-path pattern matching | Count symbols referenced from test files |
| 7 | Persist | better-sqlite3 transaction | Write all symbols, links, zones, metadata to SQLite in single transaction |
| 8 | Embeddings | Xenova transformers (optional) | Generate vector embeddings for semantic search (TF-IDF + cosine similarity) |

### 2.2 Database Schema

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `symbols` | All extracted code symbols | `id`, `name`, `kind`, `file_path`, `start_line`, `exported`, `role`, `heat` |
| `links` | Dependency relationships | `from_id`, `to_id`, `type` (imports/calls/extends/implements/contains), `confidence` |
| `file_hashes` | Incremental analysis cache | `path`, `hash`, `analyzed_at`, `zone` |
| `symbol_fts` | FTS5 full-text search | `name`, `file_path`, `kind` (kept in sync via triggers) |
| `annotations` | Agent observations/memory | `symbol_id`, `key`, `value`, `agent`, `session_id`, `confidence` |
| `agent_sessions` | Multi-agent session tracking | `id`, `agent`, `status`, `context_json` |
| `evolution_log` | Annotation lifecycle | `annotation_id`, `event`, `old_value`, `new_value` |
| `tool_usage` | Dashboard analytics | `tool`, `duration_ms`, `tokens_in`, `tokens_out`, `tokens_saved` |
| `symbol_embeddings` | Vector search (optional) | `symbol_id`, `embedding` (BLOB), `model` |

### 2.3 Link Resolution Engine (5 Layers)

The resolver is the most sophisticated component. It matches calls to definitions using:

1. **Unique name globally** (confidence: 0.9) — fastest path
2. **Receiver-aware narrowing** — highest priority:
   - `this.method()` → method of enclosing class (0.95)
   - `this.field.method()` → type-based lookup (0.93)
   - Imported type receiver (0.92)
   - Variable type binding → method on type (0.93)
   - PascalCase convention (`userService` → `UserService`, 0.55)
   - Same-file class match (0.90)
3. **Same-file match** (0.90) — callee defined in same file
4. **Imported symbol match** (0.95) — callee was imported
5. **Proximity scoring fallback** — same directory (0.60), imported file (0.85), otherwise (0.35, discarded if < 0.5)

Additional resolutions: Type annotation references, return type references, heritage chains, barrel re-exports (up to 5 levels deep), containment links.

---

## 3. Complete Tool Inventory

### 3.1 CLI Commands (17)

| Command | Description |
|---------|-------------|
| `milens analyze` | Index codebase — parse, resolve, enrich, persist |
| `milens search <query>` | FTS5 search for symbols |
| `milens inspect <symbol>` | 360° view: incoming + outgoing deps |
| `milens impact <symbol>` | Blast radius: upstream/downstream traversal |
| `milens serve` | Start MCP server (stdio or HTTP) |
| `milens status` | Show index stats |
| `milens list` | List all indexed repos |
| `milens clean` | Remove index |
| `milens dashboard` | Usage analytics web UI (Chart.js, KPI cards) |
| `milens evolve` | Promote annotations → skills; schedule via cron/Windows Task Scheduler |
| `milens metrics` | 7 metrics: TER, LR, CQI, BRR, TCGR, DCER, CTR |
| `milens workflow` | 7 predefined pipelines: tdd, review, plan, onboard, security-scan, refactor, handoff |
| `milens init` | Bootstrap: analyze + AGENTS.md + skills + hooks + CI |
| `milens hooks` | Manage 6 hook triggers |
| `milens security scan` | 50 OWASP-mapped rules across 9 categories |
| `milens security deps` | Dependency CVE audit (5 ecosystems) |
| `milens watch` | Auto re-index on file change |

### 3.2 MCP Tools (41)

**Search & Navigation (5):**
| Tool | Does |
|------|------|
| `query` | Search symbols by name/kind (FTS5) |
| `grep` | Text search ALL files — code, configs, docs, templates |
| `context` | Symbol 360°: incoming refs + outgoing deps |
| `get_file_symbols` | All symbols in a file with ref/dep counts |
| `get_type_hierarchy` | Full inheritance tree (ancestors + descendants) |

**Safety & Impact (5):**
| Tool | Does |
|------|------|
| `impact` | Blast radius traversal (depth 1-3) |
| `edit_check` | Pre-edit safety: callers, exports, re-export chains |
| `detect_changes` | Git diff → affected symbols + dependents |
| `find_dead_code` | Exported symbols with zero incoming refs |
| `overview` | Combined context + impact + grep (saves 2-3 calls) |

**Understanding (5):**
| Tool | Does |
|------|------|
| `smart_context` | Intent-aware context (understand/edit/debug/test) |
| `trace` | Execution flow: entrypoints → target or target → downstream |
| `routes` | Detect API endpoints across 7 frameworks |
| `explain_relationship` | Shortest dependency path between two symbols |
| `domains` | Module clusters from dependency graph |

**Review & Testing (6):**
| Tool | Does |
|------|------|
| `review_pr` | PR risk scoring (LOW/MEDIUM/HIGH/CRITICAL) |
| `review_symbol` | Single symbol deep-dive risk assessment |
| `codebase_summary` | ~500 token overview for session bootstrap |
| `test_plan` | Mock strategy + 3+ test scenarios |
| `test_coverage_gaps` | Untested symbols sorted by risk |
| `test_impact` | Changed code → which test files to run |

**Memory & Sessions (6):**
| Tool | Does |
|------|------|
| `annotate` | Save observation about a symbol |
| `recall` | Retrieve past annotations |
| `session_start` | Begin new agent session |
| `session_context` | Session metadata + annotations |
| `session_end` | Close session, record stats |
| `handoff` | Transfer context between agent sessions |

**Security (1):**
| Tool | Does |
|------|------|
| `security_scan` | 50 rules in one call (secrets, injection, unicode, dangerous, config, data-leak, crypto, auth, file-access) |

**Search & Similarity (2):**
| Tool | Does |
|------|------|
| `semantic_search` | Meaning-based hybrid search (FTS5 + vector) |
| `find_similar` | Topologically similar symbols (shared callers/callees) |

**Developer (2):**
| Tool | Does |
|------|------|
| `ast_explore` | Parse code → S-expression AST tree |
| `test_query` | Test a tree-sitter query against code |

**Infrastructure (2):**
| Tool | Does |
|------|------|
| `status` | Index stats for a repo |
| `repos` | List all indexed repositories |

### 3.3 MCP Resources (4)

| Resource URI | Description |
|-------------|-------------|
| `milens://overview` | Index overview: stats, domains, coverage, staleness |
| `milens://symbol/{name}` | Symbol context by name |
| `milens://file/{+path}` | All symbols in a file |
| `milens://domain/{name}` | Domain cluster: files + top symbols |

### 3.4 MCP Prompts — Sub-Agent Workflows (12 total)

**Structured (6):**
| Prompt | Input | Workflow |
|--------|-------|----------|
| `milens-planner` | Feature | Research → Analyze → Impact → Test Plan → Implementation Plan |
| `milens-reviewer` | Change description | Risk Scan → Deep-dive → Dead Code → Security → Report |
| `milens-tester` | Focus area | Coverage gaps → Test plans → Implement → Verify → Report |
| `milens-architect` | None | Overview → Domains → Routes → Trace → Hierarchy → Analysis |
| `milens-security` | None | Scan secrets → Unicode → Dangerous → Data leak → Config → Report |
| `milens-debugger` | Target + error | Execution trace → Blast radius → Dep paths → Root cause |

**Inline / Vibe-code (6):**
| Prompt | Description |
|--------|-------------|
| `delete-feature` | Multi-step safe deletion workflow |
| `refactor-symbol` | Safe rename/refactor workflow |
| `explore-symbol` | Deep exploration of unfamiliar symbol |
| `vibe-code-planner` | 5-phase ECC planner (Intelligence → Analysis → Impact → Test → Plan) |
| `vibe-code-reviewer` | ECC reviewer: PR risk, dead code, secrets, tech debt, annotate |
| `closed-loop-session` | 6-phase loop: Analyze → Plan → Code → Verify → Learn → Improve |

### 3.5 Hook System (6 Triggers)

| Hook | Trigger | Default Action |
|------|---------|---------------|
| `onSessionStart` | Agent begins work | codebase_summary + recall annotations |
| `onSessionEnd` | Agent finishes | detect_changes + review_pr + dead code + coverage gaps |
| `onPreCommit` | Before `git commit` | Risk report (CRITICAL stops, HIGH warns) |
| `onFileChange` | Files modified | (described in README, implementation returns report) |
| `onPreCompact` | Before context compaction | Save codebase snapshot |
| `onPostCompact` | After compaction | Recall annotations to restore context |

**Hook profiles:** minimal (preCommit only), standard (SessionStart, SessionEnd, PreCommit), strict (all 6).

### 3.6 Profile System

| Profile | Tools Count | Overhead | Target Use |
|---------|------------|----------|------------|
| `minimal` | 10 | ~500 tokens | Gemini, Zed, limited-context agents |
| `standard` | 25 | ~800 tokens | Daily coding (Recommended) |
| `full` | 34 | ~1200 tokens | Power users, all features |

---

## 4. Detailed Vibe Coding Analysis

### 4.1 Definitions

For the purpose of this analysis, "vibe coding" is defined as:

- **Level 0:** Human writes code, AI assists with lookups (current mainstream use)
- **Level 1:** AI implements features with human guidance, using code intelligence tools
- **Level 2:** AI autonomously implements → reviews → fixes → verifies in a loop, human approves
- **Level 3:** AI autonomously implements → reviews → fixes → verifies → learns, no human in loop
- **Level 4:** AI monitors production, detects issues, self-heals, continuous improvement

### 4.2 Where Milens Is Today

**Milens currently achieves Level 1.5** — it has all the perception/analysis tools for Level 2, but lacks the automation/orchestration layer.

### 4.3 Capability Matrix

| Capability | Status | Implementation | Gap |
|-----------|--------|---------------|-----|
| **Code → Index** | EXISTS | `milens analyze` + tree-sitter + SQLite | None |
| **Auto re-index on change** | EXISTS | `milens watch` (fs.watch + debounce) | Re-indexes everything (`--force`), not incremental per-file |
| **Code → Understand** | EXISTS | 33 MCP tools (query, grep, context, trace, etc.) | None |
| **Code → Impact** | EXISTS | `impact()` with recursive CTE traversal | None |
| **Code → Security** | EXISTS | `security_scan()` 50 rules, each with `fix` suggestion | None |
| **Code → Dead Code** | EXISTS | `find_dead_code()` exported + zero refs | None |
| **Code → Test Gaps** | EXISTS | `test_coverage_gaps()` sorted by risk | None |
| **Code → Test Plan** | EXISTS | `test_plan()` mock strategy + scenarios | None |
| **Edit → Safety Check** | EXISTS | `edit_check()` callers, re-exports, coverage | Human/agent must call it manually |
| **Commit → Review** | EXISTS | `review_pr()` + pre-commit hook | Hook is a bash script calling CLI, not deeply integrated |
| **Detect issues → Report** | EXISTS | All hooks + tools produce structured reports | None |
| **Detect issues → Auto-fix** | **MISSING** | No code generation/modification | Security rules have `fix` strings but nothing applies them |
| **Fix → Auto-verify** | **MISSING** | No automated re-review after fixes | Agent must re-call tools manually |
| **Learn over sessions** | EXISTS | `annotate()` → confidence → `evolve` → promote | Confidence decay is scheduled (cron), not real-time |
| **Auto-improve** | **PARTIAL** | `milens evolve` promotes patterns to skills | Requires manual trigger or cron schedule |
| **Closed loop** | **MISSING** | `closed-loop-session` is a prompt blueprint | No orchestrator/runner that iterates |
| **Guard rails enforcement** | **MISSING** | `edit_check()` and `impact()` exist but are optional | No hard gates; agent can skip them |
| **Regression detection** | **MISSING** | No before/after comparison of impact | Would need snapshotting of graph before edits |
| **Auto-test generation** | **MISSING** | `test_plan()` gives strategy, no implementation | No code generation for test files |
| **Auto-dead-code removal** | **MISSING** | `find_dead_code()` only identifies | No safe removal automation |
| **Continuous monitoring** | **MISSING** | Watch mode exists but is CLI-only, not integrated with MCP | No daemon mode that ties into the agent loop |

### 4.4 The "closed-loop-session" Prompt — What It Actually Does

The `closed-loop-session` prompt at `src/server/mcp.ts:2134` describes 6 phases:
```
PHASE 1 — ANALYZE:  session_start → codebase_summary → domains → recall
PHASE 2 — PLAN:      smart_context → edit_check → impact → test_plan
PHASE 3 — CODE:      implement changes with guard tools
PHASE 4 — VERIFY:    detect_changes → test_impact → review_pr → test_coverage_gaps → grep(secrets)
PHASE 5 — LEARN:     annotate → session_context → handoff
PHASE 6 — IMPROVE:   milens evolve → milens metrics
```

**What it is:** A single MCP prompt — a text instruction block that the AI agent follows once and then terminates. It is NOT an orchestrator/loop engine. There is no code that automatically triggers phase 4 after phase 3, no automatic retry if verification fails, and no loop that says "if review_pr returns HIGH, go back to phase 3."

**What it needs to become:** An autonomous engine where:
- File changes automatically trigger `detect_changes` + `review_pr`
- If risk > MEDIUM, `impact` + `test_plan` are called automatically
- Test gaps are auto-generated
- Security findings are auto-fixed (with human approval option)
- Dead code is auto-proposed for removal
- Each iteration logs to `evolution_log`
- Confidence scores update based on whether fixes passed verification

---

## 5. Detailed Gap Analysis

### 5.1 Missing: Auto-Fix Engine

**Current:** 50 security rules each have a `fix` string property (e.g., `"Replace hardcoded password with process.env.DB_PASSWORD or a secrets manager."`), but this is human-readable text returned in the `security_scan()` output. No code applies these fixes automatically.

**Needed:**
- A `fix_apply` MCP tool that takes a rule ID + file + line, reads the file, applies the fix suggestion, writes the fix, and adds a comment referencing the rule ID
- Safety gates: only applies to rules with `severity !== 'CRITICAL'` by default, or requires explicit confirmation for CRITICAL
- Rollback capability: save original content before applying fix

### 5.2 Missing: Autonomous Orchestrator

**Current:** All tool calling must be initiated by the AI agent or human. The `closed-loop-session` prompt describes a sequence but the system doesn't enforce or automatically trigger it.

**Needed:** An `Orchestrator` class that:
1. Subscribes to file-change events (via watch mode or file watcher events from the AI agent's edit tool)
2. After N ms of silence (debounce), automatically runs:
   - `detect_changes()` — identify affected symbols
   - `review_pr()` — score risk
   - If hotspots found → `impact()` on each → `test_plan()` → auto-generate test skeletons
   - `security_scan()` on changed files only
   - If security findings → propose fixes
   - `find_dead_code()` newly-exposed dead symbols
3. Reports to the agent with a structured action plan:
   - "3 HIGH risk symbols need tests. Generate? [Y/n]"
   - "2 security issues found. Auto-fix? [Y/n]"
   - "1 dead symbol detected. Remove? [Y/n]"
4. After fixes, re-runs `review_pr()` to verify risk decreased
5. Logs the entire cycle to `evolution_log` and creates annotations

### 5.3 Missing: Auto-Test Generation

**Current:** `test_plan()` returns a mock strategy and 3 test scenarios. But no code is generated.

**Needed:**
- A `test_generate` tool that:
  - Takes a symbol name
  - Reads the test plan
  - Generates a test file (or appends to an existing test file)
  - Uses the existing test framework patterns detected in the codebase
  - Includes imports, mocks based on the plan's mock strategy
  - Includes 3+ test cases (happy path, edge case, error handling)
- Follows the project's existing test conventions (Jest, Vitest, Mocha, pytest, etc.)

### 5.4 Missing: Regression Detection

**Current:** No before/after comparison of impact graph. You can call `impact()` before an edit and `impact()` after, but there's no automated comparison.

**Needed:**
- A `compare_impact` tool that snapshots the impact graph before an edit, then compares after
- Reports: "3 new dependents added", "1 dependency removed", "Heat score changed: 45 → 62"
- Integrates with the orchestrator: if impact grows, warns and offers to revert

### 5.5 Missing: Deep Hook Integration

**Current:** Hooks exist as a configuration system (`HookManager` class) and produce text reports (`defaultOnSessionStart`, `defaultOnSessionEnd`, `defaultOnPreCommit`). But:
- Hooks are NOT automatically triggered by the MCP server
- The `defaultOn*` functions are not called anywhere in the MCP server code (they're imported but the server doesn't wire them into the request lifecycle)
- The only hook that actually runs is the pre-commit git hook, which is a bash script calling `milens workflow review`

**Needed:**
- MCP server should call `onSessionStart` when `session_start` is called
- MCP server should call `onSessionEnd` when `session_end` is called
- `onFileChange` should be triggered by file-system events from watch mode
- `onPreCommit` should be callable from the MCP level (not just CLI)
- `onPreCompact`/`onPostCompact` should be triggered by the agent framework sending context window notifications (requires framework cooperation)

### 5.6 Missing: Real-Time Confidence Updates

**Current:** Confidence is updated when annotations are re-annotated. The `milens evolve` command runs decay passes. This can be scheduled via cron but is not real-time.

**Needed:**
- Confidence should update whenever the agent references an annotation
- The `recall()` tool should boost confidence of recalled annotations
- Decay should happen in the background (a lightweight tick on each MCP tool call)

### 5.7 Missing: Incremental Per-File Re-Indexing

**Current:** `milens watch` calls `milens analyze --force` which re-indexes the entire codebase on any file change. This is expensive for large projects.

**Needed:**
- The analyzer should accept a `--files` flag listing only changed files
- Only those files should be parsed and re-linked
- Cross-file links involving changed files should be updated
- Unchanged files should retain their symbols and links from the DB

### 5.8 Missing: Symbol-Level Change Detection

**Current:** `detect_changes()` finds changed files via `git diff --name-only`, then reads all symbols from those files. It doesn't know which specific symbols changed.

**Needed:**
- Compute before/after symbol hashes (hash of the symbol's signature + line range + name)
- Only report symbols that actually changed (not all symbols in changed files)
- Enable precise impact calculation: "symbol X signature changed: return type `User` → `UserDTO`"

---

## 6. Learning & Evolution System

### 6.1 How It Works

```
SESSION 1:  Agent finds bug in createUser()
            → annotate({symbol: "createUser", key: "bug", value: "Call normalizeEmail() before createUser()"})
            → confidence: 0.5 → stored in DB

SESSION 2:  Agent calls recall() → sees the bug note → avoids repeating it
            → Bug is re-annotated (same symbol+key) → confidence boosts to 0.6

SESSION 3-4: Same annotation re-read, same boost → confidence reaches 0.8

SESSION 5:  milens evolve runs (manual or cron)
            → Finds annotations with confidence >= 0.8
            → Promotes to .agents/skills/milens-bug/SKILL.md
            → Now enforced as a permanent rule for all future sessions
```

### 6.2 Components

| Component | File | Role |
|-----------|------|------|
| AnnotationStore | `src/store/annotations.ts` | CRUD for annotations + sessions + evolution log |
| Confidence | `src/store/confidence.ts` | Boost, decay, staleness detection, promote security annotations |
| Evolve CLI | `src/cli.ts:354` | Manual evolution trigger + cron/schtasks scheduling |
| Evolution log | `src/store/schema.sql:119` | Audit trail of all confidence changes |

### 6.3 Confidence Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| 0.0-0.3 | Very low confidence | Auto-archived during decay pass |
| 0.3-0.5 | New observation | Normal annotation |
| 0.5-0.7 | Confirmed once | Active annotation |
| 0.7-0.8 | Confirmed multiple times | Stable knowledge |
| 0.8-0.9 | Highly confirmed | Ready for promotion |
| 0.9-1.0 | Extremely high confidence | Promoted to permanent rule |

### 6.4 Metrics (7 Dimensions)

| Metric | Full Name | Calculation | Current Limitations |
|--------|-----------|------------|-------------------|
| TER | Token Efficiency Ratio | Useful tokens / total tokens from tracking DB | Requires real usage data; hardcoded estimates otherwise |
| LR | Learning Rate | Tokens saved / tokens possible | Calculated from tracking DB |
| CQI | Code Quality Index | 35% coverage + 20% dead_code_free + 20% security (fixed 0.7) + 15% coupling (fixed 0.5) + 10% docs (fixed 0.5) | Security, coupling, and docs are hardcoded estimates |
| BRR | Bug Recurrence Rate | High-confidence bugs / total bugs | Depends on manual annotation with key="bug" |
| TCGR | Test Coverage Growth Rate | Test annotations count / 10 * 5 | Rough proxy — no actual historical coverage tracking |
| DCER | Dead Code Elimination Rate | Dead symbols / total exported | Snapshot, not rate of change |
| CTR | Cycle Time Reduction | 1 - (estimated milens mins / 45) | Hardcoded baseline of 45 minutes |

---

## 7. Security System

### 7.1 Rule Categories (50 rules)

| Category | Count | OWASP | Detects |
|----------|-------|-------|---------|
| `secrets` | 10 | A02:2021 | AWS keys, GitHub tokens, OpenAI keys, RSA/EC private keys, hardcoded passwords, API keys, bearer tokens |
| `injection` | 9 | A03:2021 | eval(), exec() [Python], child_process.exec (Node), SQL concatenation, new Function(), innerHTML, dangerouslySetInnerHTML, document.write(), setTimeout string |
| `unicode` | 4 | A03:2021 | Bidi override chars (U+202A-E), zero-width chars (U+200B-D), homoglyph attacks, hidden unicode in comments |
| `dangerous` | 7 | A03/A08 | os.system(), subprocess shell=True, Runtime.exec(), spawn shell:true, pickle.loads(), unserialize(), dynamic require/import |
| `config` | 5 | A04/A05 | Skip middleware permissions, CORS wildcard, insecure cookies (secure:false, httpOnly:false), debug mode |
| `data-leak` | 5 | A09:2021 | console.log with password/token/secret, hardcoded URLs with credentials, internal IP URLs, console.log in production |
| `crypto` | 4 | A02:2021 | MD5, SHA-1, Math.random() for crypto, hardcoded salt/IV |
| `auth` | 4 | A01/A07 | Role check via string comparison, missing auth middleware, JWT without expiry, session ID in URL |
| `file-access` | 2 | A01:2021 | Path traversal, fs.readFile with user-controlled path |

### 7.2 Rule Structure

Every rule has:
- `severity`: CRITICAL (15 rules), HIGH (25 rules), MEDIUM (6 rules), LOW (4 rules)
- `fix`: Human-readable fix suggestion (but NOT auto-applied)
- `confidence`: 0.70-0.95 (rule author's confidence in detection accuracy)
- `fileGlob` / `excludeGlob`: Language-specific targeting

---

## 8. Adapter Ecosystem

### 8.1 Supported AI Harnesses (7)

| Harness | Config File | MCP Format | Profile |
|---------|------------|-----------|---------|
| Claude Code | `.claude/mcp.json` | `mcpServers.milens` | standard |
| OpenCode | `.opencode/config.json` | `mcp.milens` (local type) | standard |
| Cursor | `.cursorrules` or `.cursor/mcp.json` | `mcpServers.milens` | standard |
| GitHub Copilot | `.github/copilot-instructions.md` | Inline JSON block | standard |
| Codex | `.codex/codex.md` | Inline JSON block | standard |
| Gemini | `.gemini/context.md` | Inline JSON block | minimal |
| Zed | `.zed/settings.json` | `context_servers.milens` | minimal |

### 8.2 Universal Rules (All Adapters)

All 7 adapters enforce the same safety rules:
1. **Never edit** without `edit_check()` first
2. **Never delete/rename** without `grep()` + `impact()`
3. **Never commit** without `detect_changes()`
4. Use `query()` for symbols, `grep()` for text/phrases
5. Always include `repo` parameter

---

## 9. Supported Languages

| Language | Extensions | Extracts | Notes |
|----------|-----------|----------|-------|
| TypeScript | `.ts`, `.tsx` | Functions, classes, interfaces, types, enums, variables + ESM/CJS imports + decorators + heritage | Primary language |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | Same as TS minus types | ESM + CJS |
| Python | `.py` | Classes, functions + import/fastapi decorators + heritage | |
| Java | `.java` | Classes, interfaces, methods + annotations | Limited method-level resolution |
| Go | `.go` | Functions, structs, interfaces, methods + go.mod | Struct embedding |
| Rust | `.rs` | Functions, structs, traits, impls, macros | |
| PHP | `.php` | Classes, functions, traits, interfaces + use/include | |
| Ruby | `.rb` | Classes, methods, modules + require | Limited |
| Vue | `.vue` | Script + template references | SFC support |
| HTML | `.html`, `.htm` | Script src, link href, inline scripts | |
| CSS | `.css` | @import detection only | |
| Markdown | `.md`, `.mdx` | Local links + headings as sections | |

---

## 10. Critical Issues Discovered

### 10.1 Schema-Code Mismatch (HIGH)

The `src/store/schema.sql` and `src/store/annotations.ts` have conflicting column names:

| Column | schema.sql | annotations.ts |
|--------|-----------|---------------|
| Symbol ref | `symbol_id` | `symbol` |
| Confidence | (missing) | `confidence` |
| Updated at | (missing) | `updated_at` |
| Session table | `agent_sessions` | `sessions` |
| Context field | `context_json` | `context` |
| Extra columns | (none) | `tool_calls_count`, `annotations_count` |

This causes `SqliteError: table annotations has no column named symbol` when the global installation runs against a fresh DB.

### 10.2 Hook Wiring Gap (MEDIUM)

The `defaultOnSessionStart`, `defaultOnSessionEnd`, and `defaultOnPreCommit` functions exist and are well-implemented, but they are never called from the MCP server. The hooks are only configurable via CLI (`milens hooks enable`), not triggered automatically by server events.

### 10.3 Vector Search Implementation (LOW)

`semantic_search` uses hybrid FTS5 + vector cosine similarity via Reciprocal Rank Fusion. However:
- Vector embeddings are generated by `@xenova/transformers` which is heavy (~500MB for model download) and requires `--embeddings` flag during analyze
- The fallback path (FTS5-only) works but `semantic_search` is then no different from `query()`
- No configurable model selection — always TF-IDF

### 10.4 Confidence Decay is Cron-Based (LOW)

Confidence decay runs via `milens evolve`, which can be scheduled via cron/Windows Task Scheduler. But there's no real-time decay — annotations from 30 days ago remain at their previous confidence level until the next scheduled run. This means the system's "memory" is always slightly stale.

---

## 11. Recommendations for Full Vibe Code Support

### Phase 1: Foundation Fixes (Weeks 1-2)

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Fix schema.sql to match annotations.ts (or vice versa) | 2h | Fixes crash on fresh install |
| P0 | Wire hooks into MCP server lifecycle | 4h | Enables actual automation |
| P1 | Add incremental per-file re-indexing (`--files` flag) | 8h | Makes watch mode usable for large projects |
| P1 | Implement confidence boost on `recall()` | 1h | Real-time learning |

### Phase 2: Orchestration (Weeks 3-4)

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Build `Orchestrator` class with debounce → detect_changes → review_pr → propose fixes loop | 16h | Foundation of autonomous vibe coding |
| P1 | Add `--auto` flag to orchestrator that applies LOW/MEDIUM fixes without confirmation | 4h | Semi-autonomous mode |
| P1 | Implement before/after impact comparison (`compare_impact` MCP tool) | 6h | Regression detection |
| P2 | Add symbol-level diff detection (not just file-level) | 8h | Precise impact analysis |

### Phase 3: Auto-Generation (Weeks 5-6)

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Build `test_generate` MCP tool (reads test_plan, generates test file) | 12h | Closes the TDD loop |
| P1 | Build `fix_apply` MCP tool (applies security rule fixes to files) | 8h | Closes the security loop |
| P1 | Build `dead_code_remove` sub-agent prompt | 4h | Safe dead code elimination |
| P2 | Auto-snapshot knowledge graph before edits (for regression comparison) | 6h | Foundation for self-healing |

### Phase 4: Continuous Learning (Weeks 7-8)

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Real-time confidence decay (background tick on each MCP call) | 4h | Always-current memory |
| P1 | Auto-promote confidence >= 0.8 without manual evolve | 4h | Fully autonomous learning |
| P1 | Track historical metrics (coverage over time, dead code over time) | 8h | Replace hardcoded CQI components |
| P2 | Multi-session annotation correlation (find patterns across agents) | 8h | Discover insights no single agent sees |

---

## 12. Summary Statistics

| Metric | Value |
|--------|-------|
| Lines of code (source) | ~8,000 (core) + ~3,500 (docs/dashboard) + ~1,000 (rules) |
| CLI commands | 17 (including subcommands) |
| MCP tools | 34 |
| MCP resources | 4 |
| MCP prompts | 12 (6 structured + 6 inline) |
| Security rules | 50 (OWASP-mapped) |
| Hook triggers | 6 |
| Metrics dimensions | 7 |
| AI harnesses supported | 7 |
| Languages parsed | 12 |
| Frameworks detected | 7 (Express, FastAPI, NestJS, Flask, Go HTTP, PHP, Rails) |
| Adapters shipped | 7 |
| Test files | 15 |
| Test cases | 156 (all passing) |
| Test coverage (self) | 28% |
| Database tables | 9 |
| npm dependencies | 6 |
| devDependencies | 6 |
| Node.js requirement | >= 20.0.0 |

---

## 13. Conclusion

Milens is a **solid foundation** for AI-driven code intelligence. The perception layer (knowledge graph, MCP tools, security scanning, hooks) is well-designed and functional. The workflow layer (prompts, skills, AGENTS.md) provides good agent guidance. The learning layer (annotations, confidence, evolution) is a unique differentiator.

**The critical missing piece for "vibe coding" is the orchestration engine** — a runner that ties the perception → workflow → learning layers into an autonomous feedback loop. Without it, milens is a powerful copilot but not an autopilot.

The good news: all the building blocks exist. The `closed-loop-session` prompt describes exactly the right 6-phase workflow. The hooks system has the right event model. The security rules have fix suggestions. The test planner has mock strategies. The annotation system has confidence scoring. What's needed is the glue — an orchestrator that automatically triggers these components in response to code changes, evaluates results, iterates, and learns.

**Estimated effort to reach Level 2 autonomous vibe coding: ~80-100 engineering hours** across the 4 phases outlined above.
