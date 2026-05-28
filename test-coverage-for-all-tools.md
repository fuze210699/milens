# Test Coverage Plan — 100% Tools, Workflows & Features

> **Goal:** Every MCP tool, CLI command, workflow, and customer-facing feature has a working test file.
> **Current:** 23% coverage (107/459), 16 test files.
> **Target:** 100% coverage of exported public API symbols.

---

## 1. Definitions — What Must Be Tested

### 1.1 MCP Tools (41 tools exposed via `mcp_milens_*`)

| # | Tool | Category | Current Test | Priority |
|---|------|----------|-------------|----------|
| 1 | `query` | Search | ❌ | P0 |
| 2 | `grep` | Search | ❌ | P0 |
| 3 | `context` | Search | ❌ | P0 |
| 4 | `get_file_symbols` | Search | ❌ | P1 |
| 5 | `get_type_hierarchy` | Search | ❌ | P1 |
| 6 | `impact` | Safety | ❌ | P0 |
| 7 | `edit_check` | Safety | ❌ | P0 |
| 8 | `detect_changes` | Safety | ❌ | P1 |
| 9 | `find_dead_code` | Safety | ❌ | P1 |
| 10 | `overview` | Safety | ❌ | P0 |
| 11 | `pre_commit_check` | Safety | ❌ | P1 |
| 12 | `compare_impact` | Safety | ❌ | P1 |
| 13 | `orchestrate` | Orchestration | ❌ | P1 |
| 14 | `smart_context` | Understanding | ❌ | P0 |
| 15 | `trace` | Understanding | ❌ | P1 |
| 16 | `routes` | Understanding | ❌ | P1 |
| 17 | `explain_relationship` | Understanding | ❌ | P1 |
| 18 | `domains` | Understanding | ❌ | P1 |
| 19 | `review_pr` | Review | ❌ | P0 |
| 20 | `review_symbol` | Review | ❌ | P1 |
| 21 | `codebase_summary` | Review | ❌ | P0 |
| 22 | `test_plan` | Testing | ❌ | P0 |
| 23 | `test_generate` | Testing | ❌ | P1 |
| 24 | `test_coverage_gaps` | Testing | ❌ | P1 |
| 25 | `test_impact` | Testing | ❌ | P1 |
| 26 | `security_scan` | Security | ✅ `test/unit/security-rules.test.ts` | P1 |
| 27 | `fix_apply` | Automation | ❌ | P2 |
| 28 | `annotate` | Memory | ❌ | P0 |
| 29 | `recall` | Memory | ❌ | P0 |
| 30 | `session_start` | Memory | ❌ | P0 |
| 31 | `session_context` | Memory | ❌ | P1 |
| 32 | `session_end` | Memory | ❌ | P0 |
| 33 | `handoff` | Memory | ❌ | P2 |
| 34 | `hook_onFileChange` | Hooks | ❌ | P1 |
| 35 | `hook_preCompact` | Hooks | ❌ | P2 |
| 36 | `hook_postCompact` | Hooks | ❌ | P2 |
| 37 | `status` | Overview | ❌ | P0 |
| 38 | `repos` | Overview | ❌ | P1 |
| 39 | `semantic_search` | Search | ❌ | P2 |
| 40 | `find_similar` | Search | ❌ | P2 |
| 41 | `ast_explore` | Developer | ❌ | P2 |
| 42 | `test_query` | Developer | ❌ | P2 |

### 1.2 CLI Commands (18 commands)

| # | Command | Current Test | Priority |
|---|---------|-------------|----------|
| 1 | `analyze` | ✅ (via engine/scanner/resolver tests) | P1 |
| 2 | `search` | ❌ | P1 |
| 3 | `inspect` | ❌ | P1 |
| 4 | `impact` | ❌ | P1 |
| 5 | `status` | ❌ | P1 |
| 6 | `list` | ✅ `test/unit/registry.test.ts` | P1 |
| 7 | `clean` | ❌ | P2 |
| 8 | `dashboard` | ❌ | P2 |
| 9 | `evolve` | ❌ | P0 |
| 10 | `metrics` | ❌ | P0 |
| 11 | `workflow tdd` | ❌ | P1 |
| 12 | `workflow review` | ❌ | P1 |
| 13 | `workflow plan` | ❌ | P1 |
| 14 | `workflow onboard` | ❌ | P2 |
| 15 | `workflow security-scan` | ❌ | P1 |
| 16 | `workflow refactor` | ❌ | P1 |
| 17 | `workflow handoff` | ❌ | P2 |
| 18 | `security scan` | ❌ | P0 |
| 19 | `security deps` | ❌ | P0 |
| 20 | `hooks` | ✅ `test/unit/hooks.test.ts` | P1 |
| 21 | `init` | ❌ | P2 |
| 22 | `watch` | ❌ | P2 |

