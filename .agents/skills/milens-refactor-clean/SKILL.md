---
name: milens-refactor-clean
description: Safe Refactoring with Blast Radius Check — find dead code, verify impact, remove safely, and verify test coverage
---

# milens-refactor-clean — Safe Refactoring with Blast Radius Check

Identify dead or unwanted code, verify it's truly unused via context and text search, assess blast radius, remove safely, and confirm only expected files changed.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_find_dead_code` | Find exported symbols with zero incoming references |
| `mcp_milens_context` | Verify a symbol is truly unused (incoming refs check) |
| `mcp_milens_impact` | Blast radius assessment before removal |
| `mcp_milens_grep` | Text search for symbol name in configs, templates, docs |
| `mcp_milens_detect_changes` | Post-refactor verification of changed files |
| `mcp_milens_test_impact` | Identify affected test files to run |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Find Candidates

Identify exported symbols with zero incoming code references.

```
mcp_milens_find_dead_code({repo: "<workspaceRoot>", limit: 30})
```

The output lists symbols that the static analysis graph shows as unreferenced. These are removal candidates.

**Important caveats:**
- Symbols used only via reflection, `eval`, or dynamic imports won't show references
- Side-effect-only imports (e.g., `import "./init"`) may look unused
- Config-based routing (React Router, NestJS decorators) may not resolve to references

### Step 2: Verify Truly Unused

For each candidate, run context to confirm zero incoming references.

```
mcp_milens_context({name: "<symbolName>", repo: "<workspaceRoot>"})
```

Look at the **incoming references** count:
- **0 incoming refs** — likely safe to remove
- **1+ incoming refs** — the symbol is used via paths the dead code detector missed; do NOT remove without further investigation

### Step 3: Check Text References

Even if context shows 0 code references, the symbol may appear in non-code files.

```
mcp_milens_grep({pattern: "<symbolName>", repo: "<workspaceRoot>"})
```

Check for matches in:
- **Config files** — `.json`, `.yaml`, `.toml`, `.env`
- **Template files** — `.html`, `.vue`, `.jsx`, `.tsx` (usage in markup)
- **Documentation** — `*.md`, `*.mdx`
- **Route definitions** — string-based routing (Express, FastAPI)
- **Package scripts** — `package.json` scripts referencing the symbol

### Step 4: Assess Blast Radius

Before deleting, understand what removing the symbol would affect (even if nothing references it now — for safety).

```
mcp_milens_impact({target: "<symbolName>", depth: 3, repo: "<workspaceRoot>"})
```

Check:
- **Depth-1 dependents** — should be 0 for true dead code
- **Transitive dependents** — if > 0, something references this indirectly

### Step 5: Remove the Code

After verification, remove:
1. The symbol itself (function, class, interface, etc.)
2. Its imports if they're now unused
3. Related tests (now orphaned)

### Step 6: Verify Change Scope

Confirm only expected files changed.

```
mcp_milens_detect_changes({repo: "<workspaceRoot>"})
```

Check that:
- Only the files you intended to modify appear
- No config files, lockfiles, or unrelated modules changed
- No accidental deletions

### Step 7: Run Affected Tests

Identify and run tests impacted by the removal.

```
mcp_milens_test_impact({repo: "<workspaceRoot>"})
```

This lists test files that reference the removed code or its dependents. Run all affected tests to ensure nothing is broken.

## Example Session

### Input

```
"remove unused utility functions from the helpers module"
```

### Tool Calls

**Step 1 — Find candidates:**
```
mcp_milens_find_dead_code({repo: "/home/user/project", limit: 30})
```

**Output:**
```
1. formatDateLegacy    [function]  src/utils/helpers.ts:45
2. unusedValidator     [function]  src/utils/helpers.ts:78
3. OldUserType         [interface] src/types/legacy.ts:12
4. debugLog            [function]  src/utils/helpers.ts:102
```

**Step 2 — Verify context for each:**
```
mcp_milens_context({name: "formatDateLegacy", repo: "/home/user/project"})
```

**Output:** 0 incoming refs, 1 outgoing dep (calls `toISOString`). Safe to remove.

```
mcp_milens_context({name: "unusedValidator", repo: "/home/user/project"})
```

**Output:** 0 incoming refs. Safe to remove.

```
mcp_milens_context({name: "debugLog", repo: "/home/user/project"})
```

**Output:** 3 incoming refs — used in `server.ts`, `logger.ts`, `middleware.ts`. NOT dead code — skip.

**Step 3 — Text search for remaining candidates:**
```
mcp_milens_grep({pattern: "formatDateLegacy", repo: "/home/user/project"})
```

**Output:** 1 match in `docs/migration-guide.md` — documentation reference only, still safe to remove with a docs update.

```
mcp_milens_grep({pattern: "OldUserType", repo: "/home/user/project"})
```

**Output:** 0 matches across all files. Fully dead.

**Step 4 — Impact check:**
```
mcp_milens_impact({target: "formatDateLegacy", depth: 3, repo: "/home/user/project"})
```

**Output:** Depth-1: 0 dependents. No blast radius.

**Step 5 — Remove `formatDateLegacy` and `OldUserType`** in file editor

**Step 6 — Verify scope:**
```
mcp_milens_detect_changes({repo: "/home/user/project"})
```

**Output:**
```
Changed files:
  src/utils/helpers.ts    [modified] — expected
  src/types/legacy.ts     [modified] — expected
  docs/migration-guide.md [modified] — expected (updated reference)
```

**Step 7 — Test impact:**
```
mcp_milens_test_impact({repo: "/home/user/project"})
```

**Output:** 2 affected test files — `src/__tests__/helpers.test.ts`, `src/__tests__/types.test.ts`. Both pass after updating.

## Best Practices

1. **Context beats dead-code detection.** A symbol tagged as "dead" by the detector may still be used via dynamic patterns. Always verify with `context` before deleting.
2. **Grep is the backstop.** `context` only catches code-level references. `grep` catches template usage, string-based routing, config files, and docs. Never skip Step 3.
3. **Remove in small batches.** Delete 1-3 symbols per commit. Large-scale deletion makes `detect_changes` harder to verify and `git bisect` harder to use.
4. **Update docs proactively.** If `grep` finds documentation references, update or remove them in the same commit. Stale docs referencing deleted symbols are worse than no docs.
5. **Test impact is not optional.** Removing code can break tests that import the symbol directly. Run `test_impact` and fix before committing.

## Quality Gate

| Criteria | Pass | Fail |
|---|---|---|
| Dead code identified | `find_dead_code` returns candidates | Tool fails or returns empty (with large codebase) |
| Verification complete | `context` + `grep` run for every candidate marked for removal | Any candidate removed without both checks |
| Blast radius safe | All removed symbols have 0 depth-1 dependents | Any symbol with dependents removed without justification |
| Change scope clean | `detect_changes` shows only expected files | Unexpected files in the diff |
| Tests pass | All `test_impact` files pass | Any affected test file fails |
