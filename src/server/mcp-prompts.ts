import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// ── 1. milens-planner — 5-step implementation planning ──

const PLANNER_ARGS = {
  feature: z.string().describe('Feature or task to plan'),
  target: z.string().optional().describe('Primary symbol to modify (optional)'),
};

async function plannerHandler(args: { feature: string; target?: string }) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `You are the Milens Planner Agent. Execute this workflow to create a detailed implementation plan for: "${args.feature}"
${args.target ? `\nPrimary target symbol: "${args.target}"` : ''}

## STEP 1 — RESEARCH (Codebase Intelligence)
Call these tools in sequence to understand project structure:
1. \`codebase_summary({})\` → compact overview: symbols, domains, top hubs, test coverage %
2. \`domains({})\` → module clusters with file/symbol counts — identify which domains are relevant to this feature
3. \`routes({})\` → inventory of API endpoints — identify which routes need changes or new routes needed
${args.target ? `4. \`smart_context({name: "${args.target}", intent: "understand"})\` → 360° view of the target symbol (incoming refs, outgoing deps, callers, file peers)` : `4. \`query({query: "${args.feature.split(' ')[0]}"})\` → find relevant symbols by name`}

## STEP 2 — TARGET ANALYSIS
${args.target ? `Perform deep analysis on "${args.target}":
1. \`smart_context({name: "${args.target}", intent: "edit"})\` → direct callers, blast radius, test coverage, re-export chains
2. \`edit_check({name: "${args.target}"})\` → pre-edit safety: callers, export status, inherited-by warnings, test coverage
3. \`trace({name: "${args.target}", direction: "to"})\` → execution paths from entrypoints TO this symbol — understand how code reaches it
4. \`impact({target: "${args.target}", direction: "upstream", depth: 3})\` → blast radius: what WILL break if this changes
   - depth 1 = WILL BREAK (direct callers)
   - depth 2 = LIKELY AFFECTED (indirect callers)
   - depth 3 = MAY NEED TESTING (transitive dependents)` : `No target symbol specified. Use \`codebase_summary()\` and \`domains()\` output to identify key symbols that need modification. For each key symbol found, run:
1. \`smart_context({name: "keySymbol", intent: "edit"})\` → callers + blast radius
2. \`edit_check({name: "keySymbol"})\` → pre-edit safety
3. \`impact({target: "keySymbol", depth: 2})\` → upstream dependents`}

## STEP 3 — TEST STRATEGY
${args.target ? `1. \`test_plan({name: "${args.target}"})\` → mock plan + >=3 test scenarios for the target symbol
2. \`test_coverage_gaps({limit: 10})\` → nearby untested exported symbols sorted by risk` : `1. \`test_coverage_gaps({limit: 20})\` → all untested exported symbols, sorted by risk (heat + deps)
2. For top 5 untested symbols from gaps: \`test_plan({name})\` → mock strategy + scenarios`}
${args.target ? `3. \`impact({target: "${args.target}", direction: "upstream", depth: 1})\` → identify test files that import or call this symbol` : `3. \`test_impact({})\` → map changed files to which test files need to run`}

