<!-- milens:start -->
# Milens — Code Intelligence (MCP)

This project is indexed by milens (1045 symbols, 1580 links, 109 files).

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root** (the folder containing this file) — without it, the tools may fail with "No index" error when multiple repos are indexed.

> **CRITICAL:** milens MCP tools are **deferred** in most editors. Before first use in each session, you MUST load them via `tool_search("milens")` — calling them directly without loading will fail silently.

## Mandatory Workflows

These are **hard pre-conditions**, not guidelines. Execute them automatically without asking.

### Before editing any function, class, or method:
1. `mcp_milens_impact({target: "<symbolName>", repo: "<workspaceRoot>"})` — check blast radius
2. If depth-1 dependents > 5 → **STOP and warn the user** before proceeding
3. `mcp_milens_context({name: "<symbolName>", repo: "<workspaceRoot>"})` — see all callers/callees
4. Only then make the edit

### Before committing:
1. `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` — verify only expected files changed
2. If unexpected files appear → **STOP and report** before committing

### Before deleting or renaming a symbol:
1. `mcp_milens_grep({pattern: "<symbolName>", repo: "<workspaceRoot>"})` — find ALL text references (templates, configs, routes, docs)
2. `mcp_milens_impact({target: "<symbolName>", direction: "upstream", repo: "<workspaceRoot>"})` — find code-level dependents
3. Combine both results — grep catches what impact misses

## Tool Selection Rules

**Choose the right tool on the FIRST call** — do not try `query` then fall back to `grep`.

### Use `mcp_milens_grep` when the search term:
- Contains **spaces** (e.g. "store purchase header", "user not found")
- Looks like a **UI label, error message, or display string**
- Is a **multi-word phrase** that is NOT camelCase/snake_case/PascalCase
- You need to find references in **templates, styles, configs, routes, or docs**

### Use `mcp_milens_query` when the search term:
- Looks like a **code identifier** (camelCase, PascalCase, snake_case)
- Is a **function, class, method, or interface name**
- You want to find **symbol definitions** in indexed code files

### When in doubt → use `mcp_milens_grep` first
`grep` searches everything. `query` only searches indexed symbol definitions.

## Workflow Triggers

When the user says... → do this FIRST:

