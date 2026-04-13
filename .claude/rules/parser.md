---
paths:
  - "src/parser/**"
---

# Parser

## Overview
Contains 52 symbols (13 exported) across 15 files.

## Key Symbols
- **`LangSpec`** [interface] (src/parser/extract.ts:6) — 14 refs
- **`loadLanguage`** [function] (src/parser/loader.ts:21) — 10 refs
- **`getParser`** [function] (src/parser/loader.ts:32) — 9 refs
- **`extractFromTree`** [function] (src/parser/extract.ts:187) — 6 refs
- **`extractHtmlScripts`** [function] (src/parser/lang-html.ts:33) — 4 refs
- **`extractHtmlRefs`** [function] (src/parser/lang-html.ts:52) — 4 refs
- **`extractMarkdown`** [function] (src/parser/lang-md.ts:34) — 4 refs
- **`extractVueScript`** [function] (src/parser/lang-vue.ts:18) — 4 refs
- **`extractVueTemplateRefs`** [function] (src/parser/lang-vue.ts:37) — 4 refs
- **`clearQueryCache`** [function] (src/parser/extract.ts:65) — 2 refs
- **`langForFile`** [function] (src/parser/languages.ts:24) — 2 refs
- **`supportedExtensions`** [function] (src/parser/languages.ts:29) — 2 refs
- **`initTreeSitter`** [function] (src/parser/loader.ts:15) — 1 refs

## Entry Points
- **`LangSpec`** [interface] — 14 incoming references
- **`loadLanguage`** [function] — 10 incoming references
- **`getParser`** [function] — 9 incoming references
- **`extractFromTree`** [function] — 6 incoming references
- **`extractHtmlScripts`** [function] — 4 incoming references

## Dependencies
- **root**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **server**: `get`
- **analyzer**: `find`, `resolve`
- **store**: `load`

## Used By
- **analyzer**: `langForFile`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs`, `extractHtmlScripts` (+5 more)
- **server**: `getParser`, `loadLanguage`
- **test**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `extractHtmlScripts`, `extractHtmlRefs`, `extractMarkdown` (+1 more)

## Files
- src/parser/extract.ts
- src/parser/lang-css.ts
- src/parser/lang-go.ts
- src/parser/lang-html.ts
- src/parser/lang-java.ts
- src/parser/lang-js.ts
- src/parser/lang-md.ts
- src/parser/lang-php.ts
- src/parser/lang-py.ts
- src/parser/lang-ruby.ts
- src/parser/lang-rust.ts
- src/parser/lang-ts.ts
- src/parser/lang-vue.ts
- src/parser/languages.ts
- src/parser/loader.ts
