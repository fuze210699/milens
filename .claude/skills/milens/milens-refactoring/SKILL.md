# Milens — Refactoring Skill

Use this skill when planning safe refactors — renaming, extracting, splitting, or restructuring code.

## Pre-Refactor Checklist

1. **Inspect the target**: `inspect({name: "<symbol>"})` — understand all relationships
2. **Check blast radius**: `impact({target: "<symbol>", direction: "upstream"})` — find all dependents
3. **Plan updates**: All depth-1 symbols (direct callers/importers) **must** be updated
4. **Warn the user** if blast radius is large

## Rename Workflow

1. `inspect({name: "oldName"})` — list all references
2. `impact({target: "oldName", direction: "upstream"})` — find all callers
3. Rename the symbol and update all depth-1 dependents
4. Re-index: `npx tsx src/cli.ts analyze -p . --force`
5. Verify: `inspect({name: "newName"})` — confirm all links resolve

## Extract/Split Workflow

1. `inspect({name: "target"})` — see all incoming/outgoing refs
2. `impact({target: "target", direction: "upstream"})` — find all external callers
3. Extract the code, keeping the public API if there are many upstream dependents
4. Update imports in all affected files
5. Re-index and verify

## After Any Refactor

- Re-index: `npx tsx src/cli.ts analyze -p . --force`
- Run tests: `npm test`
- Type check: `npx tsc --noEmit`

## When to Use

- "Rename UserService to AccountService"
- "Extract the validation logic into its own module"
- "Split this large file into smaller ones"
- "Move this function to a different module"
