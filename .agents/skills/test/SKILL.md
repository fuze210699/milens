---
name: milens-test
description: Code intelligence for the test area — symbols, dependencies, and entry points
---

# Test

## Overview
Contains 129 symbols (43 exported) across 31 files.

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
- **`User`** [interface] — 5 incoming references
- **`createUser`** [function] — 2 incoming references
- **`UserRole`** [type] — 2 incoming references
- **`create_user`** [function] — 2 incoming references
- **`User`** [class] — 2 incoming references

## Dependencies
- **store**: `Database`, `RepoRegistry`, `TfIdfProvider`, `EmbeddingStore`, `buildEmbeddingText`, `close`, `insertSymbol`, `findSymbolByName` (+44 more)
- **root**: `CodeSymbol`, `SymbolLink`, `RawImport`, `RawCall`, `RawHeritage`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+2 more)
- **parser**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `spec`, `extractHtmlScripts`, `extractHtmlRefs` (+2 more)
- **analyzer**: `resolveLinks`, `resolveLinksWithStats`, `reviewSymbol`, `scanFiles`, `generateTestPlan`, `findCoverageGaps`, `analyze`, `loadAliases` (+1 more)
- **scripts**: `run`

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
- test/unit/database.test.ts
- test/unit/db-extended.test.ts
- test/unit/extractor.test.ts
- test/unit/html-css.test.ts
- test/unit/markdown.test.ts
- test/unit/registry.test.ts
- test/unit/resolver.test.ts
- test/unit/review.test.ts
- test/unit/scanner.test.ts
- test/unit/testplan.test.ts
- test/unit/vectors.test.ts
- test/unit/vue-import.test.ts
