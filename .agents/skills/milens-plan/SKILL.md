---
name: milens-plan
description: Implementation Planning — research codebase, analyze impact, plan tests, and produce a structured implementation plan
---

# milens-plan — Implementation Planning

Research the codebase end-to-end before writing code: understand structure, trace execution, assess blast radius, plan tests, and produce a structured plan following the ECC Planner specification.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_codebase_summary` | High-level project overview (languages, file count, domain count) |
| `mcp_milens_domains` | Module clusters showing logical groupings |
| `mcp_milens_routes` | API endpoints inventory with handler mappings |
| `mcp_milens_smart_context` | Intent-aware symbol analysis (edit intent) |
| `mcp_milens_edit_check` | Pre-edit safety: callers, export status, re-export chains, warnings |
| `mcp_milens_trace` | Execution flow from entrypoints to target |
| `mcp_milens_impact` | Blast radius: what breaks if target changes |
| `mcp_milens_test_plan` | Mock strategy + test scenarios for a symbol |
| `mcp_milens_test_coverage_gaps` | Related untested symbols |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Project Overview

Understand the codebase at a high level.

```
mcp_milens_codebase_summary({repo: "<workspaceRoot>"})
```

Captures: languages, file counts, total symbols, top-level domains, entry points.

### Step 2: Domain Structure

Map module clusters to understand logical groupings.

```
mcp_milens_domains({repo: "<workspaceRoot>"})
```

Shows which files form cohesive modules based on the dependency graph. Helps identify:
- Where the target code lives
- Which domains interact with it
- Natural boundaries for the change

### Step 3: API Surface (optional)

If the project is a web service, inventory the endpoints.

```
mcp_milens_routes({repo: "<workspaceRoot>"})
```

Useful when the change touches:
- Route handlers
- Middleware
- Request/response types
- Authentication/authorization

### Step 4: Target Analysis

Zoom in on the specific symbol to change.

```
mcp_milens_smart_context({name: "<symbolName>", intent: "edit", repo: "<workspaceRoot>"})
```

The `edit` intent returns: callers, export status, and immediate blast radius — only what matters for editing.

### Step 5: Pre-Edit Safety Check

Run `edit_check` for pre-edit warnings.

```
mcp_milens_edit_check({name: "<symbolName>", repo: "<workspaceRoot>"})
```

This returns:
- **Callers** — who calls this symbol
- **Export status** — whether it's public API
- **Re-export chains** — barrel file re-exports that extend blast radius
- **Warnings** — breaking change risks, high fan-in, etc.

### Step 6: Execution Flow

Trace how the target gets called at runtime.

```
mcp_milens_trace({name: "<symbolName>", direction: "to", repo: "<workspaceRoot>"})
```

Shows the call chains from entrypoints down to this symbol. Critical for understanding:
- What triggers this code
- What data flows into it
- What side effects it may have

### Step 7: Blast Radius

Assess the full impact of the proposed change.

```
mcp_milens_impact({target: "<symbolName>", depth: 3, repo: "<workspaceRoot>"})
```

Shows all symbols that break if the target changes, up to the specified depth.
- If depth-1 dependents > 5: **STOP and warn** before proceeding
- If depth-3 dependents > 20: **consider a facade or adapter pattern**

### Step 8: Test Strategy

Plan the testing approach.

```
mcp_milens_test_plan({name: "<symbolName>", repo: "<workspaceRoot>"})
```

Covers:
- Mock strategy (what to isolate)
- Test scenarios (happy path, edge cases, error handling)
- Affected test files

### Step 9: Coverage Gaps (optional)

Check for related symbols that lack test coverage.

```
mcp_milens_test_coverage_gaps({repo: "<workspaceRoot>", limit: 10})
```

If neighboring symbols are untested, consider adding tests as part of the change.

### Step 10: Produce Implementation Plan

Consolidate all findings into a structured plan:

1. **Executive Summary** — what changes, why, at what risk level
2. **Codebase Context** — domains, routes, and structure (from Steps 1-3)
3. **Symbol Analysis** — target details, callers, execution flow (from Steps 4-6)
4. **Impact Assessment** — blast radius, breaking change risks, dependents map (from Step 7)
5. **Test Strategy** — test plan, mock strategy, coverage gaps (from Steps 8-9)
6. **Implementation Steps** — ordered, actionable steps with file paths
7. **Risk Mitigation** — rollback plan, feature flags, phased deployment options

## Example Session

### Input

```
"plan a change to add rate limiting to the login handler"
```

### Tool Calls

**Step 1:**
```
mcp_milens_codebase_summary({repo: "/home/user/project"})
```

**Output:** TypeScript project, 120 files, 850 symbols, 5 domains (auth, routes, db, utils, config).

**Step 2:**
```
mcp_milens_domains({repo: "/home/user/project"})
```

**Output:** `auth` domain contains login handler, token manager, session store.

**Step 4:**
```
mcp_milens_smart_context({name: "loginHandler", intent: "edit", repo: "/home/user/project"})
```

**Output:** 3 callers (Express route, rate limiter middleware, integration test), no re-exports.

**Step 5:**
```
mcp_milens_edit_check({name: "loginHandler", repo: "/home/user/project"})
```

**Output:** 3 callers, exported, no re-export chains, **WARNING: exported function — changing signature is a breaking change.**

**Step 6:**
```
mcp_milens_trace({name: "loginHandler", direction: "to", repo: "/home/user/project"})
```

**Output:** Chain: `Express router → authMiddleware → loginHandler → tokenService.sign()`

**Step 7:**
```
mcp_milens_impact({target: "loginHandler", depth: 3, repo: "/home/user/project"})
```

**Output:** Depth-1: 3 dependents (route, integration test, auth docs). Depth-2: 8 dependents. Depth-3: 14 dependents. **No STOP threshold breached.**

**Step 8:**
```
mcp_milens_test_plan({name: "loginHandler", repo: "/home/user/project"})
```

**Output:** Mock `tokenService`, `userStore`. 4 test scenarios: valid login, invalid password, rate limit exceeded, database failure.

**Step 10 — Plan produced** (see plan format above).

## Best Practices

1. **Never skip impact analysis.** Even a "small" change can ripple through re-export chains. `impact` catches what intuition misses.
2. **Use `edit` intent for `smart_context`** when planning edits — it omits irrelevant detail and focuses on callers and blast radius.
3. **Stop at depth-3 for impact.** Deeper assessment rarely changes the implementation strategy but adds noise.
4. **Trace before planning.** Understanding the execution path prevents "add rate limiter after JWT decode" mistakes where ordering matters.
5. **Write the plan before the code.** The structured plan from Step 10 is the deliverable. Implementation follows the plan — not the other way around.

## Quality Gate

| Criteria | Pass | Fail |
|---|---|---|
| Codebase overview | All 3 overview tools succeed (summary, domains, routes) | Any tool fails or returns empty |
| Target analysis | `smart_context` + `edit_check` both run | Either tool skipped for the target symbol |
| Impact assessment | `impact` at depth 3 completed, dependents counted | Impact not run or depth < 3 |
| Blast radius check | < 5 depth-1 dependents OR user warned and confirmed | > 5 depth-1 dependents without user confirmation |
| Test plan | `test_plan` covers happy path, edge cases, and errors | Less than 3 scenarios in the plan |
| Implementation plan | All 7 sections of the plan filled | Missing sections or incomplete analysis |