### 1.3 Core Engine Features

| # | Feature | Source | Current Test | Priority |
|---|---------|--------|-------------|----------|
| 1 | Symbol extraction (tree-sitter) | `src/parser/extract.ts` | ✅ `test/unit/extractor.test.ts` | — |
| 2 | Link resolution | `src/analyzer/resolver.ts` | ✅ `test/unit/resolver.test.ts` | — |
| 3 | Metadata enrichment | `src/analyzer/enrich.ts` | ❌ | P0 |
| 4 | File scanning | `src/analyzer/scanner.ts` | ✅ `test/unit/scanner.test.ts` | — |
| 5 | Database CRUD | `src/store/db.ts` | ✅ `test/unit/database.test.ts`, `db-extended.test.ts` | — |
| 6 | Vector embeddings | `src/store/vectors.ts` | ✅ `test/unit/vectors.test.ts` | — |
| 7 | Repository registry | `src/store/registry.ts` | ✅ `test/unit/registry.test.ts` | — |
| 8 | Annotation store | `src/store/annotations.ts` | ❌ | P0 |
| 9 | Confidence decay | `src/store/confidence.ts` | ❌ | P0 |
| 10 | AGENTS.md generation | `src/agents-md.ts` | ✅ `test/unit/agents-md.test.ts` | — |
| 11 | Skill generation | `src/skills.ts` | ❌ | P1 |
| 12 | Metrics computation | `src/metrics.ts` | ❌ | P0 |
| 13 | PR review engine | `src/analyzer/review.ts` | ✅ `test/unit/review.test.ts` | — |
| 14 | Test plan generation | `src/analyzer/testplan.ts` | ✅ `test/unit/testplan.test.ts` | — |
| 15 | Orchestrator | `src/orchestrator/orchestrator.ts` | ✅ `test/unit/orchestrator.test.ts` | — |
| 16 | Security rules engine | `src/security/rules.ts` | ✅ `test/unit/security-rules.test.ts` | — |
| 17 | Dependency audit | `src/security/deps.ts` | ❌ | P0 |
| 18 | Hook system | `src/server/hooks.ts` | ✅ `test/unit/hooks.test.ts` | — |
| 19 | MCP server | `src/server/mcp.ts` | ❌ | P0 |
| 20 | HTML/CSS parser | `src/parser/lang-html.ts` / `lang-css.ts` | ✅ `test/unit/html-css.test.ts` | — |
| 21 | Markdown parser | `src/parser/lang-md.ts` | ✅ `test/unit/markdown.test.ts` | — |
| 22 | Vue import resolution | — | ✅ `test/unit/vue-import.test.ts` | — |
| 23 | Test plan MCP tool | `src/server/test-plan.ts` | ❌ | P1 |

---

## 2. New Test Files Required (14 files)

### 2.1 `test/unit/mcp-tools.test.ts` — P0 (CRITICAL)
**Covers:** `src/server/mcp.ts` — `createMcpServer`, all 42 MCP tool handlers
**Test categories:**
- Tool registration: verify all 42 tools are registered with correct names
- Search tools: `query`, `grep`, `context` — test with fixture DB
- Impact tools: `impact`, `edit_check`, `overview`, `detect_changes`
- Understanding tools: `smart_context` (all 4 intents), `trace`, `explain_relationship`
- Review tools: `review_pr`, `review_symbol`, `codebase_summary`
- Memory tools: `annotate`, `recall`, `session_start`, `session_context`, `session_end`, `handoff`
- Overview: `status`, `repos`, `domains`, `routes`
- Testing: `test_plan`, `test_coverage_gaps`, `test_impact`, `test_generate`
- Security: `security_scan`, `fix_apply`
- Orchestration: `orchestrate`, `compare_impact`
- Search: `semantic_search`, `find_similar`
- Developer: `ast_explore`, `test_query`
- Hooks: `hook_onFileChange`, `hook_preCompact`, `hook_postCompact`
**Strategy:** Use a test fixture SQLite database (`test/fixtures/ts-project`), test each tool with valid/invalid inputs.

### 2.2 `test/unit/annotations.test.ts` — P0 (CRITICAL)
**Covers:** `src/store/annotations.ts` — `AnnotationStore`
**Tests:**
- `annotate()`: create new, update existing, upsert behavior
- `recall()`: filter by symbol, key, agent, session
- `sessionStart()`: create session, verify ID + metadata
- `sessionEnd()`: end session, verify status + stats
- `sessionContext()`: get session metadata + annotations
- `handoff()`: transfer context between sessions
- `getAnnotationCount()`: count by filters
- Confidence scoring: boost on recall, decay