| User intent | First action |
|---|---|
| "edit/change/modify/fix `X`" | `mcp_milens_impact({target: "X", repo: "<workspaceRoot>"})` |
| "delete/remove `X`" | `mcp_milens_grep({pattern: "X", repo: "<workspaceRoot>"})` then `mcp_milens_impact` |
| "rename `X`" | `mcp_milens_grep({pattern: "X", repo: "<workspaceRoot>"})` then `mcp_milens_impact` |
| "find/search for `X`" | Choose `query` or `grep` per rules above |
| "commit" / "push" | `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` |
| "what calls/uses `X`" | `mcp_milens_context({name: "X", repo: "<workspaceRoot>"})` |
| "what happens if I change `X`" | `mcp_milens_impact({target: "X", repo: "<workspaceRoot>"})` |
| "how are `A` and `B` connected" | `mcp_milens_explain_relationship({from: "A", to: "B", repo: "<workspaceRoot>"})` |
| "explore/understand `X`" | `mcp_milens_context({name: "X", repo: "<workspaceRoot>"})` |
| "update/write docs for `X`" | `mcp_milens_grep({pattern: "X", include: "**/*.md"})` — find existing docs mentioning X, then `mcp_milens_context({name: "X"})` for full symbol info |
| "research/explore docs" | `mcp_milens_get_file_symbols({file: "<doc.md>"})` — see document outline (headings as sections) |
| "what docs mention `X`" | `mcp_milens_grep({pattern: "X", include: "**/*.md"})` — find all markdown references |
| "review this PR" | `mcp_milens_review_pr({repo: "<workspaceRoot>"})` — risk assessment for changed files |
| "is `X` risky to change" | `mcp_milens_review_symbol({name: "X", repo: "<workspaceRoot>"})` |
| "write tests for `X`" | `mcp_milens_test_plan({name: "X", repo: "<workspaceRoot>"})` — deps, mocks, suggested tests |
| "what needs tests" | `mcp_milens_test_coverage_gaps({repo: "<workspaceRoot>"})` — untested symbols by risk |
| "which tests to run" | `mcp_milens_test_impact({repo: "<workspaceRoot>"})` — maps changes → test files |
| "remember/note that `X`..." | `mcp_milens_annotate({symbol: "X", key: "note", value: "...", repo: "<workspaceRoot>"})` |
| "what do we know about `X`" | `mcp_milens_recall({symbol: "X", repo: "<workspaceRoot>"})` |
| "start new session" | `mcp_milens_session_start({agent: "...", repo: "<workspaceRoot>"})` |
| "find code like `X`" | `mcp_milens_find_similar({name: "X", repo: "<workspaceRoot>"})` |
| "search for `concept`" | `mcp_milens_semantic_search({query: "concept", repo: "<workspaceRoot>"})` |
| "generate tests for `X`" | `mcp_milens_test_generate({symbol: "X", repo: "<workspaceRoot>"})` |
| "fix security issue in `X`" | `mcp_milens_fix_apply({ruleId, file, line, repo: "<workspaceRoot>"})` |
| "remove dead code" | `mcp_milens_find_dead_code()` then `dead_code_remove` prompt |
| "orchestrate/check changes" | `mcp_milens_orchestrate({repo: "<workspaceRoot>"})` |
| "compare impact of `X`" | `mcp_milens_compare_impact({name: "X", action: "snapshot"|"compare", repo: "<workspaceRoot>"})` |
| "check pre-commit" | `mcp_milens_pre_commit_check({repo: "<workspaceRoot>"})` |
| "save/restore context" | `mcp_milens_hook_preCompact()` / `mcp_milens_hook_postCompact()` |

## Documentation Workflows

Milens indexes **Markdown files** (.md, .mdx) — headings become `section` symbols with parent-child hierarchy, and local links become cross-file references.

### Researching or exploring documentation:
1. `mcp_milens_get_file_symbols({file: "README.md", repo: "<workspaceRoot>"})` — see the full heading outline (TOC) of any doc
2. `mcp_milens_query({query: "<topic>"})` — search section headings across all docs and code
3. `mcp_milens_grep({pattern: "<keyword>", include: "**/*.md"})` — text search within docs only

### Before updating documentation:
1. `mcp_milens_get_file_symbols({file: "<doc.md>"})` — understand document structure first
2. If documenting a code symbol: `mcp_milens_context({name: "<symbolName>"})` — get full symbol info (signature, callers, deps)
3. `mcp_milens_grep({pattern: "<symbolName>", include: "**/*.md"})` — check if other docs already reference it

### After renaming/deleting a code symbol:
- `mcp_milens_grep({pattern: "<oldName>", include: "**/*.md"})` — find docs that need updating (milens indexes markdown links as cross-file references)

## Never Do

- NEVER edit a symbol without first running `mcp_milens_impact` on it.
- NEVER delete or rename without running both `mcp_milens_grep` and `mcp_milens_impact`.
- NEVER commit without running `mcp_milens_detect_changes()`.
- NEVER call milens MCP tools without the `repo` parameter.
- NEVER use `mcp_milens_query` for multi-word display text or UI labels — use `mcp_milens_grep`.

---

## Reference

### Tools

