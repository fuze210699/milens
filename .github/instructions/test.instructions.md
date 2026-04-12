---
applyTo: "test/**"
---

# Test

## Overview
Contains 85 symbols (29 exported) across 25 files.

## Key Symbols
- **`useClipboard`** [function] (test/fixtures/vue-project/src/composables/useClipboard.js:1) — 2 refs
- **`createUser`** [function] (test/fixtures/ts-project/src/models.ts:9) — 2 refs
- **`Project Guide`** [section] (test/fixtures/md-project/docs/guide.md:1) — 1 refs
- **`Getting Started`** [section] (test/fixtures/md-project/docs/guide.md:5) — 1 refs
- **`Architecture`** [section] (test/fixtures/md-project/docs/guide.md:15) — 1 refs
- **`Models`** [section] (test/fixtures/md-project/docs/guide.md:19) — 1 refs
- **`Authentication`** [section] (test/fixtures/md-project/docs/guide.md:25) — 1 refs
- **`API Reference`** [section] (test/fixtures/md-project/docs/guide.md:35) — 1 refs
- **`Endpoints`** [section] (test/fixtures/md-project/docs/guide.md:37) — 1 refs
- **`Error Codes`** [section] (test/fixtures/md-project/docs/guide.md:42) — 1 refs
- **`Contributing`** [section] (test/fixtures/md-project/docs/guide.md:46) — 1 refs
- **`User`** [interface] (test/fixtures/ts-project/src/models.ts:1) — 1 refs
- **`UserRole`** [type] (test/fixtures/ts-project/src/models.ts:7) — 1 refs
- **`NewUser`** [function] (test/fixtures/go-project/models/user.go:14) — 1 refs
- **`My Project`** [section] (test/fixtures/md-project/README.md:1) — 0 refs

## Entry Points
- **`useClipboard`** [function] — 2 incoming references
- **`copy`** [function] — 2 incoming references
- **`createUser`** [function] — 2 incoming references
- **`Project Guide`** [section] — 1 incoming references
- **`Getting Started`** [section] — 1 incoming references

## Dependencies
- **store**: `Database`, `close`, `insertSymbol`, `findSymbolByName`, `insertLink`, `getIncomingLinks`, `getOutgoingLinks`, `rebuildSearch` (+14 more)
- **root**: `CodeSymbol`, `SymbolLink`, `RawImport`, `RawCall`, `RawHeritage`, `has`
- **parser**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `extractHtmlScripts`, `extractHtmlRefs`, `extractMarkdown` (+1 more)
- **analyzer**: `resolveLinks`, `resolveLinksWithStats`, `scanFiles`, `analyze`, `loadAliases`, `find`

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
- test/fixtures/vue-project-refs/src/composables/useClipboard.js
- test/fixtures/vue-project-refs/src/views/TestView.vue
- test/fixtures/vue-project/src/composables/useClipboard.js
- test/fixtures/vue-project/src/views/TestView.vue
- test/unit/database.test.ts
- test/unit/extractor.test.ts
- test/unit/html-css.test.ts
- test/unit/markdown.test.ts
- test/unit/resolver.test.ts
- test/unit/scanner.test.ts
- test/unit/vue-import.test.ts
