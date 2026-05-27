---
name: milens-eval
description: Evaluation & Quality Gate — plan, implement, verify scope, review risk, run tests, check coverage, and pass/fail
---

# milens-eval — Evaluation & Quality Gate

A structured quality gate for feature development: plan tests, implement changes, verify scope, review risks, run impacted tests, check coverage gaps, and produce a pass/fail verdict.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_test_plan` | Generate test strategy before implementation |
| `mcp_milens_detect_changes` | Verify only expected files changed after implementation |
| `mcp_milens_review_pr` | Risk assessment of the changes |
| `mcp_milens_test_impact` | Identify and run affected test files |
| `mcp_milens_test_coverage_gaps` | Verify no new untested critical symbols introduced |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Plan Tests (Before Implementation)

Before writing code, plan the test strategy.

```
mcp_milens_test_plan({name: "<symbolName>", repo: "<workspaceRoot>"})
```

This provides:
- **Mock strategy** — what dependencies to isolate
- **Test scenarios** — happy path, error states, edge cases
- **Affected test files** — existing test files that may need updates

Review the plan to ensure it covers:
- Core functionality (happy path)
- Input validation (error handling)
- Integration points (service boundaries)
- Edge cases (null, empty, boundary values)

### Step 2: Implement Changes

Write the actual code changes. This is the implementation phase:
1. Write or update the target symbol(s)
2. Implement tests following the plan from Step 1
3. Follow existing code conventions and patterns
4. No `console.log`, no commented-out code, no debug artifacts

### Step 3: Detect Changes

Verify the scope of changes matches expectations.

```
mcp_milens_detect_changes({repo: "<workspaceRoot>"})
```

Check:
- **Expected files present** — all intended modifications are listed
- **No unexpected files** — no config drift, accidental staging, or side effects
- **No missing files** — if a file you expected to change is absent, investigate

### Step 4: Review Risk

Assess the quality and risk of the changes.

```
mcp_milens_review_pr({repo: "<workspaceRoot>"})
```

Focus on:
- **CRITICAL symbols** — any symbol rated CRITICAL needs thorough review
- **Risk distribution** — how many HIGH/MEDIUM/LOW symbols changed
- **Review suggestions** — automated findings to address

### Step 5: Run Tests

Identify and run all affected tests.

```
mcp_milens_test_impact({repo: "<workspaceRoot>"})
```

This returns the list of test files impacted by the changes. Run them all:
- If any test fails: fix before proceeding
- If a test you didn't expect is affected: investigate why
- If a test you expected is missing: your test files may not be indexed

### Step 6: Check Coverage Gaps

Verify no new untested critical symbols were introduced.

```
mcp_milens_test_coverage_gaps({repo: "<workspaceRoot>", limit: 20})
```

Review the output:
- **Newly introduced symbols** — should have test coverage
- **Pre-existing gaps** — note them but don't fail the gate (they're not new)
- **HIGH risk + no tests** — if any HIGH-risk symbol in the change has no tests, this is a failure

### Step 7: Quality Gate Verdict

Apply the pass/fail criteria (see Quality Gate section below) and produce a verdict:

**PASSED:**
- All test files pass
- No CRITICAL review_pr findings
- No unexpected files in detect_changes
- No new HIGH-risk uncovered symbols

**CONDITIONAL PASS:**
- All tests pass
- CRITICAL review_pr findings are acknowledged and documented with remediation plan
- Minor unexpected files that are harmless (lockfile updates)

**FAILED:**
- Any test fails
- Hardcoded secrets found
- Blast radius exceeds safe threshold without justification
- New HIGH-risk symbols with zero test coverage

## Example Session

### Input

```
"evaluate the feature branch for the new rate limiter"
```

### Tool Calls

**Step 1 — Test plan:**
```
mcp_milens_test_plan({name: "RateLimiter", repo: "/home/user/project"})
```

**Output:**
```
Test Plan for RateLimiter:
  Mock strategy: stub Redis client, stub clock
  Tests:
    1. allows requests within limit
    2. blocks requests exceeding limit
    3. resets counter after window expires
    4. handles Redis connection failure gracefully
  Affected: src/__tests__/middleware.test.ts (new)
```

**Step 2 — Implement** rate limiter class and tests.

**Step 3 — Detect changes:**
```
mcp_milens_detect_changes({repo: "/home/user/project"})
```

**Output:**
```
Changed files:
  src/middleware/rateLimiter.ts        [new]
  src/__tests__/middleware.test.ts     [new]
  src/middleware/index.ts              [modified]  — barrel export
```

3 files — all expected.

**Step 4 — Review risk:**
```
mcp_milens_review_pr({repo: "/home/user/project"})
```

**Output:**
```
Affected symbols:
  RateLimiter        [class]   MEDIUM — 2 callers, 4 tests
  applyRateLimit     [function] LOW    — 0 callers (internal helper)

No CRITICAL findings. 1 LOW suggestion: add JSDoc to RateLimiter class.
```

**Step 5 — Test impact:**
```
mcp_milens_test_impact({repo: "/home/user/project"})
```

**Output:**
```
Affected test files:
  src/__tests__/middleware.test.ts (new)
```

Run tests: `npm test -- middleware.test.ts` — all 4 pass.

**Step 6 — Coverage gaps:**
```
mcp_milens_test_coverage_gaps({repo: "/home/user/project", limit: 20})
```

**Output:** No new HIGH-risk symbols introduced. 3 pre-existing LOW/medium gaps unrelated to this change.

**Step 7 — Verdict: PASSED.**

## Best Practices

1. **Test plan before code, not after.** Step 1 exists to prevent "I'll test it later." Write the plan, review it, then implement.
2. **detect_changes is your safety net.** If it shows a `package-lock.json` change you didn't intend, something went wrong. Investigate every unexpected file.
3. **Treat CRITICAL review findings as blockers.** Don't rationalize them away. A CRITICAL finding means the change introduces significant risk.
4. **Coverage gaps are relative to the change.** Don't fail the gate because of pre-existing gaps. Fail only if the change itself introduces new uncovered critical symbols.
5. **Conditional passes need a deadline.** If you issue a "Conditional Pass," document exactly what must be fixed and by when. An open-ended conditional is a failed gate in disguise.

## Quality Gate

| Criteria | Pass | Fail |
|---|---|---|
| Test plan exists | Test plan generated with ≥3 scenarios | No test plan or < 3 scenarios |
| Change scope | `detect_changes` shows only expected files | Unexpected files in diff (unless harmless) |
| Review risk | No CRITICAL findings | Unresolved CRITICAL findings |
| Test execution | All `test_impact` files pass | Any test file fails |
| Coverage gaps | No new HIGH-risk symbols without tests | New HIGH-risk symbol has 0 test coverage |
| Gate verdict | PASSED or CONDITIONAL PASS (with documented remediation) | FAILED — must fix and re-run evaluation |
