---
name: milens-debugger
description: Root Cause Analysis — execution trace, blast radius, dependency paths, deep context, and ranked hypotheses with fix suggestions
---

# milens-debugger — Root Cause Analysis

Debug issues by tracing execution flow, analyzing blast radius, exploring dependency paths, and producing ranked root cause hypotheses with fix suggestions and regression risk assessment.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_trace` | Execution flow from entrypoints to target (or reverse) |
| `mcp_milens_context` | 360° symbol view: incoming refs + outgoing deps |
| `mcp_milens_impact` | Blast radius: what breaks if target changes |
| `mcp_milens_explain_relationship` | Shortest path between two symbols |
| `mcp_milens_smart_context` | Intent-aware context for debug intent |
| `mcp_milens_overview` | Combined context + impact + grep in one call |
| `mcp_milens_grep` | Text search across all files (templates, configs, error messages) |
| `mcp_milens_review_symbol` | Deep-dive single symbol risk assessment |
| `mcp_milens_get_type_hierarchy` | Class inheritance chain |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Understand the Target

Get deep context on the problematic symbol.

```
mcp_milens_smart_context({name: "<targetSymbol>", intent: "debug", repo: "<workspaceRoot>"})
```

This returns execution paths, data flow, dependencies, and test coverage in one call.

### Step 2: Trace Execution

Map how code reaches the target from entrypoints.

```
mcp_milens_trace({name: "<targetSymbol>", direction: "to", repo: "<workspaceRoot>"})
```

For downstream impact, trace forward:

```
mcp_milens_trace({name: "<targetSymbol>", direction: "from", repo: "<workspaceRoot>"})
```

### Step 3: Blast Radius

Understand what breaks if the target is modified.

```
mcp_milens_impact({target: "<targetSymbol>", depth: 3, repo: "<workspaceRoot>"})
```

Pay special attention to depth-1 dependents — these WILL break.

### Step 4: Dependency Paths

For each suspect dependency, trace the exact connection path.

```
mcp_milens_explain_relationship({from: "<suspect>", to: "<targetSymbol>", repo: "<workspaceRoot>"})
```

### Step 5: Full Context View

Get a 360° view of the target and its immediate neighbors.

```
mcp_milens_context({name: "<targetSymbol>", repo: "<workspaceRoot>"})
```

Check both incoming (who calls this) and outgoing (what this calls).

### Step 6: Text Search for Clues

Search for error messages, TODOs, or related patterns.

```
mcp_milens_grep({pattern: "<errorMessage or keyword>", repo: "<workspaceRoot>"})
```

Use `include` to narrow scope (e.g., `"**/*.ts"`, `"**/*.md"`).

### Step 7: Class Hierarchy

If the target is a class, check its inheritance chain.

```
mcp_milens_get_type_hierarchy({name: "<ClassName>", repo: "<workspaceRoot>"})
```

### Step 8: Risk Assessment

Deep-dive the target's risk profile.

```
mcp_milens_review_symbol({name: "<targetSymbol>", repo: "<workspaceRoot>"})
```

### Step 9: Root Cause Hypotheses

Rank hypotheses by likelihood:

| # | Hypothesis | Evidence | Confidence | Suggested Fix | Regression Risk |
|---|---|---|---|---|---|
| 1 | | | HIGH/MEDIUM/LOW | | |
| 2 | | | | | |
| 3 | | | | | |

Each hypothesis MUST cite specific tools and their output as evidence.

## Quality Gate

### PASS if:
- [x] Execution trace complete (both directions)
- [x] Blast radius analyzed to depth 3
- [x] At least 3 dependency paths traced
- [x] Full 360° context captured
- [x] Text search performed for error messages/keywords
- [x] At least 3 ranked hypotheses with evidence citations
- [x] Fix suggestions include regression risk assessment

### FAIL if:
- [ ] Any step skipped without documented reason
- [ ] Hypotheses lack tool evidence citations
- [ ] Fix suggestions have no regression risk assessment
- [ ] Only one hypothesis considered (lack of thoroughness)

## Never Skip

1. Always run `mcp_milens_smart_context` first — it is the most efficient starting point for debugging
2. Never skip blast radius analysis — a fix that introduces new breakage is not a fix
3. Always cite specific tool outputs as evidence for each hypothesis
4. Always include regression risk in fix suggestions
5. If dead code is suspected, run `mcp_milens_find_dead_code` to check for unused symbols in the trace path
