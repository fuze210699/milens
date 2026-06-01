# PR Review (`review_pr`)

Score every changed symbol by blast radius, test coverage, and role. Used for pre-commit safety checks and PR risk assessment.

## Quick Usage

```bash
# Via MCP (pre-commit)
milens_review_pr({repo: "<workspaceRoot>"})          # uncommitted changes

# Via MCP (PR review)
milens_review_pr({ref: "main", repo: "..."})         # diff vs main branch
```

## Symbol-Level Diff

Unlike git diff which shows file-level changes, `review_pr` performs **symbol-level** comparison:

```
git diff → file changed → but WHICH symbols in the file?
                ↓
review_pr: git show <old>:<file> + git show <new>:<file>
           → extract symbol names from both versions
           → diff: added ∪ removed = actually changed symbols
           → score only those
```

This eliminates the "all symbols in a changed file" false-positive problem. **100% precision** in historical mode, **95%** in working tree mode.

## Cross-File Impact Tracking

When a high-risk symbol changes, `review_pr` traces its downstream callers:

```
analyze() changed (CRITICAL)
  ├── resolve()          ← flagged: impacted by analyze()
  ├── generateAgentsMd()  ← flagged: calls analyze()
  └── startStdio()        ← flagged: MCP server uses analyze()
```

Depth: 2 levels of upstream dependents.

## Risk Score Formula

| Component | Weight | Details |
|-----------|:------:|---------|
| Heat | 0.3× | How central the symbol is (0-100) |
| Dependents | 3× | Per direct dependent |
| Hub penalty | +10 | High fan-in + fan-out |
| Entrypoint penalty | +5 | Public entry point |
| No test | ×1.5 | Exported + untested |
| Internal reduction | ×0.4 | Non-exported, ≤1 deps |
| Internal reduction | ×0.65 | Non-exported, ≤3 deps |
| Zero deps internal | →0 | Implementation detail |

## Risk Levels

| Level | Score | Meaning |
|-------|:-----:|---------|
| **CRITICAL** | ≥50 or hub+untested+>10 deps | Must review before merge |
| **HIGH** | ≥30 | Review strongly recommended |
| **MEDIUM** | ≥10 | Review suggested |
| **LOW** | <10 | Low risk |

## What Gets Filtered

| Filter | Reason |
|--------|--------|
| Test files (`*.test.ts`, `test/`) | Test changes ≠ production risk |
| Fixture files (`test/fixtures/`) | Test data ≠ code risk |
| Non-source paths | Only `src/` files are scored |
| Non-exported internals (0 deps) | Implementation details → LOW |

## Integration Points

| Consumer | How it uses review_pr |
|----------|----------------------|
| **MCP tool** `review_pr` | `reviewPr(db, root, ref)` |
| **Orchestrator** `run()` | Part of full orchestration cycle |
| **Hooks** `onSessionEnd` | Auto-review when agent finishes |
| **Hooks** `onPreCommit` | Pre-commit safety gate |
