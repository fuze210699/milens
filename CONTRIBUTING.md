# Contributing to Milens

Welcome! Milens is an open-source AI-DOS platform — a complete operating system for AI-driven development.

## Ways to Contribute

| Type | How | Where |
|---|---|---|
| **Skill files** | Create reusable agent workflows | `.agents/skills/` |
| **Security rules** | Add new vulnerability patterns | `src/security/rules.ts` |
| **Adapter packs** | Connect milens to new harnesses | `adapters/` |
| **Core features** | Improve tools, parser, analyzer | `src/` |
| **Documentation** | Fix docs, add examples | `docs/` |
| **Bug reports** | Report issues with reproduction | [Issues](https://github.com/fuze210699/milens/issues) |

## Development Setup

```bash
git clone https://github.com/fuze210699/milens.git
cd milens
npm install
npm run build
npm test
```

## Skill File Format

Skills are markdown files under `.agents/skills/milens-{name}/SKILL.md`.

```markdown
# milens-{name}

> One-line description

## Tools Required
- `tool1()` — description
- `tool2()` — description

## Workflow

### Step 1: Name
Call `tool1({...})` → expected output

### Step 2: Name
Call `tool2({...})` → expected output

## Example Session
\`\`\`
[Real tool calls with inputs/outputs]
\`\`\`

## Best Practices
- Tip 1
- Tip 2

## Quality Gate
- [ ] All tool calls succeed
- [ ] Output matches expected format
```

## Security Rule Format

Rules are TypeScript objects in `src/security/rules.ts`:

```typescript
{
  id: 'SEC-XXX',
  category: 'secrets' | 'injection' | ...,
  owasp: 'A02:2021',
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  name: 'Descriptive name',
  description: 'What this detects and why it matters',
  patterns: [/regex1/g, /regex2/g],
  fileGlob: '**/*.{ts,js}',
  fix: 'How to fix this issue',
  confidence: 0.85,
  enabled: true,
}
```

## Adapter Pack Format

Each harness gets a directory under `adapters/`:
```
adapters/{harness}/
├── .{harness}/config.json  (MCP server config)
└── {HARNESS}.md            (Instructions for the AI agent)
```

## Testing

```bash
npm test              # Run all tests
npm run lint          # Type check
npm run self-analyze  # Analyze milens with milens
```

## Pull Request Process

1. Fork the repo
2. Create a feature branch
3. Add tests for new functionality
4. Run `npm run build && npm test`
5. Submit PR with description of changes
6. PR will be reviewed by maintainers

## Code of Conduct

- Be respectful and constructive
- Focus on the code, not the person
- Help others learn
- No harassment or discrimination

## License

By contributing, you agree your contributions will be licensed under the same license as the project (MIT for core, see LICENSE).
