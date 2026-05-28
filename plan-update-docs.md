# Plan: Update All Documentation & Website

> Generated: May 2026 | Current state: v0.6.4, 554 tests, 977 symbols

---

## Phase 1: Global Number Corrections (12 files)

Fix tool counts, version numbers, and stats across all files.

### 1. `package.json`
| Line | Current | Should Be |
|------|---------|-----------|
| 2 (`version`) | `"0.6.4"` | `"0.7.0"` (align with changelog) |
| 4 (`description`) | `"33 MCP tools, 6 sub-agent prompts"` | `"41 MCP tools, 7 sub-agent prompts, 50 security rules, 7 CLI workflows"` |

### 2. `README.md`
| Section | Issue | Fix |
|---------|-------|-----|
| Line 10 (badge) | `33 tools, 6 prompts` | `41 tools, 7 prompts` |
| Line 645 ("What's New in v0.8.0") | Aspirational, not released | Merge into v0.7.0 changelog, add v0.7.0 section for real |
| Line 660 ("What's New in v0.7.0") | OK but needs current date | Keep, verify features actually exist |
| Line 713 (test count) | `136 tests` | `554 tests (30 test files)` |
| Line 458 (profile sizing) | `minimal(10), standard(25), full(33)` | `minimal(10), standard(25), full(41)` |
| Missing | No workflow commands documented | Add `milens workflow <name>` section with tdd/review/plan/onboard/security-scan/refactor/handoff |
| Missing | No `milens serve` or `milens orchestrate` docs | Add CLI commands section |
| Section "Tool Catalog" | Verbose 41-tool listing | Convert to compact table grouped by category |
| Section "Sub-Agent Prompts" | Listed as 6 | Update to 7 (add `dead_code_remove`) |

### 3. `docs/index.html`
| Line | Issue | Fix |
|------|-------|-----|
| 240-243 (hero badges) | `33 MCP Tools`, `6 Sub-agent Prompts` | `41 MCP Tools`, `7 Sub-agent Prompts`, add `7 CLI Workflows` badge |
| 258 | `683 symbols and 981 links` | `977 symbols and 1,515 links` (real current stats) |
| 269 | `6 pre-built MCP prompts` | `7 pre-built MCP prompts` |
| 310-320 (terminal mockup) | ALL dummy numbers - `683 symbols, 981 links, 64 files`, `6 skill files` | Use actual stats from current index: `977 symbols, 1515 links, 115 files`, `13+ skill files` |
| 358 | `41 MCP tools, 7 prompts` (correct but inconsistent with hero) | Fix hero badges above to match |
| 526 (Free tier) | `All 41 MCP tools` (correct) | Keep |
| 580 (FAQ) | `246 skills vs 6` | Update ECC comparison if known, or remove |

### 4. `docs/enterprise.html`
| Line | Issue | Fix |
|------|-------|-----|
| 299 (hero stat) | `41 MCP Tools` (correct) | Keep |
| 355 (comparison table) | Free: `33 MCP Tools`, Pro: `41` | Free: `41 MCP Tools` |
| 355 (comparison table) | Free: `6 Prompts`, Pro: `7` | Free: `7 Prompts` |

### 5. `docs/pricing.html`
| Line | Issue | Fix |
|------|-------|-----|
| 256 | Free: `All 41 MCP tools` (correct) | Keep |
| 259 | `7 sub-agent prompts` (correct) | Keep |
| 425 | `AgentShield-backed` reference | Remove or replace with `milens security scan` |
| 492 (OSS section) | `33 tools` | `41 tools` |

### 6. `docs/pricing.md`
| Line | Issue | Fix |
|------|-------|-----|
| 24 | `6 sub-agent prompts` | `7 sub-agent prompts` |
| 27 | `All 41 MCP tools` (correct) | Keep |
| 83 | `33 tools` for free core | `41 tools` |

### 7. `docs/skills.html`
| Line | Issue | Fix |
|------|-------|-----|
| 230 (hero stats) | `33 Tools` | `41 Tools` |

### 8. `docs/adapters.md`
| Line | Issue | Fix |
|------|-------|-----|
| 80 (profile table) | `full=33 tools` | `full=41 tools` |

### 9. `docs/tools.md`
| Line | Issue | Fix |
|------|-------|-----|
| 7 | `41 MCP tools` (correct) | Keep |
| 120 | `7 pre-built MCP prompts` (correct) | Keep |
| Missing | New workflow CLI commands | Add section for `milens workflow <name>` |

### 10. `docs/changelog.html`
| Line | Issue | Fix |
|------|-------|-----|
| All | Lists v0.8.0 as "May 2026" released | Either remove v0.8.0 or mark as "In Development". Keep v0.7.0 only if package.json version matches |
| Current version | Says 0.8.0 | Should match `package.json` (0.7.0 after update). Add real 0.7.0 features: 14 new test files, 554 tests, 7 workflow commands, TDD/Security/Handoff workflows |

