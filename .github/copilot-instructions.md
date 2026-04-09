<!-- milens:start -->
# Milens — Code Intelligence (MCP)

This project is indexed by milens (152 symbols, 233 links, 27 files). Use the milens MCP tools (`mcp_milens_*`) to understand code, assess impact, and navigate safely.

> **CRITICAL:** All milens MCP tool calls MUST include `repo: "/Users/mac10/Documents/Own/milens"` — without it, the tools will fail with "No index" error.

> If any milens tool warns the index is stale, run `npx milens analyze -p . --force` in the project root.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `mcp_milens_impact({target: "symbolName", repo: "/Users/mac10/Documents/Own/milens"})` and report the blast radius to the user.
- **MUST run `mcp_milens_detect_changes({repo: "/Users/mac10/Documents/Own/milens"})` before committing** to verify changes only affect expected symbols.
- **MUST warn the user** if impact analysis shows many upstream dependents before proceeding with edits.
- When exploring unfamiliar code, use `mcp_milens_query` to find symbol definitions and `mcp_milens_grep` for all text references.
- When you need full context on a specific symbol — callers, callees, parent, children — use `mcp_milens_context({name: "symbolName", repo: "/Users/mac10/Documents/Own/milens"})`.

## When Debugging

1. `mcp_milens_query({query: "<error or symptom>", repo: "/Users/mac10/Documents/Own/milens"})` — find symbols related to the issue
2. `mcp_milens_context({name: "<suspect function>", repo: "/Users/mac10/Documents/Own/milens"})` — see all callers, callees, and hierarchy
3. `mcp_milens_grep({pattern: "<error message>", repo: "/Users/mac10/Documents/Own/milens"})` — find every text occurrence across all files
4. `mcp_milens_explain_relationship({from: "A", to: "B", repo: "/Users/mac10/Documents/Own/milens"})` — trace how two symbols connect

## When Refactoring

- **Before editing**: MUST run `mcp_milens_context` to see all incoming/outgoing refs, then `mcp_milens_impact` to find all upstream dependents.
- **When deleting features**: MUST use `mcp_milens_grep` first to find ALL text references (templates, configs, routes, docs), then `mcp_milens_impact` for the dependency graph. Combine both — `grep` catches what `impact` misses.
- **After any refactor**: run `mcp_milens_detect_changes({repo: "/Users/mac10/Documents/Own/milens"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `mcp_milens_impact` on it.
- NEVER ignore warnings when impact analysis shows many upstream dependents.
- NEVER delete or rename symbols without running both `mcp_milens_grep` and `mcp_milens_impact`.
- NEVER commit changes without running `mcp_milens_detect_changes()` to check affected scope.
- NEVER call milens MCP tools without the `repo` parameter.

## Tools Quick Reference

| Tool | When to use | Example |
|------|-------------|---------|
| `mcp_milens_query` | Find symbols by name/concept | `mcp_milens_query({query: "auth validation", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_context` | 360° view of one symbol | `mcp_milens_context({name: "UserService", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_impact` | Blast radius before editing | `mcp_milens_impact({target: "X", direction: "upstream", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_grep` | Text search ALL files (templates, SCSS, configs) | `mcp_milens_grep({pattern: "route name", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_detect_changes` | Pre-commit scope check | `mcp_milens_detect_changes({repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_explain_relationship` | How two symbols connect | `mcp_milens_explain_relationship({from: "A", to: "B", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_get_file_symbols` | All symbols in a file | `mcp_milens_get_file_symbols({file: "path/to/file", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_get_type_hierarchy` | Class inheritance tree | `mcp_milens_get_type_hierarchy({name: "ClassName", repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_find_dead_code` | Unused exported symbols | `mcp_milens_find_dead_code({repo: "/Users/mac10/Documents/Own/milens"})` |
| `mcp_milens_status` | Check index health | `mcp_milens_status({repo: "/Users/mac10/Documents/Own/milens"})` |

## `query` vs `grep` — When to Use Which

| Scenario | Use `query` | Use `grep` |
|----------|-------------|------------|
| Find function/class definitions | ✅ | |
| Find references in templates/views | | ✅ |
| Find route definitions in configs | | ✅ |
| Find text in comments/docs | | ✅ |
| Find symbol by concept/name | ✅ | |
| Find every text occurrence | | ✅ |
| Deleting a feature | ✅ + ✅ | ✅ + ✅ |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `mcp_milens_impact` was run for all modified symbols
2. No warnings about many upstream dependents were ignored
3. `mcp_milens_detect_changes()` confirms changes match expected scope
4. All direct dependents (d=1) were updated

## Keeping the Index Fresh

After significant code changes, re-index:

```bash
npx milens analyze -p . --force
```

## Skills

| Task | Read this skill file |
|------|---------------------|
| General milens tools reference | `.agents/skills/milens/SKILL.md` |
| Work in the Analyzer area | `.agents/skills/analyzer/SKILL.md` |
| Work in the Root area | `.agents/skills/root/SKILL.md` |
| Work in the Parser area | `.agents/skills/parser/SKILL.md` |
| Work in the Server area | `.agents/skills/server/SKILL.md` |
| Work in the Store area | `.agents/skills/store/SKILL.md` |
| Work in the Test area | `.agents/skills/test/SKILL.md` |

<!-- milens:end -->