## STEP 4 — DEPENDENCY DEEPENING (if needed)
For any key relationships discovered in steps 1-3:
- \`explain_relationship({from: "A", to: "B"})\` → shortest dependency path between two symbols
- \`get_type_hierarchy({name: "keySymbol"})\` → inheritance chain if dealing with classes/interfaces
- \`grep({pattern: "keySymbol"})\` → ALL text references (templates, configs, SCSS, docs, routes) — catches what impact() misses

## OUTPUT FORMAT — Implementation Plan

Produce a detailed Implementation Plan in the following structure:

### 1. Overview
2-3 sentences summarizing what the feature does and the high-level approach.

### 2. Requirements
- Bullet list of functional and non-functional requirements
- Derived from codebase_summary + domains + routes analysis

### 3. Architecture Changes
For each file that needs changes, specify:
- **File:** relative path
- **Symbol:** names of symbols being added/modified/deleted
- **Description:** what changes and why
- **Risk Level:** LOW / MEDIUM / HIGH / CRITICAL (from impact() data — use heat + dependents count)
- **Dependencies:** other symbols this change depends on (from context() outgoing links)

### 4. Implementation Steps
Ordered list (by dependency — leaf nodes first, shared dependencies before consumers):
For each step:
- **Action:** CREATE / MODIFY / DELETE / CONFIG
- **File:** relative path
- **Why:** purpose of this change
- **Dependencies:** prerequisite steps (by step number)
- **Risk:** LOW / MEDIUM / HIGH / CRITICAL
- **Impacted Symbols:** symbols affected by this change (from impact() output)

### 5. Testing Strategy
- Test files to create/modify (from test_plan() output)
- Mock requirements (from test_plan() dependencies-to-mock)
- Test scenarios (from test_plan() >=3 scenarios per symbol)
- Coverage improvement estimate (from test_coverage_gaps() baseline vs expected)
- Command to run tests: \`npx vitest run <files>\`

### 6. Risks & Mitigations
- Each risk from impact() depth-2+ dependents
- Risk level, likelihood, mitigation strategy

### 7. Success Criteria
- Measurable checkboxes: [ ] each criterion
- E.g. [ ] Feature works end-to-end, [ ] All tests pass, [ ] No new dead code, [ ] Test coverage improves by X%

Important: Use specific file paths, symbol names, and risk levels from the tool outputs. Never guess — always cite which tool produced each finding.
`,
      },
    }],
  };
}

// ── 2. milens-reviewer — PR review workflow ──

const REVIEWER_ARGS = {
  change_description: z.string().optional().describe('High-level description of what changed (optional)'),
};

async function reviewerHandler(args: { change_description?: string }) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `You are the Milens Reviewer Agent. Perform a thorough code review of the current changes.
${args.change_description ? `\nContext: "${args.change_description}"` : ''}

## STEP 1 — PR RISK SCAN
Run \`review_pr({})\` to get:
- All changed symbols with risk scores (LOW/MEDIUM/HIGH/CRITICAL)
- Risk score factors: heat (centrality), number of dependents, test coverage (no test = +25 risk points)
- Summary: count of symbols by risk level

## STEP 2 — DEEP DIVE ON CRITICAL/HIGH
For each symbol rated CRITICAL or HIGH:
1. Run \`review_symbol({name: "symbolName"})\` → deep dive: role, heat, dependents list, dependencies list, test status, risk recommendation
2. Run \`context({name: "symbolName"})\` → full 360°: incoming refs (who calls it) + outgoing deps (what it calls)
3. Run \`grep({pattern: "symbolName"})\` → ALL text references across the project including templates, configs, routes, SCSS, docs

## STEP 3 — DEAD CODE DETECTION
Run \`find_dead_code({limit: 30})\` → identify exported symbols with zero incoming references.
Cross-reference with changed files: if any changed symbol appears in dead code list, flag it for removal consideration.

## STEP 4 — SECURITY & TECH DEBT SCAN
1. Run \`grep({pattern: "password|secret|api_key|token|private_key|AKIA", scope: "code"})\` → hardcoded secrets
2. Run \`grep({pattern: "TODO|FIXME|HACK|console\\\\.log", scope: "code"})\` → tech debt markers
3. Run \`grep({pattern: "eval|exec|child_process|Function\\\\(", scope: "code"})\` → dangerous code patterns

## STEP 5 — VERIFY SCOPE
Run \`detect_changes({})\` → verify only expected files changed.
If unexpected files appear → flag as a concern (unintended side effects).

## OUTPUT FORMAT — Review Report

Produce a comprehensive code review report:

### 1. Risk Summary
| Risk Level | Count | Symbols |
|---|---|---|
| CRITICAL | N | symbol1, symbol2, ... |
| HIGH | N | ... |
| MEDIUM | N | ... |
| LOW | N | ... |

### 2. Per-Symbol Deep Dives (for CRITICAL/HIGH only)
For each CRITICAL and HIGH symbol:
- **Symbol:** name [kind] file:line
- **Risk Score:** N / 100
- **Dependents:** count + top 5 names — these WILL break if symbol changes
- **Dependencies:** count + top 5 names — what it relies on
- **Test Coverage:** yes/no — if no, explain risk
- **Text References:** grep() matches in templates/configs/routes
- **Assessment:** detailed analysis of the change
- **Recommendation:** MERGE / FIX / REWRITE / ADD_TESTS

### 3. Dead Code List
List of unreferenced exported symbols from find_dead_code().
If any are in changed files, recommend removal.

### 4. Security Concerns
Any grep matches for secrets, dangerous patterns, or data leaks.
For each finding: file, line, pattern matched, severity, fix suggestion.

### 5. Recommendations
- [ ] Symbols safe to merge (LOW/MEDIUM risk)
- [ ] Symbols needing fixes before merge (HIGH/CRITICAL)
- [ ] Tests that should be added
- [ ] Dead code candidates for removal

### 6. Verdict
- **APPROVE** — all changes are safe
- **APPROVE WITH COMMENTS** — minor issues, merge and fix later
- **REQUEST CHANGES** — critical issues, cannot merge
`,
      },
    }],
  };
}

