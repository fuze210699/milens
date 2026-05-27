# MCP Tools Reference

Milens exposes **33 MCP tools** for AI coding agents. All tools accept an optional `repo` parameter when multiple repositories are indexed.

## Search & Navigation

| Tool | Input | Output |
|---|---|---|
| `query` | `{query: "UserService", limit: 15}` | `[symbol] [kind] file:line (exported)` |
| `grep` | `{pattern: "TODO", scope: "all", limit: 50}` | `file:line: matched text` |
| `context` | `{name: "AuthService"}` | `incoming (N): ...` / `outgoing (M): ...` |
| `get_file_symbols` | `{file: "src/auth.ts"}` | `[symbol] [kind] line (refs/deps)` |
| `get_type_hierarchy` | `{name: "BaseController"}` | `BaseController ← Child1 ← Child2 ← ...` |

## Impact & Safety

| Tool | Input | Output |
|---|---|---|
| `impact` | `{target: "createUser", depth: 3}` | `[depth 1] WILL BREAK: A,B,C` / `[2] LIKELY: D,E` / `[3] MAY: F,G` |
| `edit_check` | `{name: "resolveLinks"}` | `callers (N) + export status + re-exports + ⚠ warnings` |
| `detect_changes` | `{ref: "HEAD"}` | `[modified files] → affected symbols + dependents` |
| `find_dead_code` | `{limit: 30}` | `[symbol] [kind] file:line — 0 references` |
| `overview` | `{name: "Database"}` | `context + impact + grep — all in one call` |

## Understanding

| Tool | Input | Output |
|---|---|---|
| `smart_context` | `{name: "analyze", intent: "edit"}` | Intent-aware: callers + deps + risk + test status |
| `trace` | `{to: "searchSymbols", depth: 8}` | `Entry → Router → Controller → Service → Target` |
| `routes` | `{framework: "express"}` | `[GET/POST] /api/endpoint → handlerFunction` |
| `explain_relationship` | `{from: "A", to: "B"}` | `A → X → Y → B (3 steps)` |
| `domains` | `{}` | `[domain] (N files, M symbols)` |

## Review & Risk Assessment

| Tool | Input | Output |
|---|---|---|
| `review_pr` | `{ref: "HEAD"}` | `[symbol]: risk (LOW/MEDIUM/HIGH/CRITICAL) + score` |
| `review_symbol` | `{name: "handlePayment"}` | `role + heat + dependents + test status + risk level + recommendation` |
| `codebase_summary` | `{}` | `domains + top hubs + test coverage + annotations count` |

## Testing

| Tool | Input | Output |
|---|---|---|
| `test_plan` | `{name: "createUser"}` | `mock strategy (stub/spy/fake) + suggested tests (3+ scenarios)` |
| `test_coverage_gaps` | `{limit: 20}` | `[untested symbol] [risk: CRITICAL/HIGH/MEDIUM/LOW]` |
| `test_impact` | `{ref: "HEAD"}` | `[changed symbol] → [test files to run]` |

## Memory & Sessions

| Tool | Input | Output |
|---|---|---|
| `annotate` | `{symbol: "X", key: "note", value: "..."}` | Confirmation + confidence score |
| `recall` | `{symbol: "X", limit: 50}` | `[{key, value, agent, session, timestamp}]` |
| `session_start` | `{agent: "vibe-coder"}` | Session ID |
| `session_context` | `{session_id: "..."}` | `metadata + tool calls + annotations` |
| `session_end` | `{session_id: "..."}` | Summary stats |
| `handoff` | `{from_session, to_agent, context}` | New session ID + summary |

## Security

| Tool | Input | Output |
|---|---|---|
| `security_scan` | `{scope: "all", severity: "HIGH", limit: 50}` | `{summary: {findings, bySeverity, score}, findings: [...]}` |

**Scopes:** `all`, `secrets`, `injection`, `unicode`, `dangerous`, `config`, `data-leak`, `crypto`, `auth`, `file-access`

## Codebase Overview

| Tool | Input | Output |
|---|---|---|
| `status` | `{}` | `symbols, links, files, coverage %, staleness` |
| `repos` | `{}` | `[repo path] — symbols, files, indexed date` |

## Search & Similarity

| Tool | Input | Output |
|---|---|---|
| `semantic_search` | `{query: "auth flow", limit: 10}` | `[symbol] [score]` |
| `find_similar` | `{name: "AuthService", limit: 10}` | `[similar symbol] [score]` |

> Both require `milens analyze --embeddings` for vector embeddings. Fallback to FTS5 keyword search when unavailable.

## Developer

| Tool | Input | Output |
|---|---|---|
| `ast_explore` | `{code: "const x = 1", language: "typescript"}` | S-expression AST tree |
| `test_query` | `{query: "(identifier) @name", code: "...", language: "typescript"}` | Matched nodes with capture names |

---

## Sub-agent Prompts

6 pre-built MCP prompts for common workflows:

| Prompt | Args | Workflow |
|---|---|---|
| `milens-planner` | `feature (required)`, `target (optional)` | Research → Analyze → Impact → Test Strategy → Plan |
| `milens-reviewer` | `change_description (optional)` | PR Scan → Deep-Dive → Dead Code → Text Search → Report |
| `milens-tester` | `focus (optional)` | Gaps → Test Plan → Implement → Verify |
| `milens-architect` | (none) | Overview → Domains → Routes → Hierarchy → Connections |
| `milens-security` | (none) | PR Scan → Secrets → Unicode → Dangerous → Data Leak → Report |
| `milens-debugger` | `target (required)`, `error_description (optional)` | Context → Trace → Impact → Relationship → Root Cause |
