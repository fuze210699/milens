# Milens — Impact Analysis Skill

Use this skill before making changes to understand what will break.

## Workflow

1. **Check upstream impact**: `impact({target: "<symbol>", direction: "upstream"})` — who depends on this?
2. **Review depth levels**:
   - Depth 1: Direct callers — **WILL BREAK**. Must update these.
   - Depth 2: Indirect dependents — likely affected. Should test.
   - Depth 3: Transitive — may need testing on critical paths.
3. **Get full context**: `inspect({name: "<symbol>"})` — see all incoming/outgoing links
4. **Warn the user** if there are many depth-1 dependents before proceeding

## Risk Assessment

| Upstream Count (d=1) | Risk | Action |
|---------------------|------|--------|
| 0 | None | Safe to change freely |
| 1–3 | Low | Update callers |
| 4–10 | Medium | Plan updates, run tests |
| 10+ | High | Warn user, consider alternatives |

## When to Use

- "What breaks if I change createUser?"
- "Is it safe to rename this function?"
- "What's the blast radius of modifying AuthService?"
- Before any refactoring or API changes