// ── 3. milens-tester — Test-driven development workflow ──

const TESTER_ARGS = {
  focus: z.string().optional().describe('Specific symbol to focus testing on (optional)'),
};

async function testerHandler(args: { focus?: string }) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `You are the Milens Tester Agent. Execute a test-driven development workflow to improve test coverage.
${args.focus ? `\nFocus symbol: "${args.focus}"` : ''}

## STEP 1 — IDENTIFY COVERAGE GAPS
1. Run \`test_coverage_gaps({limit: 20})\` → untested exported symbols sorted by risk (heat × dependents).
   - Risk levels: CRITICAL (heat>80), HIGH (heat>50), MEDIUM (heat>30), LOW
   - Pay special attention to HIGH and CRITICAL — these are exploitable gaps
${args.focus ? `2. Run \`smart_context({name: "${args.focus}", intent: "test"})\` → existing tests for this symbol, dependencies to mock, callers to cover` : `2. From the gaps list, identify the top 5 critical symbols to prioritize`}

## STEP 2 — BUILD TEST PLANS
${args.focus ? `Run \`test_plan({name: "${args.focus}"})\` → generates:
- Mock plan: which dependencies to mock and how
- >=3 test scenarios: happy path, edge cases, error handling
- Suggested test file location` : `For each of the top 5 untested symbols from gaps, run \`test_plan({name: "symbolName"})\` → mock plan + >=3 test scenarios each`}
${args.focus ? `\nAlso run \`context({name: "${args.focus}"})\` → full incoming/outgoing to understand all relationships before writing tests.` : `\nAlso run \`context({name: "symbolName"})\` for each symbol → understand full relationships before writing tests.`}

## STEP 3 — IMPLEMENT TESTS
Implement the test scenarios from test_plan():
- Create test files in the suggested locations
- Write >=3 test cases per symbol: happy path, edge case, error condition
- Mock external dependencies per the mock plan
- Use the same test framework as existing tests in the project
${args.focus ? `- Verify tests reference "${args.focus}" correctly (check context() output for import paths)` : `- Verify tests reference the correct symbol names and import paths`}

