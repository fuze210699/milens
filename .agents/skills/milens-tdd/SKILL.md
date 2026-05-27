---
name: milens-tdd
description: Test-Driven Development with Code Intelligence — find gaps, generate test plans, implement, and verify
---

# milens-tdd — Test-Driven Development with Code Intelligence

Identify untested symbols ranked by risk, generate targeted test strategies, implement tests, and verify coverage.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_test_coverage_gaps` | Find untested symbols sorted by risk |
| `mcp_milens_test_plan` | Generate mock strategy and test scenarios for a symbol |
| `mcp_milens_test_impact` | Identify affected test files after changes |
| `mcp_milens_review_pr` | Post-change quality check for CRITICAL issues |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Identify Untested Symbols

Start by finding symbols with no test coverage, sorted by risk (hotspots first).

```
mcp_milens_test_coverage_gaps({repo: "<workspaceRoot>", limit: 10})
```

Review the output:
- **HIGH risk symbols** — complex logic, high fan-in, many dependents. Prioritize these.
- **MEDIUM risk symbols** — moderate complexity, some dependents.
- **LOW risk symbols** — simple getters, one-liners. Lowest priority.

### Step 2: Generate Test Plans

For each high-risk symbol identified in Step 1, request a test plan.

```
mcp_milens_test_plan({name: "<symbolName>", repo: "<workspaceRoot>"})
```

The test plan provides:
- **Mock strategy** — what to stub, what to isolate
- **3+ test scenarios** — happy path, edge cases, error states
- **Setup requirements** — dependencies to initialize
- **Expected assertions** — what each test should verify

### Step 3: Implement Tests

Write test files based on the test plan output:

1. Check if test files already exist for the module
2. Follow existing test patterns in the codebase (frameworks, conventions, helper utilities)
3. Implement each test scenario from the plan
4. Keep tests focused — one behavior per test

### Step 4: Verify Test Impact

After writing tests, confirm which test files changed and should run.

```
mcp_milens_test_impact({repo: "<workspaceRoot>"})
```

This lists all test files affected by the current changes. Run those tests to validate.

### Step 5: Quality Check

Run the PR review to catch any CRITICAL issues before committing.

```
mcp_milens_review_pr({repo: "<workspaceRoot>"})
```

Address any CRITICAL or HIGH findings before completing the cycle.

## Example Session

### Input

```
"add tests for the resolveLinks function"
```

### Tool Calls

**Step 1 — Find gaps:**
```
mcp_milens_test_coverage_gaps({repo: "/home/user/project", limit: 10})
```

**Output:**
```
Coverage Gaps (untested exported symbols):
1. resolveLinks [function] — HIGH risk (12 dependents, 8 callers)
2. parseConfig [function] — MEDIUM risk (5 dependents)
3. formatOutput [function] — LOW risk (1 dependent)
...
```

**Step 2 — Test plan for high-risk:**
```
mcp_milens_test_plan({name: "resolveLinks", repo: "/home/user/project"})
```

**Output:**
```
Test Plan for resolveLinks:
  Mock strategy: stub loadAliases, stub database queries
  Tests:
    1. resolves direct links between two symbols
    2. handles circular dependency chain gracefully
    3. returns empty array when no links found
    4. throws on malformed symbol data
  Setup: import SymbolLink from '@/types', mock store layer
```

**Step 3 — Implement tests** in `src/__tests__/resolver.test.ts`

**Step 4 — Verify:**
```
mcp_milens_test_impact({repo: "/home/user/project"})
```

**Output:**
```
Affected test files:
  src/__tests__/resolver.test.ts (new)
  src/__tests__/analyzer.test.ts (modified, re-export impact)
```

**Step 5 — Quality:**
```
mcp_milens_review_pr({repo: "/home/user/project"})
```

**Output:** No CRITICAL issues. 2 LOW suggestions.

## Best Practices

1. **Prioritize by risk, not alphabetically.** A HIGH-risk utility with 50 callers matters more than a LOW-risk getter nobody uses.
2. **Don't test implementation details.** Follow the test plan's mock strategy — stub at module boundaries, not internal functions.
3. **One behavior per test.** Each test should verify a single scenario (happy path, edge case, error) with a descriptive name.
4. **Verify before commit.** Always run Step 4 (`test_impact`) and Step 5 (`review_pr`) before merging. Don't skip the quality gate.
5. **Re-check gaps after large refactors.** A refactor can move symbols from "tested" back to "untested."

## Quality Gate

| Criteria | Pass | Fail |
|---|---|---|
| Test coverage gaps | HIGH-risk symbols have tests | HIGH-risk symbols still uncovered after session |
| Test plan adherence | ≥3 scenarios implemented per symbol | Tests don't match plan scenarios |
| Test impact verification | All affected test files pass | Any test file fails |
| PR review | No CRITICAL issues | Unresolved CRITICAL issues remain |
