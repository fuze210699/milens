---
name: milens-code-review
description: Automated Code Review — PR analysis, symbol deep-dive, dead code detection, tech debt grep, and review report
---

# milens-code-review — Automated Code Review

Analyze a PR or local changes with multi-layered review: risk scoring, symbol deep-dives, dead code audit, tech debt search, and a structured report.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_review_pr` | List changed files + affected symbols with risk scores |
| `mcp_milens_review_symbol` | Deep-dive on a single symbol (role, heat, dependents, test status) |
| `mcp_milens_context` | Incoming references + outgoing dependencies |
| `mcp_milens_find_dead_code` | Find exported symbols with zero references |
| `mcp_milens_grep` | Text search for tech debt markers and dangerous patterns |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: PR Overview

Start with the full PR-level assessment.

```
mcp_milens_review_pr({repo: "<workspaceRoot>"})
```

Review the output for:
- **Changed files** — what was touched
- **Affected symbols** — each with a risk score (CRITICAL, HIGH, MEDIUM, LOW)
- **Risk summary** — distribution of risk levels across the change

### Step 2: Deep-Dive on High-Risk Symbols

For every symbol rated CRITICAL or HIGH, perform a deep-dive.

```
mcp_milens_review_symbol({name: "<symbolName>", repo: "<workspaceRoot>"})
```

What you get:
- **Role** — what the symbol does in the architecture
- **Heat** — frequency of changes, complexity, fan-in/fan-out
- **Dependents count** — how many things break if this is wrong
- **Test status** — whether it has test coverage

### Step 3: Context for High-Risk Symbols

Still for CRITICAL/HIGH symbols, get 360° context.

```
mcp_milens_context({name: "<symbolName>", repo: "<workspaceRoot>"})
```

This reveals:
- **Incoming references** — who depends on this symbol
- **Outgoing calls** — what this symbol depends on
- **Re-export chains** — if the symbol is re-exported through barrel files

### Step 4: Dead Code Audit

Check for exported symbols with zero references (potential dead code).

```
mcp_milens_find_dead_code({repo: "<workspaceRoot>", limit: 20})
```

Flag any dead code that is:
- Newly introduced by this PR
- In files touched by this PR
- Adjacent to changed code (same module)

### Step 5: Tech Debt Search

Search for tech debt markers and debugging remnants.

```
mcp_milens_grep({pattern: "TODO|FIXME|HACK|console\\.(log|debug)", scope: "code", repo: "<workspaceRoot>"})
```

Also check for:
- Commented-out code
- `@ts-ignore` or `@ts-expect-error` (TypeScript)
- `# noqa` or `# type: ignore` (Python)
- Empty catch blocks

### Step 6: Produce Review Report

Consolidate findings into a review report with these sections:

1. **Summary** — files changed, risk distribution
2. **Symbol Deep-Dives** — one entry per CRITICAL/HIGH symbol with findings from Steps 2-3
3. **Dead Code** — symbols flagged from Step 4, with recommendations
4. **Tech Debt** — markers found in Step 5, with severity
5. **Recommendations** — prioritized list of actions (blocking vs. non-blocking)
6. **Verdict** — APPROVED / NEEDS CHANGES / BLOCKED

## Example Session

### Input

```
"review the PR for branch feature/auth-refactor"
```

### Tool Calls

**Step 1 — PR overview:**
```
mcp_milens_review_pr({repo: "/home/user/project"})
```

**Output:**
```
Changed files (4):
  src/auth/login.ts          [modified]
  src/auth/tokens.ts         [new]
  src/auth/types.ts          [modified]
  src/middleware/auth.ts     [modified]

Affected symbols:
  authenticate    [function]  CRITICAL  — 15 dependents, no tests
  generateToken   [function]  HIGH      — 8 dependents, 1 test
  UserSession     [interface] MEDIUM    — 5 dependents
  validateRole    [function]  LOW       — 2 dependents
```

**Step 2 — Deep-dive on CRITICAL symbol:**
```
mcp_milens_review_symbol({name: "authenticate", repo: "/home/user/project"})
```

**Output:**
```
Symbol: authenticate [function] — CRITICAL
  Role: core auth entry point, all protected routes depend on it
  Heat: 23 commits in last 90 days, 87% modification rate
  Dependents: 15 (12 direct callers + 3 middleware wrappers)
  Test status: 0 tests, 0% coverage
  Complexity: high (cyclomatic 14, 5 branching paths)
```

**Step 3 — Context:**
```
mcp_milens_context({name: "authenticate", repo: "/home/user/project"})
```

**Output:** 15 incoming refs (routes, middleware), 4 outgoing deps (token validation, user lookup, logger, rate limiter)

**Step 4 — Dead code:**
```
mcp_milens_find_dead_code({repo: "/home/user/project", limit: 20})
```

**Output:** `legacyAuthCheck` in the same module has 0 references — candidate for removal.

**Step 5 — Tech debt:**
```
mcp_milens_grep({pattern: "TODO|FIXME|HACK|console\\.(log|debug)", scope: "code", repo: "/home/user/project"})
```

**Output:** 3 matches — 1 `console.log` in tokens.ts, 2 `TODO` comments in login.ts.

**Step 6 — Report produced** (see report format above).

## Best Practices

1. **Don't skip the deep-dive.** CRITICAL symbols demand `review_symbol` + `context` — surface-level review misses cascading failures.
2. **Dead code in the diff is a red flag.** If a new symbol has zero references, question whether it belongs in this PR.
3. **Tech debt in new code is a blocker.** `console.log`, `FIXME`, or debug code should not ship. Flag it as blocking.
4. **Risk score drives review depth.** HIGH/CRITICAL = full deep-dive. MEDIUM = quick context check. LOW = skip unless it's a new file.
5. **Produce a written report.** Don't just run the tools — consolidate findings into a review document the team can reference.

## Quality Gate

| Criteria | Pass | Fail |
|---|---|---|
| PR review tool | Review completes without errors | Tool fails or returns partial data |
| Risk assessment | All CRITICAL/HIGH symbols deep-dived | Any CRITICAL symbol skipped |
| Dead code check | No newly introduced dead code | New dead code found in changed files |
| Tech debt grep | No debug code (`console.log`, etc.) | Debug/leftover code in diff |
| Report completeness | All 6 report sections filled | Missing sections or incomplete findings |