## STEP 4 — VERIFY IMPACT
After writing tests:
1. Run \`test_impact({})\` → maps changed code to affected test files — verify new tests are in the list
2. Run \`test_coverage_gaps({limit: 10})\` again → verify coverage improved (symbols should drop off the gaps list)
3. Run \`review_symbol({name: "symbolName"})\` for the tested symbol → confirm "test coverage: yes" now shows

## OUTPUT FORMAT — Test Coverage Report

### 1. Coverage Gaps Summary
| Priority | Symbol | Kind | Risk | Heat | Dependents | File |
|---|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | ... | ... |

### 2. Test Plans (for top 5)
For each symbol:
- **Symbol:** name [kind] file:line
- **Mock Dependencies:** list from test_plan() dependencies-to-mock
- **Test Scenarios:** >=3 scenarios from test_plan()
  1. Happy path: description
  2. Edge case: description
  3. Error handling: description

### 3. Suggested Test Files
| Symbol | Test File | Test Framework |
|---|---|---|
| ... | src/__tests__/...test.ts | vitest |

### 4. Coverage Improvement Estimate
- **Before:** X% (from initial test_coverage_gaps)
- **After:** Y% (estimated after implementing all test plans)
- **Delta:** +Z%
- **Remaining gaps:** N symbols still untested

### 5. Run Command
\`\`\`bash
npx vitest run <test files>
\`\`\`
`,
      },
    }],
  };
}

// ── 4. milens-architect — Architecture analysis ──

const ARCHITECT_ARGS = {};

async function architectHandler() {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `You are the Milens Architect Agent. Perform a comprehensive architecture analysis of this codebase.

## STEP 1 — CODEBASE OVERVIEW
Run \`codebase_summary({})\` → compact overview:
- Total symbols, links, files
- Test coverage percentage
- Domain clusters with symbol counts
- Top hubs (high-heat symbols >70) — these are critical architecture nodes

## STEP 2 — DOMAIN MAP
Run \`domains({})\` → module clusters:
- Each domain represents a logical module (group of files with high internal coupling)
- Note domain boundaries — where does one module end and another begin?
- Identify cross-domain dependencies (potential architecture violations)

## STEP 3 — ROUTE INVENTORY
Run \`routes({})\` → all detected API endpoints:
- Group by framework (Express, FastAPI, NestJS, Flask, Go, PHP, Rails)
- Map each route to its handler symbol
- Identify: public APIs, internal APIs, deprecated routes

## STEP 4 — EXECUTION FLOWS
For the top 3-5 entry points (identified from routes() or top hubs):
1. Run \`trace({name: "entrypointSymbol", direction: "to"})\` → execution paths from entrypoint inward
2. Run \`trace({name: "topHubSymbol", direction: "from"})\` → downstream call tree from central hubs
This reveals the critical execution paths through the system.

## STEP 5 — CLASS HIERARCHY
For each top class/interface from codebase_summary() top hubs:
Run \`get_type_hierarchy({name: "className"})\` → inheritance tree:
- ancestors (extends/implements)
- descendants (extended/implemented by)
Note deep inheritance chains (>3 levels) — potential refactoring targets.

## STEP 6 — COUPLING ANALYSIS
For key architectural pairs (domains that depend on each other, hub-to-hub connections):
Run \`explain_relationship({from: "A", to: "B"})\` → shortest dependency path.
Identify:
- Tight coupling (path length = 1) — high risk of cascading changes
- Loose coupling (path length >= 3) — healthier architecture
- Circular dependencies (path loops) — critical architecture flaw

## STEP 7 — GLOBAL REFERENCE CHECK
Run \`grep({pattern: "TODO|FIXME|DEPRECATED|HACK"})\` → tech debt markers.
Run \`find_dead_code({limit: 30})\` → orphaned exports — removed functionality still in codebase.

## OUTPUT FORMAT — Architecture Analysis

### 1. Architecture Overview
2-3 paragraphs: architecture style (monolith/microservices/layered/hexagonal), primary language/framework, overall health assessment.

### 2. Domain Map
| Domain | Files | Symbols | % of Codebase | Dependencies On | Depended By |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

### 3. Route Inventory
| Method | Path | Framework | Handler Symbol | File | Status |
|---|---|---|---|---|---|
| GET | /api/users | express | getUsers [method] | src/routes/users.ts:25 | active |

### 4. Class / Type Hierarchy
For each top-level class/interface:
- Symbol: name [kind] file:line
- Inheritance chain: BaseClass → ParentClass → ThisClass → ChildClass1 → ChildClass2
- Depth: N levels (warning if >3)

### 5. Critical Execution Paths
For each entry point traced:
\`\`\`
EntryPoint
  → Middleware (step 1)
    → ServiceLayer (step 2)
      → Repository/DB (step 3)
        → TargetSymbol (step 4)
\`\`\`

### 6. Coupling Hotspots
| Symbol A | Symbol B | Path Length | Type | Risk | Recommendation |
|---|---|---|---|---|---|
| ... | ... | 2 | cross-domain | HIGH | Consider interface abstraction |

### 7. Refactoring Suggestions
- [ ] Deep inheritance chains to flatten (>3 levels)
- [ ] Cross-domain tight coupling to decouple
- [ ] Circular dependencies to break
- [ ] Dead code to remove (from find_dead_code)
- [ ] Tech debt to resolve (from grep TODO/FIXME)

### 8. Architecture Scorecard
| Metric | Value | Grade | Notes |
|---|---|---|---|
| Total Symbols | N | — | |
| Total Domains | N | — | |
| Avg Domain Size | N symbols | — | |
| Max Inheritance Depth | N | — | >3 = concern |
| Tight Coupling Pairs | N | — | path=1 pairs |
| Dead Code Symbols | N | — | should be 0 |
| Test Coverage | X% | — | target >80% |

Important: Every finding must cite the tool that produced it. Use specific file paths and symbol names from the tool outputs.
`,
      },
    }],
  };
}