### 11. `docs/scenarios.html`
| Line | Issue | Fix |
|------|-------|-----|
| Hero | `41 MCP Tools` (correct) | Keep |
| Hero | `15 Workflow Stories`, `36 Tool Scenarios` | Verify counts, update if needed |

### 12. `docs/platforms.html`
| Line | Issue | Fix |
|------|-------|-----|
| 641 (feature parity) | Copilot ~30, Gemini ~25, Zed ~20 tools | Verify actual counts, update |

---

## Phase 2: Rewrite README.md

### New Structure:
```
┌─────────────────────────────────────────┐
│ # Milens — AI-DOS                       │
│ The Operating System for AI-Driven Dev  │
│ [badges: npm, tests, coverage, license] │
└─────────────────────────────────────────┘

## Quick Install (3 lines)
$ npx milens init --profile full
$ npx milens analyze -p . --force

## What is Milens?
1 paragraph. Code intelligence platform. 41 MCP tools + 7 sub-agent prompts + 7 CLI workflows.

## Architecture (diagram, keep existing)
4-layer stack, pipeline stages (keep, rút gọn)

## Features at a Glance (table)

| Feature | Description |
|---------|-------------|
| 🔍 Code Intelligence | 41 MCP tools — query, impact, context, trace, routes |
| 🛡️ Security Scanner | 50 rules, 9 categories, OWASP-mapped, dependency audit |
| 🤖 Sub-Agent Prompts | 7 prompts — plan, review, tdd, security, architect, debug, dead_code_remove |
| 🔄 CLI Workflows | 7 commands — tdd, review, plan, onboard, security-scan, refactor, handoff |
| 📊 Metrics | 7 quantified metrics — TER, LR, CQI, BRR, TCGR, DCER, CTR |
| 🧠 Learning Engine | Annotate → Recall → Evolve — confidence-based knowledge base |
| 🔌 12 Languages | TS, JS, Python, Java, Go, Rust, PHP, Ruby, Vue, HTML, CSS, Markdown |
| 🖥️ 7 Editors | Claude Code, Cursor, Copilot, OpenCode, Codex, Gemini CLI, Zed |

## CLI Commands
### Core
| Command | Description |
|---------|-------------|
| `analyze` | Index codebase into knowledge graph |
| `serve` | Start MCP server (stdio/HTTP) |
| `search` | FTS5 search across symbols |
| `status` | Index health check |
| `metrics` | 7-metric quality report |

### Workflows (7 new!)
| Command | Description |
|---------|-------------|
| `workflow tdd` | Test coverage gaps + risk-prioritized untested symbols |
| `workflow review` | PR risk analysis — git diff + heat scoring |
| `workflow plan` | Codebase summary — domains, top hubs |
| `workflow onboard` | Onboarding report — structure, entry points, next steps |
| `workflow security-scan` | Full security audit with all 50 rules |
| `workflow refactor` | Dead code detection + candidates |
| `workflow handoff` | Session knowledge summary + promotable annotations |

### Security
| Command | Description |
|---------|-------------|
| `security scan` | Scan for vulnerabilities (scope, severity filterable) |
| `security deps` | Audit dependencies against offline CVE database |

### Maintenance
| Command | Description |
|---------|-------------|
| `evolve` | Promote high-confidence annotations to rules/skills |
| `hooks` | Session lifecycle hook management |
| `init` | Bootstrap project with profile presets |
| `watch` | Auto-reindex on file changes |

## MCP Tools (compact table, grouped by category)

| Category | Tools |
|----------|-------|
| Search | `query`, `grep`, `context`, `get_file_symbols`, `get_type_hierarchy`, `semantic_search`, `find_similar` |
| Safety | `impact`, `edit_check`, `overview`, `detect_changes`, `find_dead_code`, `pre_commit_check`, `compare_impact` |
| Orchestration | `orchestrate` |
| Understanding | `smart_context`, `trace`, `routes`, `explain_relationship`, `domains` |
| Review/Testing | `review_pr`, `review_symbol`, `codebase_summary`, `test_plan`, `test_generate`, `test_coverage_gaps`, `test_impact` |
| Memory/Sessions | `annotate`, `recall`, `session_start`, `session_end`, `session_context`, `handoff` |
| Security | `security_scan`, `fix_apply` |
| Hooks | `hook_onFileChange`, `hook_preCompact`, `hook_postCompact` |
| Overview | `status`, `repos` |
| Developer | `ast_explore`, `test_query` |

## Sub-Agent Prompts
| Prompt | Purpose |
|--------|---------|
| `milens-planner` | 5-step implementation planning with blast radius |
| `milens-reviewer` | PR review — risk scan → deep dive → dead code → security |
| `milens-tester` | TDD — coverage gaps → test plans → implement → verify |
| `milens-security` | Security audit — secrets, injection, unicode, crypto, config |
| `milens-architect` | Architecture analysis — domains, routes, coupling, hierarchy |
| `milens-debugger` | Root cause analysis — trace → blast radius → hypotheses → fixes |
| `dead_code_remove` | Safe dead code removal with impact verification |

## Security (compact)
- **50+ rules** across 9 categories: secrets, injection, unicode, dangerous, config, data-leak, crypto, auth, file-access
- **OWASP Top 10 mapped**
- **Offline CVE database**: npm (16 CVEs), Python (7), Rust (3), Go (3), Java (6)
- **5 ecosystems**: npm, Python, Rust, Go, Java

## Supported Languages (12)
TypeScript, JavaScript, Python, Java, Go, Rust, PHP, Ruby, Vue, HTML, CSS, Markdown

## Editor Adapters (7)
Claude Code, Cursor, VS Code Copilot, OpenCode, Codex, Gemini CLI, Zed

## Metrics (7)
TER (Token Efficiency Ratio), LR (Learning Rate), CQI (Code Quality Index), BRR (Bug Recurrence Rate), TCGR (Test Coverage Growth Rate), DCER (Dead Code Elimination Rate), CTR (Confidence Threshold Ratio)

## Pricing
| Tier | Price | Tools |
|------|-------|-------|
| Free | $0 | 41 MCP tools, 7 prompts, 7 workflows, 50 rules |
| Pro | $19/seat/mo | + custom rules, team dashboards, priority support |
| Enterprise | Contact | + SSO, audit logs, on-prem, SLA |

## Changelog
### v0.7.0 (May 2026)
- 14 new test files (168 → 554 tests, 23% → 58% coverage)
- 7 CLI workflow commands: tdd, review, plan, onboard, security-scan, refactor, handoff
- Enhanced orchestrator with snapshot persistence
- Coverage thresholds in vitest.config.ts
- CI/CD: milens-ci-test.yml workflow

### v0.6.0 (March 2026)
- 41 MCP tools, 7 sub-agent prompts
- Learning engine: annotate → recall → evolve
- Offline CVE database with 35+ CVEs across 5 ecosystems
- 7 editor harness adapters
```

