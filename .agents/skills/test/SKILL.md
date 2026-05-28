---
name: milens-test
description: Code intelligence for the test area — symbols, dependencies, and entry points
---

# Test

## Working with this area
When working with code in **test/**, follow these mandatory safety rules:

### Before editing any symbol in this area:
1. Call `mcp_milens_impact({target: "<symbol>", repo: "<workspaceRoot>"})` — check blast radius
2. If depth-1 dependents > 5 → **STOP and warn** before proceeding
3. Call `mcp_milens_context({name: "<symbol>", repo: "<workspaceRoot>"})` — see all callers/callees

### Before committing changes in this area:
1. Call `mcp_milens_detect_changes({repo: "<workspaceRoot>"})` — verify scope
2. If unexpected files changed → **STOP and report**

### Key tools for this area:
| Task | Tool |
|---|---|
| Find all references | `mcp_milens_context` |
| Check edit safety | `mcp_milens_edit_check` |
| Text search across files | `mcp_milens_grep` |
| See file symbols | `mcp_milens_get_file_symbols` |

## Overview
Contains 195 symbols (43 exported) across 49 files.

## Key Symbols
- **`User`** [interface] (test/fixtures/ts-project/src/models.ts:1) — 5 refs
- **`createUser`** [function] (test/fixtures/ts-project/src/models.ts:9) — 2 refs
- **`UserRole`** [type] (test/fixtures/ts-project/src/models.ts:7) — 2 refs
- **`create_user`** [function] (test/fixtures/py-project/models.py:10) — 2 refs
- **`User`** [class] (test/fixtures/py-project/models.py:1) — 2 refs
- **`Project Guide`** [section] (test/fixtures/md-project/docs/guide.md:1) — 1 refs
- **`Getting Started`** [section] (test/fixtures/md-project/docs/guide.md:5) — 1 refs
- **`Architecture`** [section] (test/fixtures/md-project/docs/guide.md:15) — 1 refs
- **`Models`** [section] (test/fixtures/md-project/docs/guide.md:19) — 1 refs
- **`Authentication`** [section] (test/fixtures/md-project/docs/guide.md:25) — 1 refs
- **`API Reference`** [section] (test/fixtures/md-project/docs/guide.md:35) — 1 refs
- **`Endpoints`** [section] (test/fixtures/md-project/docs/guide.md:37) — 1 refs
- **`Error Codes`** [section] (test/fixtures/md-project/docs/guide.md:42) — 1 refs
- **`Contributing`** [section] (test/fixtures/md-project/docs/guide.md:46) — 1 refs
- **`UserController`** [class] (test/fixtures/ts-project/src/nest-sample.ts:18) — 1 refs

## Entry Points
- **`lang`** [variable] — 12 incoming references
- **`dbPath`** [function] — 10 incoming references
- **`User`** [interface] — 5 incoming references
- **`parser`** [variable] — 3 incoming references
- **`createUser`** [function] — 2 incoming references

## Dependencies
- **root**: `generateAgentsMd`, `AnnotationKey`, `CodeSymbol`, `SymbolLink`, `computeMetrics`, `formatMetricsReport`, `MilensMetrics`, `RawImport` (+9 more)
- **store**: `Database`, `AnnotationStore`, `RepoRegistry`, `boostConfidence`, `decayConfidence`, `getStaleAnnotations`, `promoteSecurityAnnotations`, `runDecayPass` (+76 more)
- **security**: `detectEcosystem`, `parseDependencies`, `checkVulnerabilities`, `auditDependencies`, `loadRules`, `getRulesByCategory`, `getRulesBySeverity`
- **analyzer**: `enrichMetadata`, `resolveLinks`, `resolveLinksWithStats`, `reviewSymbol`, `reviewPr`, `scanFiles`, `generateTestPlan`, `findCoverageGaps` (+5 more)
- **parser**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `spec`, `extractHtmlScripts`, `extractHtmlRefs` (+7 more)
- **server**: `HookManager`, `HookConfig`, `defaultOnSessionStart`, `defaultOnSessionEnd`, `defaultOnPreCommit`, `defaultOnFileChange`, `defaultOnPreCompact`, `defaultOnPostCompact` (+10 more)
- **orchestrator**: `Orchestrator`, `formatReport`, `OrchestratorReport`, `subscribe`, `run`, `snapshot`, `compare`, `cancel` (+3 more)

## Used By
- **apps**: `dbPath`
- **analyzer**: `parser`, `lang`
- **root**: `dbPath`
- **parser**: `lang`, `parser`
- **server**: `dbPath`
- **store**: `dbPath`

## Files
- test/fixtures/go-project/models/user.go
- test/fixtures/go-project/service/handler.go
- test/fixtures/html-project/css/main.css
- test/fixtures/html-project/css/reset.css
- test/fixtures/html-project/index.html
- test/fixtures/html-project/js/analytics.js
- test/fixtures/html-project/js/utils.js
- test/fixtures/md-project/README.md
- test/fixtures/md-project/docs/guide.md
- test/fixtures/py-project/models.py
- test/fixtures/py-project/service.py
- test/fixtures/ts-project/src/UserProfile.vue
- test/fixtures/ts-project/src/auth.ts
- test/fixtures/ts-project/src/models.ts
- test/fixtures/ts-project/src/nest-sample.ts
- test/fixtures/vue-project-refs/src/composables/useClipboard.js
- test/fixtures/vue-project-refs/src/views/TestView.vue
- test/fixtures/vue-project/src/composables/useClipboard.js
- test/fixtures/vue-project/src/views/TestView.vue
- test/unit/agents-md.test.ts
- test/unit/annotations.test.ts
- test/unit/cli.test.ts
- test/unit/confidence.test.ts
- test/unit/database.test.ts
- test/unit/db-extended.test.ts
- test/unit/deps-audit.test.ts
- test/unit/enrich.test.ts
- test/unit/extractor.test.ts
- test/unit/hooks.test.ts
- test/unit/html-css.test.ts
- test/unit/languages.test.ts
- test/unit/markdown.test.ts
- test/unit/mcp-prompts.test.ts
- test/unit/mcp-tools.test.ts
- test/unit/metrics.test.ts
- test/unit/orchestrator.test.ts
- test/unit/parser-extract-cache.test.ts
- test/unit/parser-loader.test.ts
- test/unit/registry.test.ts
- test/unit/resolver.test.ts
- test/unit/review.test.ts
- test/unit/scanner.test.ts
- test/unit/security-rules.test.ts
- test/unit/server-test-plan.test.ts
- test/unit/skills.test.ts
- test/unit/testplan.test.ts
- test/unit/utils.test.ts
- test/unit/vectors.test.ts
- test/unit/vue-import.test.ts