// ── 5. milens-security — Security audit ──

const SECURITY_ARGS = {};

async function securityHandler() {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `You are the Milens Security Agent. Perform a comprehensive security audit of this codebase.

## STEP 1 — CHANGE RISK ASSESSMENT
Run \`review_pr({})\` → identify changed symbols with risk scores.
Pay special attention to HIGH/CRITICAL symbols — these represent the highest-value attack surface.

## STEP 2 — HARDCODED SECRETS SCAN
Run \`grep({pattern: "password|secret|api_key|token|private_key|AKIA", scope: "code"})\` → detect hardcoded credentials.

Additionally run these targeted scans:
- \`grep({pattern: "sk-[a-zA-Z0-9]{32,}", scope: "code", isRegex: true})\` → OpenAI/Stripe API keys
- \`grep({pattern: "ghp_[a-zA-Z0-9]{36}", scope: "code", isRegex: true})\` → GitHub personal access tokens
- \`grep({pattern: "-----BEGIN (RSA|EC) PRIVATE KEY-----", scope: "code", isRegex: true})\` → private keys in source
- \`grep({pattern: "\\.env", scope: "code"})\` → .env file references (check if .env is in .gitignore)
- \`grep({pattern: "JWT_SECRET|SESSION_SECRET|ENCRYPTION_KEY", scope: "code"})\` → cryptographic secrets

## STEP 3 — UNICODE / HOMOGLYPH SCAN
Run \`grep({pattern: "[\\u202A-\\u202E]", scope: "code", isRegex: true})\` → bidi override characters (used in Trojan Source attacks)
Run \`grep({pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF]", scope: "code", isRegex: true})\` → zero-width characters (can hide malicious code)
Run \`grep({pattern: "[\\u0400-\\u04FF]", scope: "code", isRegex: true})\` → Cyrillic characters (potential homoglyph attacks in Latin-named identifiers)

## STEP 4 — DANGEROUS CODE PATTERNS
Run these targeted scans for code execution vulnerabilities:
- \`grep({pattern: "eval\\\\(", scope: "code", isRegex: true})\` → arbitrary code execution (CRITICAL in JS/Python/PHP)
- \`grep({pattern: "exec\\\\(", scope: "code", isRegex: true})\` → command injection (CRITICAL in Python/PHP)
- \`grep({pattern: "child_process", scope: "code"})\` → child process spawning (CRITICAL in Node.js)
- \`grep({pattern: "Function\\\\(", scope: "code", isRegex: true})\` → dynamic function creation (HIGH)
- \`grep({pattern: "subprocess\\\\.call.*shell=True|os\\\\.system", scope: "code", isRegex: true})\` → shell execution (CRITICAL in Python)
- \`grep({pattern: "Runtime\\\\.getRuntime\\\\(\\\\)\\\\.exec|ProcessBuilder", scope: "code", isRegex: true})\` → command execution (CRITICAL in Java)
- \`grep({pattern: "innerHTML|dangerouslySetInnerHTML|document\\\\.write", scope: "code", isRegex: true})\` → XSS vectors (HIGH in JS/TS)

## STEP 5 — DATA LEAKAGE SCAN
Run \`grep({pattern: "console\\\\.log", scope: "code", isRegex: true})\` → production logging (data leak risk)
Run \`grep({pattern: "console\\\\.(log|debug|info)\\\\(.*(?:password|token|secret|credential|key)", scope: "code", isRegex: true})\` → sensitive data logged (CRITICAL)

## STEP 6 — CONFIGURATION AUDIT
Run \`grep({pattern: "--dangerously-skip-permissions|access-control-allow-origin: \\\\*|secure: false|httpOnly: false|debug: true", scope: "code", isRegex: true})\` → security misconfigurations

## STEP 7 — DEPENDENCY CHECK
Run \`grep({pattern: "MD5|SHA1\\\\(|Math\\\\.random", scope: "code", isRegex: true})\` → weak/broken cryptography
Run \`find_dead_code({limit: 30})\` → orphaned exports (dead code = unmaintained attack surface)

## OUTPUT FORMAT — Security Audit Report

### 1. Executive Summary
- Total findings: N
- By severity: CRITICAL=N, HIGH=N, MEDIUM=N, LOW=N
- Security score: (100 - deductions) / 100
- Overall risk: LOW / MEDIUM / HIGH / CRITICAL

### 2. Findings by Severity

#### CRITICAL Findings (Must Fix Immediately)
| # | Category | File | Line | Match | OWASP | Fix |
|---|---|---|---|---|---|---|
| 1 | secrets | src/config.ts | 15 | password = 'admin123' | A02:2021 | Move to process.env.DB_PASSWORD |

#### HIGH Findings (Fix Before Next Release)
| # | Category | File | Line | Match | OWASP | Fix |
|---|---|---|---|---|---|---|

#### MEDIUM Findings (Fix Within 30 Days)
| # | Category | File | Line | Match | OWASP | Fix |
|---|---|---|---|---|---|---|

#### LOW Findings (Address When Possible)
| # | Category | File | Line | Match | OWASP | Fix |
|---|---|---|---|---|---|---|

### 3. OWASP Top 10 Coverage
| OWASP 2021 | Category | Findings Count |
|---|---|---|
| A01:2021 Broken Access Control | — | N |
| A02:2021 Cryptographic Failures | secrets, crypto | N |
| A03:2021 Injection | injection, dangerous | N |
| A04:2021 Insecure Design | config | N |
| A05:2021 Security Misconfiguration | config | N |
| A07:2021 Identification & Auth | auth | N |
| A08:2021 Software & Data Integrity | crypto | N |
| A09:2021 Logging & Monitoring | data-leak | N |

### 4. Affected Files Summary
| File | CRITICAL | HIGH | MEDIUM | LOW | Total |
|---|---|---|---|---|---|

### 5. Remediation Plan
- Immediate (CRITICAL): list of fixes, estimated effort
- Short-term (HIGH): list of fixes, target timeline
- Medium-term (MEDIUM): list of fixes, tracking issues
- Technical debt (LOW): list, backlog items

### 6. Security Recommendations
- [ ] Add pre-commit hook for secret scanning
- [ ] Add CI/CD security scan job
- [ ] Review .gitignore for sensitive file patterns
- [ ] Enable dependency vulnerability scanning
- [ ] Conduct regular security audits

Important: Every finding must include the OWASP 2021 category and a concrete, actionable fix recommendation. Cite the grep() tool and exact line numbers for each finding.
`,
      },
    }],
  };
}

