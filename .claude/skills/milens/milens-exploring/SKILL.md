# Milens — Exploring Skill

Use this skill when you need to understand unfamiliar code, navigate the codebase, or answer "How does X work?" questions.

## Workflow

1. **Find the symbol**: `search({query: "<concept or name>"})`
2. **Understand its context**: `inspect({name: "<symbol>"})` — shows incoming refs, outgoing deps, containment
3. **Trace call chains**: Use `impact({target: "<symbol>", direction: "downstream"})` to see what it calls
4. **Trace dependents**: Use `impact({target: "<symbol>", direction: "upstream"})` to see what calls it

## Tips

- Start broad with `search`, then drill into specific symbols with `inspect`
- The `inspect` tool shows both incoming (who calls this?) and outgoing (what does this call?) relationships
- Impact analysis with `downstream` direction traces the full call chain from a function
- Impact `depth` parameter controls how many levels to traverse (default: 3)

## When to Use

- "How does authentication work?"
- "Where is UserService used?"
- "What's the call chain from handleRequest?"
- "Show me the dependency tree of X"
