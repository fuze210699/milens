---
name: milens-architect
description: Architecture Analysis — domains, routes, coupling, class hierarchy, and refactoring suggestions with scorecard
---

# milens-architect — Architecture Analysis

Analyze the architecture of the codebase: domain clusters, API routes, execution traces, class hierarchies, coupling hotspots, and produce a structured scorecard with refactoring suggestions.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_codebase_summary` | High-level project overview |
| `mcp_milens_domains` | Module clusters with cohesion scores |
| `mcp_milens_routes` | API endpoints inventory |
| `mcp_milens_get_type_hierarchy` | Class/interface inheritance trees |
| `mcp_milens_trace` | Execution flow from entrypoints |
| `mcp_milens_explain_relationship` | Shortest path between two symbols |
| `mcp_milens_find_dead_code` | Unused exported symbols |
| `mcp_milens_review_symbol` | Deep-dive single symbol risk |
| `mcp_milens_impact` | Blast radius analysis |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Codebase Overview

Get a high-level picture of the codebase structure.

```
mcp_milens_codebase_summary({repo: "<workspaceRoot>"})
```

### Step 2: Domain Map

Identify logical module groupings and cohesion.

```
mcp_milens_domains({repo: "<workspaceRoot>"})
```

For each domain with > 5 files, note: file count, symbol count, and description.

### Step 3: Route Inventory

Map all API endpoints to handler functions.

```
mcp_milens_routes({repo: "<workspaceRoot>"})
```

Document: HTTP method, path, handler symbol, and domain.

### Step 4: Class Hierarchy

For each key class/interface in the codebase, trace inheritance chains.

```
mcp_milens_get_type_hierarchy({name: "<BaseClass>", repo: "<workspaceRoot>"})
```

### Step 5: Execution Traces

Trace critical execution paths from entrypoints.

```
mcp_milens_trace({name: "<entrypoint>", direction: "from", repo: "<workspaceRoot>"})
```

### Step 6: Coupling Analysis

For the top 5 hub symbols, analyze inter-domain coupling:

```
mcp_milens_impact({target: "<hubSymbol>", depth: 3, repo: "<workspaceRoot>"})
```

```
mcp_milens_explain_relationship({from: "<domain-a>", to: "<domain-b>", repo: "<workspaceRoot>"})
```

### Step 7: Dead Code Detection

Find unused symbols that may indicate architectural drift.

```
mcp_milens_find_dead_code({limit: 30, repo: "<workspaceRoot>"})
```

### Step 8: Architecture Scorecard

Produce a structured scorecard:

| Dimension | Score (1-10) | Notes |
|---|---|---|
| Domain Cohesion | | |
| Inter-domain Coupling | | |
| Route Coverage | | |
| Entry Point Clarity | | |
| Inheritance Depth | | |
| Dead Code Ratio | | |

List top 3 refactoring suggestions with risk levels and effort estimates.

## Quality Gate

### PASS if:
- [x] All domains documented with file/symbol counts
- [x] All API routes mapped to handlers
- [x] At least 5 class hierarchies traced
- [x] At least 3 execution traces analyzed
- [x] Coupling hotspots identified
- [x] Architecture scorecard completed with scores
- [x] Top 3 refactoring suggestions documented with risk levels

### FAIL if:
- [ ] Any step skipped without documented reason
- [ ] Scorecard incomplete or scored without evidence
- [ ] Refactoring suggestions lack risk assessment

## Never Skip

1. Always run `mcp_milens_codebase_summary` first — it provides the scaffolding for all other steps
2. Never skip coupling analysis — it's the most critical architecture insight
3. Always include risk levels and effort estimates in refactoring suggestions
4. Cross-reference findings with `mcp_milens_review_symbol` for CRITICAL hubs