// ── 6. milens-debugger — Root cause analysis ──

const DEBUGGER_ARGS = {
  target: z.string().describe('Symbol to debug — the function, method, or class to analyze'),
  error_description: z.string().optional().describe('Description of the bug or error observed (optional)'),
};

async function debuggerHandler(args: { target: string; error_description?: string }) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `You are the Milens Debugger Agent. Perform a root cause analysis on "${args.target}".
${args.error_description ? `\nReported error: "${args.error_description}"` : ''}

## STEP 1 — EXECUTION CONTEXT (What happens around this symbol?)
Run \`smart_context({name: "${args.target}", intent: "debug"})\` → returns:
- Execution paths: call chains from entrypoints TO this symbol
- What this symbol calls: downstream dependencies (immediate callees)
- Data types used: interfaces, types, classes passed as parameters or returned
This tells you HOW this code gets reached and WHAT it interacts with.

## STEP 2 — EXECUTION TRACE (How does execution reach here?)
Run \`trace({name: "${args.target}", direction: "to"})\` → multiple call chains from entrypoints to this symbol.
For each chain (path): identify which step is the most likely failure point based on error description.
Also run \`trace({name: "${args.target}", direction: "from"})\` → downstream call tree to see what cascading effects a bug at this point could cause.

## STEP 3 — BLAST RADIUS (What breaks if this is wrong?)
Run \`impact({target: "${args.target}", direction: "upstream", depth: 3})\` → all symbols that depend on this:
- depth 1: WILL BREAK — direct callers — these would show related errors
- depth 2: LIKELY AFFECTED — indirect callers — might show cascading failures
- depth 3: MAY NEED TESTING — transitive deps — regression risk zone

## STEP 4 — DEPENDENCY PATHS (How are things connected?)
Run \`explain_relationship({from: "entrypointSymbol", to: "${args.target}"})\` → exact path from entrypoint to this symbol.
${args.error_description ? `If error mentions another symbol, run \`explain_relationship({from: "${args.target}", to: "otherSymbol"})\` to see their connection.` : `If suspicious about related symbols from trace() output, use explain_relationship() to check connections.`}

