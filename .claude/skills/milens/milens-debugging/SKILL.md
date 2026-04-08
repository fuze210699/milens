# Milens — Debugging Skill

Use this skill when tracing bugs through the codebase.

## Workflow

1. **Find related code**: `search({query: "<error message or symptom>"})`
2. **Inspect the suspect**: `inspect({name: "<function>"})` — see all callers and callees
3. **Trace upstream**: `impact({target: "<function>", direction: "upstream"})` — find all entry points that reach this code
4. **Trace downstream**: `impact({target: "<function>", direction: "downstream"})` — follow the call chain to see what it triggers
5. **Check if the bug is in a dependency**: Inspect each symbol in the call chain

## Tips

- If a function has unexpected behavior, check its **incoming** links — who's calling it with what?
- Use upstream impact to find all paths that lead to the buggy code
- Use downstream impact to see all side effects of the buggy function
- The `confidence` score in links helps identify uncertain call resolutions (< 0.8 = may be wrong target)

## When to Use

- "Why is X returning null?"
- "Where does this error come from?"
- "Trace the call chain from the API handler to the database"
- "Find all code paths that reach validateUser"