### 2.3 `test/unit/confidence.test.ts` — P0 (CRITICAL)
**Covers:** `src/store/confidence.ts` — `runDecayPass`, `decayConfidence`
**Tests:**
- `decayConfidence()`: single annotation decay over time
- `runDecayPass()`: batch decay, configurable interval
- Edge cases: zero annotations, already-decayed, freshly updated

### 2.4 `test/unit/deps-audit.test.ts` — P0 (CRITICAL)
**Covers:** `src/security/deps.ts` — `auditDependencies`, `parseDependencies`, `checkVulnerabilities`, `detectEcosystem`
**Tests:**
- `detectEcosystem()`: identify npm, pip, cargo, etc.
- `parseDependencies()`: npm package.json, Python requirements.txt
- `checkVulnerabilities()`: mock vulnerability DB, check known CVEs
- `auditDependencies()`: full audit flow, formatted output

### 2.5 `test/unit/metrics.test.ts` — P0 (CRITICAL)
**Covers:** `src/metrics.ts` — `computeMetrics`, `formatMetricsReport`
**Tests:**
- TER (Token Efficiency Ratio): compute from tool call stats
- LR (Learning Rate): annotation creation rate
- CQI (Code Quality Index): from dead code + coverage
- BRR (Bug Recurrence Rate): from annotations
- TCGR (Test Coverage Growth Rate): week-over-week
- DCER (Dead Code Elimination Rate)
- CTR (Confidence Threshold Ratio)
- `formatMetricsReport()`: all output formats (table, json, markdown)

### 2.6 `test/unit/enrich.test.ts` — P0 (CRITICAL)
**Covers:** `src/analyzer/enrich.ts` — `enrichMetadata`
**Tests:**
- Role assignment: entrypoint, hub, utility, leaf, datatype
- Heat score computation: by incoming link count
- Domain clustering: union-find algorithm
- Edge cases: isolated symbols, circular dependencies

### 2.7 `test/unit/cli.test.ts` — P0 (CRITICAL)
**Covers:** `src/cli.ts` — all CLI command handlers
**Tests:**
- `analyze`: full index pipeline
- `search` / `inspect` / `impact`: query commands
- `status` / `list`: overview commands
- `evolve`: promotion logic
- `metrics`: computation + reporting
- `security scan`: with fixture project, verify findings
- `security deps`: npm audit
- `workflow tdd / review / plan / onboard / security-scan / refactor / handoff`
- `hooks list / enable / disable`
- `watch`: file change debounce
- `init`: bootstrap with profiles
- `dashboard`: server startup on port

### 2.8 `test/unit/skills.test.ts` — P1
**Covers:** `src/skills.ts` — `generateSkills`
**Tests:**
- Profile selection: core, developer, security, full
- Skill file generation: verify content + path
- `has()`: check if skill exists

### 2.9 `test/unit/server-test-plan.test.ts` — P1
**Covers:** `src/server/test-plan.ts` — `generateTestPlan`
**Tests:**
- Mock strategy generation
- Test scenario enumeration (happy path, edge case, error)
- Framework detection

### 2.10 `test/unit/mcp-prompts.test.ts` — P1
**Covers:** `src/server/mcp-prompts.ts` — `registerAllPrompts`
**Tests:**
- All 7 sub-agent prompts registered
- Prompt content contains expected tools
- dead_code_remove prompt workflow

### 2.11 `test/unit/utils.test.ts` — P1
**Covers:** `src/utils.ts` — `isTestFile`
**Tests:**
- Test file detection patterns (.test., .spec., __tests__/)
- Support for ts, js, py, go, rs, java

### 2.12 `test/unit/languages.test.ts` — P1
**Covers:** `src/parser/languages.ts` — `supportedExtensions`, `langForFile`
**Tests:**
- All 12 language extensions map correctly
- Unknown extension → null/undefined
- Case insensitivity

### 2.13 `test/unit/parser-loader.test.ts` — P2
**Covers:** `src/parser/loader.ts` — `loadLanguage`, `getParser`
**Tests:**
- Language loading with cached WASM
- Fallback behavior on missing language

### 2.14 `test/unit/parser-extract-cache.test.ts` — P2
**Covers:** `src/parser/extract.ts` — `clearQueryCache`
**Tests:**
- Cache invalidation
- Cache hit after clear

---

## 3. Existing Test Files — Audit & Enhance