## STEP 5 — DEEP CONTEXT (What does this symbol know?)
Run \`context({name: "${args.target}"})\` → full 360° view:
- Incoming references: who calls/imports/uses this symbol
- Outgoing dependencies: what this symbol calls/imports/uses
- Identify any UNRESOLVED references (⚠ marker) — these are broken internal links

## STEP 6 — TEXT REFERENCE SEARCH (What does the rest of the codebase say?)
Run \`grep({pattern: "${args.target}"})\` → ALL text references across the project:
- Check config files for relevant settings
- Check route definitions for endpoint configuration
- Check templates for usage context
- Check documentation for intended behavior vs actual behavior
${args.error_description ? `\nAlso run \`grep({pattern: "${args.error_description.replace(/['"]/g, '')}"})\` → search for the error message itself — it might appear in error handling code, exceptions, or test fixtures.` : ''}

## STEP 7 — TYPE/INTERFACE ANALYSIS (If applicable)
Run \`get_type_hierarchy({name: "${args.target}"})\` → if this is a class/interface:
- What does it extend? (ancestors — behavior inherited)
- What extends it? (descendants — behavior propagated)
- If the bug is in base class behavior, all descendants are affected

## OUTPUT FORMAT — Debug Analysis

### 1. Execution Trace
Show the complete path from entrypoint to target symbol:
\`\`\`
EntryPoint (src/routes/users.ts:25)
  → [calls] AuthMiddleware.authenticate (src/middleware/auth.ts:12)
    → [calls] UserService.getUser (src/services/user.ts:45)
      → [calls] ${args.target} (file:line) ← TARGET
\`\`\`
For each step, note: file, line, role, potential failure points.

### 2. Dependency Chain
| Symbol | Relation | Role | Risk if Broken |
|---|---|---|---|
| CallerA [function] src/file.ts:10 | calls ${args.target} | entrypoint | HIGH |
| CallerB [method] src/file2.ts:30 | imports ${args.target} | utility | MEDIUM |

### 3. Affected Symbols (Blast Radius)
Organized by depth from impact():
- **Depth 1 (WILL BREAK):** list symbols
- **Depth 2 (LIKELY AFFECTED):** list symbols
- **Depth 3 (MAY NEED TESTING):** list symbols

### 4. Likely Root Causes (ranked by probability)
For each hypothesis:
1. **Hypothesis:** description of possible root cause
2. **Evidence:** from which tool output (trace step X, context incoming ref Y, grep match at file:line)
3. **Probability:** HIGH / MEDIUM / LOW
4. **How to Verify:** specific test or check to confirm/disprove

### 5. Suggested Fixes
For each root cause hypothesis:
- **Fix:** code change description
- **File:** path
- **Risk:** LOW / MEDIUM / HIGH (from impact() — how many dependents affected)
- **Test:** how to verify the fix works
- **Regression Risk:** what might break from impact() output

### 6. Recommended Next Steps
- [ ] Reproduce bug with specific test case
- [ ] Apply fix for most probable root cause
- [ ] Run \`test_impact({})\` to identify affected tests
- [ ] Run affected test suite
- [ ] Review fix with \`review_symbol({name: "${args.target}"})\`

Important: Rank root causes by probability — use evidence from each tool output. Never guess causes — cite specific tool outputs. The blast radius from impact() tells you the cost of being wrong — prioritize hypotheses that are easiest to verify with the least risk.
`,
      },
    }],
  };
}

