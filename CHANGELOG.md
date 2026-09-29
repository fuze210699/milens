# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.4] - 2026-09-29

### Added

- **Persistent semantic fact store** (`file_facts` table): per-file raw facts are
  stored as JSON so incremental runs resolve the complete cross-file graph without
  re-parsing unchanged files.
- **Line-independent symbol IDs**: symbol IDs are now
  `${filePath}#${kind}:${name}` (with an occurrence suffix for same-file collisions)
  instead of embedding line numbers. Covers code, Markdown, and — via a shared
  stable-ID allocator — Vue template refs, `defineProps` children, Vue `<style>`
  selectors, the synthesized Vue component symbol, and Ruby `attr_*`/`scope` methods.
- **Link resolution metadata**: links carry a `reason` tag and a resolution
  confidence state (resolved / probable / ambiguous); symbols carry an `importance`
  score.
- New `overview` intent parameter and folded MCP tools: `tests`
  (gaps/impact/plan/generate modes), `security_scan` (scan/fix modes), and
  `detect_changes` precommit mode.
- HTML dashboard output for the CLI.
- Incremental-equivalence oracle now asserts referential integrity (every
  `from_id`/`to_id`/`parent_id` resolves) and cold-index equality across delete,
  rename-with-duplicate, and Vue line-shift scenarios.

### Changed

- **Default MCP profile is now `standard`** (~23 tools). Set `MILENS_PROFILE=full`
  to expose every tool; `minimal` remains available.
- File watcher uses fact-based incremental re-indexing (`force: false`) instead of
  forced targeted re-analysis.
- `startStdio`/`startHttp` return a disposer that removes signal/stdin listeners
  and stops the watcher, preventing listener leaks.

### Fixed

- Deleted files are filtered out before link resolution (live-path check in the
  fact-load phase), so a removed file can no longer win a resolution race and leave
  dangling or missing links.
- Non-force whole-repo and targeted `--force --files` runs now replace the full link
  set from persisted facts, eliminating stale/dangling links after rename or delete.
- Exact import-alias bindings resolve before the unique-name fast path.
- External inheritance targets persist across non-force incremental runs.
- `parse_error_files` metadata is updated on incremental runs, not just full scans.
- `trace(direction: "from")` follows execution edges only (excludes references/imports).
- Vue/CSS selector symbol IDs stay stable under line shifts.

[0.7.4]: https://github.com/midota/milens/releases/tag/v0.7.4
