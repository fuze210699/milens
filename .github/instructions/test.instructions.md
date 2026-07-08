---
applyTo: "test/**"
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
Contains 351 symbols (119 exported) across 80 files.

## Key Symbols
- **`User`** [class] (test/fixtures/accuracy/py-project/src/models.py:1) — 6 refs
- **`Calculator`** [class] (test/fixtures/accuracy/js-project/src/calculator.js:1) — 5 refs
- **`User`** [interface] (test/fixtures/ts-project/src/models.ts:1) — 5 refs
- **`User`** [interface] (test/fixtures/accuracy/ts-project/src/models.ts:1) — 3 refs
- **`User`** [class] (test/fixtures/py-project/models.py:1) — 3 refs
- **`User`** [class] (test/fixtures/accuracy/ruby-project/src/models.rb:1) — 3 refs
- **`createCalc`** [function] (test/fixtures/accuracy/js-project/src/calculator.js:6) — 2 refs
- **`UserRepository`** [class] (test/fixtures/accuracy/ts-project/src/models.ts:12) — 2 refs
- **`createUser`** [function] (test/fixtures/ts-project/src/models.ts:9) — 2 refs
- **`UserRole`** [type] (test/fixtures/ts-project/src/models.ts:7) — 2 refs
- **`UserService`** [class] (test/fixtures/ts-project/src/nest-sample.ts:27) — 2 refs
- **`Save`** [method] (test/fixtures/accuracy/go-project/src/models/user.go:16) — 2 refs
- **`UserRepo`** [class] (test/fixtures/accuracy/py-project/src/models.py:10) — 2 refs
- **`save`** [method] (test/fixtures/accuracy/py-project/src/models.py:14) — 2 refs
- **`UserService`** [class] (test/fixtures/accuracy/py-project/src/service.py:4) — 2 refs

## Entry Points
- **`dbPath`** [function] — 8 incoming references
- **`User`** [class] — 6 incoming references
- **`Calculator`** [class] — 5 incoming references
- **`User`** [interface] — 5 incoming references
- **`lang`** [variable] — 5 incoming references

## Dependencies
- **analyzer**: `analyze`, `loadAliases`, `getCachedTree`, `clearTreeCache`, `enrichMetadata`, `resolveLinksWithStats`, `resolveLinks`, `reviewSymbol` (+9 more)
- **store**: `Database`, `AnnotationStore`, `RepoRegistry`, `boostConfidence`, `decayConfidence`, `getStaleAnnotations`, `promoteSecurityAnnotations`, `runDecayPass` (+76 more)
- **root**: `generateAgentsMd`, `AnnotationKey`, `CodeSymbol`, `SymbolLink`, `computeMetrics`, `formatMetricsReport`, `MilensMetrics`, `RawImport` (+17 more)
- **server**: `defaultOnSessionStart`, `defaultOnPreCompact`, `defaultOnSessionEnd`, `defaultOnPostCompact`, `HookManager`, `HookConfig`, `defaultOnPreCommit`, `defaultOnFileChange` (+19 more)
- **security**: `detectEcosystem`, `parseDependencies`, `checkVulnerabilities`, `auditDependencies`, `loadRules`, `getRulesByCategory`, `getRulesBySeverity`
- **parser**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `extractVueCompositionApi`, `extractVueTemplateAst`, `spec` (+11 more)
- **orchestrator**: `Orchestrator`, `formatReport`, `OrchestratorReport`, `subscribe`, `run`, `snapshot`, `compare`, `cancel` (+3 more)
- **scripts**: `detectTypeFromBranch`, `detectScopeFromBranch`, `detectBreakingFromBranch`, `detectBreakingFromLabels`, `slugify`, `parseArgs`, `generateTitle`, `generateBody` (+1 more)

## Used By
- **apps**: `create`

## Files
- test/fixtures/accuracy/go-project/src/admin.go
- test/fixtures/accuracy/go-project/src/main.go
- test/fixtures/accuracy/go-project/src/models/user.go
- test/fixtures/accuracy/java-project/src/Models.java
- test/fixtures/accuracy/java-project/src/Service.java
- test/fixtures/accuracy/js-project/src/app.js
- test/fixtures/accuracy/js-project/src/calculator.js
- test/fixtures/accuracy/js-project/src/extend.js
- test/fixtures/accuracy/php-project/src/admin.php
- test/fixtures/accuracy/php-project/src/models.php
- test/fixtures/accuracy/php-project/src/service.php
- test/fixtures/accuracy/py-project/src/admin.py
- test/fixtures/accuracy/py-project/src/models.py
- test/fixtures/accuracy/py-project/src/service.py
- test/fixtures/accuracy/ruby-project/src/mixins.rb
- test/fixtures/accuracy/ruby-project/src/models.rb
- test/fixtures/accuracy/ruby-project/src/service.rb
- test/fixtures/accuracy/rust-project/src/admin.rs
- test/fixtures/accuracy/rust-project/src/main.rs
- test/fixtures/accuracy/rust-project/src/models.rs
- test/fixtures/accuracy/ts-project/src/auth.ts
- test/fixtures/accuracy/ts-project/src/index.ts
- test/fixtures/accuracy/ts-project/src/models.ts
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
- test/unit/accuracy.test.ts
- test/unit/agents-md.test.ts
- test/unit/annotations.test.ts
- test/unit/cli.test.ts
- test/unit/confidence.test.ts
- test/unit/database.test.ts
- test/unit/db-extended.test.ts
- test/unit/deps-audit.test.ts
- test/unit/engine.test.ts
- test/unit/enrich.test.ts
- test/unit/extractor.test.ts
- test/unit/hooks.test.ts
- test/unit/html-css.test.ts
- test/unit/languages.test.ts
- test/unit/markdown.test.ts
- test/unit/mcp-prompts.test.ts
- test/unit/mcp-tools.test.ts
- test/unit/mcp-transport.test.ts
- test/unit/metrics.test.ts
- test/unit/mro.test.ts
- test/unit/orchestrator.test.ts
- test/unit/parser-extract-cache.test.ts
- test/unit/parser-loader.test.ts
- test/unit/pr-generator.test.ts
- test/unit/registry.test.ts
- test/unit/resolver.test.ts
- test/unit/review.test.ts
- test/unit/risk.test.ts
- test/unit/scanner.test.ts
- test/unit/scope-resolver.test.ts
- test/unit/security-rules.test.ts
- test/unit/server-test-plan.test.ts
- test/unit/skills.test.ts
- test/unit/uninstall.test.ts
- test/unit/utils.test.ts
- test/unit/vectors.test.ts
- test/unit/vue-import.test.ts
- test/unit/watcher.test.ts