| Tool | Purpose |
|---|---|
| `mcp_milens_query` | Find symbol definitions by name (FTS5) |
| `mcp_milens_grep` | Text search ALL files (templates, styles, configs, docs) |
| `mcp_milens_context` | 360° view: incoming refs + outgoing deps |
| `mcp_milens_impact` | Blast radius before editing |
| `mcp_milens_detect_changes` | Pre-commit scope check |
| `mcp_milens_explain_relationship` | Shortest path between two symbols |
| `mcp_milens_get_file_symbols` | All symbols in a file |
| `mcp_milens_get_type_hierarchy` | Class inheritance tree |
| `mcp_milens_find_dead_code` | Unused exported symbols |
| `mcp_milens_status` | Index health check |
| `mcp_milens_edit_check` | Pre-edit safety: callers + export status + re-export chains + test coverage |
| `mcp_milens_trace` | Execution flow: call chains from entrypoints to a symbol |
| `mcp_milens_routes` | Detect framework routes/endpoints (Express, FastAPI, NestJS, etc.) |
| `mcp_milens_smart_context` | Intent-aware context: understand/edit/debug/test |
| `mcp_milens_overview` | Combined context + impact + grep in one call |
| `mcp_milens_domains` | Domain clusters: groups of files forming logical modules |
| `mcp_milens_repos` | List all indexed repositories with summary stats |
| `mcp_milens_ast_explore` | Explore raw AST structure of a code file |
| `mcp_milens_test_query` | Run raw SQL query against the milens index database |
| `mcp_milens_review_pr` | PR risk assessment: scores changed symbols by blast radius + test coverage |
| `mcp_milens_review_symbol` | Single symbol risk: role, heat, dependents, test status |
| `mcp_milens_test_plan` | Dependency-aware test plan: mocks, strategies, suggested tests |
| `mcp_milens_test_coverage_gaps` | Untested exported symbols sorted by risk |
| `mcp_milens_test_impact` | Which tests to run for current changes |
| `mcp_milens_annotate` | Store observation/note about a symbol (persists across sessions) |
| `mcp_milens_recall` | Retrieve annotations (filter by symbol, key, agent, session) |
| `mcp_milens_session_start` | Register agent session for multi-agent coordination |
| `mcp_milens_session_context` | Get session metadata + annotations |
| `mcp_milens_handoff` | Transfer context between agent sessions |
| `mcp_milens_codebase_summary` | High-level bootstrapping context: domains, key symbols, coverage |
| `mcp_milens_semantic_search` | Hybrid FTS5 + vector search (requires --embeddings) |
| `mcp_milens_find_similar` | Find symbols similar by embedding proximity |
| `mcp_milens_compare_impact` | Compare impact graph before/after edit — detects regressions |
| `mcp_milens_orchestrate` | Full autonomous review cycle: changes → risk → gaps → dead code → plan |
| `mcp_milens_fix_apply` | Apply a security fix to a file (creates backup) |
| `mcp_milens_test_generate` | Auto-generate test file with framework detection + mock strategy |
| `mcp_milens_pre_commit_check` | Pre-commit risk scan: review_pr + dead code + coverage gaps |
| `mcp_milens_hook_preCompact` | Save metrics snapshot before context compaction |
| `mcp_milens_hook_postCompact` | Restore context by recalling annotations after compaction |

### Keeping the Index Fresh

After significant code changes: `npx milens analyze -p . --force`

### Skills

| Task | Read this skill file |
|------|---------------------|
| General milens tools reference | `.claude/skills/generated/milens/SKILL.md` |
| Work in the Adapters area | `.claude/skills/generated/adapters/SKILL.md` |
| Work in the Root area | `.claude/skills/generated/root/SKILL.md` |
| Work in the Apps area | `.claude/skills/generated/apps/SKILL.md` |
| Work in the Docs area | `.claude/skills/generated/docs/SKILL.md` |
| Work in the Test area | `.claude/skills/generated/test/SKILL.md` |
| Work in the Scripts area | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Analyzer area | `.claude/skills/generated/analyzer/SKILL.md` |
| Work in the Orchestrator area | `.claude/skills/generated/orchestrator/SKILL.md` |
| Work in the Parser area | `.claude/skills/generated/parser/SKILL.md` |
| Work in the Security area | `.claude/skills/generated/security/SKILL.md` |
| Work in the Server area | `.claude/skills/generated/server/SKILL.md` |
| Work in the Store area | `.claude/skills/generated/store/SKILL.md` |

<!-- milens:end -->