---

## Phase 3: Fix docs README & Dead Links

### `docs/README.md`
| Issue | Fix |
|-------|-----|
| Links to `ecc-milens-vibe-code.md` (doesn't exist) | Remove dead link |
| Links to `closed-loop-ai-development.md` (doesn't exist) | Remove dead link |
| Missing link to new `tools.md` | Add if needed |
| Missing link to `changelog.html` | Add link to changelog |

### Verify all cross-references
- `README.md` → `docs/index.html` → `docs/pricing.html` → `docs/enterprise.html`
- All should use consistent numbers

---

## Phase 4: Regenerate AGENTS.md & CLAUDE.md

```bash
# Re-index with updated stats
npx milens analyze -p . --force --verbose --skills

# This regenerates:
# - AGENTS.md (with milens section)
# - CLAUDE.md (with milens section)
# - .agents/skills/*/SKILL.md
# - .claude/skills/generated/*/SKILL.md
```

Verify after regeneration:
- Tool counts are correct (41)
- Symbol counts match current state
- Skill paths are correct per editor

---

## Phase 5: Verify All Changes

### Checklist
- [ ] `package.json` version + description updated
- [ ] `README.md` all numbers consistent (41 tools, 7 prompts, 7 workflows, 554 tests)
- [ ] `docs/index.html` hero badges + terminal mockup updated
- [ ] `docs/enterprise.html` comparison table fixed
- [ ] `docs/pricing.html` + `docs/pricing.md` free tier counts unified
- [ ] `docs/skills.html` hero stats updated
- [ ] `docs/adapters.md` profile tool counts updated
- [ ] `docs/tools.md` workflow section added
- [ ] `docs/changelog.html` versions aligned with package.json
- [ ] `docs/README.md` dead links removed
- [ ] `docs/scenarios.html` + `docs/platforms.html` verified
- [ ] `AGENTS.md` + `CLAUDE.md` regenerated with current stats
- [ ] All HTML files have consistent meta descriptions
- [ ] No remaining `33 tools` or `6 prompts` references
- [ ] No remaining `AgentShield` references
- [ ] `npm test` still passes (554 tests)
- [ ] `npm run lint` passes

---

## Execution Order

1. Phase 1: Fix all numbers (bulk edit, ~12 files)
2. Phase 2: Rewrite README.md (major restructure)
3. Phase 3: Fix docs/README.md dead links
4. Phase 4: Regenerate AGENTS.md & CLAUDE.md
5. Phase 5: Verify consistency across all files