| File | Tests | Coverage Gap | Action |
|------|-------|-------------|--------|
| `database.test.ts` | 15 | Missing: `getRepoSummary`, `getStaleFiles`, `getTestCoverage`, `getTestImpact`, `getCodebaseSummary`, `getFilesByZone`, `traceToEntrypoints`, `getToolUsageStats`, `getConfidenceDistribution`, `editCheck`, `rebuildSearch` | Add 10+ tests |
| `db-extended.test.ts` | 26 | Good coverage | Minor additions |
| `hooks.test.ts` | 7 | Missing: `defaultOnPreCompact`, `defaultOnPostCompact`, `defaultOnFileChange` | Add 3 tests |
| `orchestrator.test.ts` | 12 | Missing: `compare`, `runAndFormat`, edge cases | Add 3 tests |
| `review.test.ts` | 6 | Missing: `reviewPr` | Add 2 tests |
| `security-rules.test.ts` | 8 | Good | Minor additions |
| `testplan.test.ts` | 10 | Missing: `analyzeTestImpact` | Add 1 test |

---

## 4. CI/CD Enhancement Plan

### 4.1 Fix `milens-pr-guard.yml`

Add these steps:
```yaml
- name: Install dependencies
  run: npm ci
- name: Type check
  run: npm run lint
- name: Build
  run: npm run build
- name: Run tests
  run: npm test
- name: Coverage report
  run: npx vitest run --coverage
- name: Security scan
  run: npx milens security scan -p . --scope secrets,data-leak --severity HIGH
- name: Find dead code
  run: npx milens workflow refactor -p .
- name: PR risk check
  run: npx milens workflow review -p .
```

### 4.2 Add `milens-ci-test.yml` — New workflow

```yaml
name: Milens CI Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage
      - name: Coverage threshold
        run: |
          COV=$(node -e "process.stdout.write(process.env.COVERAGE || '0')")
          if [ "$COV" -lt 50 ]; then echo "Coverage below 50%"; exit 1; fi
```

### 4.3 Add `package.json` coverage threshold

```json
"vitest": {
  "coverage": {
    "thresholds": {
      "lines": 70,
      "functions": 70,
      "branches": 60,
      "statements": 70
    }
  }
}
```

---

## 5. Implementation Order (Weeks)

### Week 1: Foundation (P0 — Source modules)
| Day | Task |
|-----|------|
| 1 | `test/unit/annotations.test.ts` — AnnotationStore CRUD |
| 2 | `test/unit/confidence.test.ts` — Decay engine |
| 3 | `test/unit/metrics.test.ts` — Metrics computation |
| 4 | `test/unit/enrich.test.ts` — Metadata enrichment |
| 5 | `test/unit/deps-audit.test.ts` — Dependency audit |

### Week 2: Integration (P0 — Server & CLI)
| Day | Task |
|-----|------|
| 1-2 | `test/unit/mcp-tools.test.ts` — All 42 MCP tool handlers |
| 3-4 | `test/unit/cli.test.ts` — All CLI commands |
| 5 | Enhance existing tests: `database.test.ts`, `hooks.test.ts`, `orchestrator.test.ts` |

### Week 3: Polish (P1-P2)
| Day | Task |
|-----|------|
| 1 | `test/unit/skills.test.ts` |
| 2 | `test/unit/server-test-plan.test.ts` + `test/unit/mcp-prompts.test.ts` |
| 3 | `test/unit/utils.test.ts` + `test/unit/languages.test.ts` |
| 4 | `test/unit/parser-loader.test.ts` + `test/unit/parser-extract-cache.test.ts` |
| 5 | CI/CD: fix workflows, add coverage threshold, verify green pipeline |

---

## 6. Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Test files | 16 | **30** (14 new) |
| Test cases | 168 | **400+** |
| Coverage | 23% (107/459) | **70%+** |
| MCP tools tested | ~5/42 | **42/42** |
| CLI commands tested | 5/22 | **22/22** |
| Workflows tested | 1/7 | **7/7** |
| CI runs tests | ❌ No | ✅ Yes with coverage |
| Coverage threshold | ❌ None | ✅ 70% minimum |

---

## 7. Summary

| Category | Files to Create | Files to Enhance | Total |
|----------|----------------|-----------------|-------|
| Source modules | 6 (annotations, confidence, metrics, enrich, deps, skills) | 3 (database, hooks, orchestrator) | 9 |
| Server/CLI | 3 (mcp-tools, cli, server-test-plan) | 0 | 3 |
| Parsers/Utils | 4 (utils, languages, loader, extract-cache) | 0 | 4 |
| MCP Prompts | 1 (mcp-prompts) | 0 | 1 |
| CI/CD | 1 workflow | 1 workflow fix | 2 |
| **Total** | **14 new** | **3 enhanced** + **2 CI** | **19 items** |
