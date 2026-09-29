# Releasing

milens uses **Conventional Commits** + **[git-cliff](https://git-cliff.org)** for
an automated, consistent changelog and release process.

## Commit messages

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <subject>
```

Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `revert`, `style`.

Examples:

```
feat(parser): add shared stable-id allocator
fix(engine): filter deleted files before resolution
docs(adapters): document standard as the default profile
```

Enforcement:

- **Locally** — a Husky `commit-msg` hook runs commitlint on every commit
  (installed automatically via `npm install`, which runs the `prepare` script).
- **In CI** — the `Commitlint` workflow validates every commit in a PR against
  `develop`.

How types map to the changelog:

| Type | Section |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `perf` | Performance |
| `refactor` | Changed |
| `docs` | Documentation |
| `test` | Testing |
| `revert` | Reverted |
| commit body containing "security" | Security |
| `chore` / `build` | Miscellaneous |
| `ci`, `chore(release)`, `chore(deps)`, version bumps | omitted |

## Changelog

- Preview the notes for the next release (unreleased commits):

  ```bash
  npm run changelog:preview
  ```

- Add a new released section to `CHANGELOG.md` when cutting a version (preserves
  existing entries):

  ```bash
  npx git-cliff --config cliff.toml --unreleased --tag v<X.Y.Z> --prepend CHANGELOG.md
  ```

- Regenerate the entire file from git history (git-cliff becomes the source of
  truth — this overwrites any hand-curated prose):

  ```bash
  npm run changelog
  ```

## Cutting a release

1. Ensure `develop` is green and all changes are merged.
2. Update the changelog for the new version:

   ```bash
   npx git-cliff --config cliff.toml --unreleased --tag v<X.Y.Z> --prepend CHANGELOG.md
   ```

3. Bump the version (syncs `package.json`, `package-lock.json`, and the Claude Code
   plugin manifest via the `version` lifecycle script):

   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```

4. Commit both together:

   ```bash
   git add CHANGELOG.md package.json package-lock.json adapters/claude-code/.claude-plugin/plugin.json
   git commit -m "v<X.Y.Z>"
   ```

5. Push to `develop`. The `Publish` workflow then:
   - detects the version change vs npm,
   - runs lint + tests + build + smoke test,
   - `npm publish`,
   - creates the `v<X.Y.Z>` git tag and a GitHub Release whose notes are generated
     by git-cliff (falling back to GitHub auto-notes if empty).

Tag and release creation are idempotent, so re-runs are safe.