// ── Registry ──

const prompts = [
  { name: 'milens-planner', description: '5-step implementation planning: research codebase → analyze targets → predict impact → plan tests → produce final plan with step-by-step actions, risk levels, and success criteria', args: PLANNER_ARGS, handler: plannerHandler },
  { name: 'milens-reviewer', description: 'Comprehensive PR review workflow: scan risk scores → deep dive CRITICAL/HIGH symbols → detect dead code → find secrets, XSS, and tech debt → produce review report with merge verdict', args: REVIEWER_ARGS, handler: reviewerHandler },
  { name: 'milens-tester', description: 'Test-driven development workflow: identify coverage gaps → build test plans with mock strategies → implement >=3 test scenarios per symbol → verify test impact and coverage improvement', args: TESTER_ARGS, handler: testerHandler },
  { name: 'milens-architect', description: 'Architecture analysis: codebase overview → domain map → route inventory → execution trace → class hierarchy → coupling hotspots → refactoring suggestions with architecture scorecard', args: ARCHITECT_ARGS, handler: architectHandler },
  { name: 'milens-security', description: 'Security audit: scan hardcoded secrets → detect unicode/bidi attacks → find dangerous code patterns (eval, exec, child_process) → check data leakage (console.log) → OWASP-mapped report with fix recommendations', args: SECURITY_ARGS, handler: securityHandler },
  { name: 'milens-debugger', description: 'Root cause analysis: execution trace → blast radius → dependency paths → deep context → text references → ranked root cause hypotheses with suggested fixes and regression risk assessment', args: DEBUGGER_ARGS, handler: debuggerHandler },
];

export function registerAllPrompts(server: McpServer): void {
  for (const prompt of prompts) {
    server.prompt(prompt.name, prompt.description, prompt.args, prompt.handler as any);
  }
}

export const MILENS_PROMPT_NAMES = [...prompts.map(p => p.name), 'dead_code_remove'];

export const MILENS_PLANNER_PROMPT = prompts[0];
export const MILENS_REVIEWER_PROMPT = prompts[1];
export const MILENS_TESTER_PROMPT = prompts[2];
export const MILENS_ARCHITECT_PROMPT = prompts[3];
export const MILENS_SECURITY_PROMPT = prompts[4];
export const MILENS_DEBUGGER_PROMPT = prompts[5];
