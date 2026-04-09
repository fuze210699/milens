# Milens — Agent Instructions

This project is indexed by **milens** (code intelligence engine). Use milens MCP tools to understand code before modifying it.

> If milens tools return errors, re-index first: `npx tsx src/cli.ts analyze -p . --force`

## Always Do

- **Run `context` before editing any symbol.** Before modifying a function, class, or method, run `context({name: "symbolName"})` to see all incoming/outgoing relationships.
- **Run `impact` before risky changes.** Use `impact({target: "symbolName", direction: "upstream"})` to find what depends on the symbol.
- **Warn the user** if impact analysis shows many upstream dependents (depth 1 = will break).
- When exploring unfamiliar code, use `query` for symbol definitions plus `grep` for ALL text references.
- **Run `grep` before deleting features or renaming.** `grep({pattern: "featureName"})` finds references in templates, SCSS, configs, routes, and docs that `impact` cannot see.
- Use `detect_changes` after git operations to see which symbols are affected.

## When Debugging

1. `query({query: "<error or symptom>"})` — find related symbols
2. `context({name: "<suspect function>"})` — see all callers, callees, and containment
3. Trace upstream: `impact({target: "<function>", direction: "upstream"})` — find what calls it
4. Trace downstream: `impact({target: "<function>", direction: "downstream"})` — find what it calls
5. `explain_relationship({from: "A", to: "B"})` — trace path between two symbols
6. `find_dead_code({kind: "function"})` — find potentially unused exports

## When Refactoring

- **Before renaming**: run `grep` to find ALL text references, then `impact` for symbol graph blast radius
- **Before deleting a feature**: run `grep` first (templates, configs, routes, docs), then `impact` for code deps. Combine both — `grep` catches what `impact` misses.
- **Before extracting/splitting**: run `context` on the target to see all incoming refs, then check upstream impact
- **Check hierarchy**: run `get_type_hierarchy` on classes before modifying inheritance
- **After any refactor**: re-index with `npx tsx src/cli.ts analyze -p . --force`

## Never Do

- NEVER modify a widely-used function without first running `impact` on it
- NEVER ignore symbols with many depth-1 upstream dependents
- NEVER skip re-indexing after significant refactors

## Tools Quick Reference

| Tool | When to use | Example |
|------|-------------|---------|
| `query` | Find symbol definitions by name/concept | `query({query: "auth validation"})` |
| `grep` | Find ALL text references (templates, SCSS, configs, docs) | `grep({pattern: "pencil"})` |
| `context` | Full context of one symbol | `context({name: "AuthService"})` |
| `impact` | Blast radius in symbol graph before editing | `impact({target: "createUser", direction: "upstream"})` |
| `status` | Check index stats | `status()` |
| `detect_changes` | See affected symbols after git changes | `detect_changes({ref: "HEAD"})` |
| `explain_relationship` | Trace connection between symbols | `explain_relationship({from: "A", to: "B"})` |
| `find_dead_code` | Find unreferenced exports | `find_dead_code({kind: "function"})` |
| `get_file_symbols` | List all symbols in a file | `get_file_symbols({file: "src/foo.ts"})` |
| `get_type_hierarchy` | Show inheritance tree | `get_type_hierarchy({name: "MyClass"})` |

## Impact Depth Guide

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | Must update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if on critical path |

## Keeping the Index Fresh

After modifying code, re-index:

```bash
npx tsx src/cli.ts analyze -p .
# Or force full re-index:
npx tsx src/cli.ts analyze -p . --force
# Generate skill files for editors:
npx tsx src/cli.ts analyze -p . --skills
```

## Project Structure

| Component | Path | Purpose |
|-----------|------|---------|
| Parser | `src/parser/` | Declarative LangSpec configs + universal extractor |
| Analyzer | `src/analyzer/` | Pipeline: scan → parse → resolve → persist |
| Storage | `src/store/` | SQLite with FTS5, recursive CTEs |
| MCP Server | `src/server/` | stdio + StreamableHTTP transports |
| CLI | `src/cli.ts` | analyze, search, inspect, impact, serve, status, list, clean |
| Skills | `src/skills.ts` | Generate editor skill files from knowledge graph |
| Tests | `test/` | vitest — extractor, database, scanner, resolver |

## Dev Commands

```bash
npm run build          # tsc → dist/
npm test               # vitest run
npm run self-analyze   # index this codebase
npx tsc --noEmit       # type check
```
