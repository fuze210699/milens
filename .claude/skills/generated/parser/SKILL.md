# Parser

## Overview
Contains 76 symbols (26 exported) across 15 files.

## Key Symbols
- **`LangSpec`** [interface] (src/parser/extract.ts:6) — 30 refs
- **`loadLanguage`** [function] (src/parser/loader.ts:21) — 10 refs
- **`getParser`** [function] (src/parser/loader.ts:32) — 9 refs
- **`extractFromTree`** [function] (src/parser/extract.ts:250) — 6 refs
- **`extractHtmlScripts`** [function] (src/parser/lang-html.ts:33) — 5 refs
- **`extractMarkdown`** [function] (src/parser/lang-md.ts:34) — 5 refs
- **`extractVueScript`** [function] (src/parser/lang-vue.ts:18) — 5 refs
- **`extractHtmlRefs`** [function] (src/parser/lang-html.ts:52) — 4 refs
- **`extractVueTemplateRefs`** [function] (src/parser/lang-vue.ts:37) — 4 refs
- **`supportedExtensions`** [function] (src/parser/languages.ts:29) — 4 refs
- **`spec`** [variable] (src/parser/lang-js.ts:5) — 3 refs
- **`spec`** [variable] (src/parser/lang-ts.ts:5) — 3 refs
- **`clearQueryCache`** [function] (src/parser/extract.ts:67) — 2 refs
- **`spec`** [variable] (src/parser/lang-css.ts:5) — 2 refs
- **`spec`** [variable] (src/parser/lang-go.ts:5) — 2 refs

## Entry Points
- **`LangSpec`** [interface] — 30 incoming references
- **`loadLanguage`** [function] — 10 incoming references
- **`getParser`** [function] — 9 incoming references
- **`extractFromTree`** [function] — 6 incoming references
- **`extractHtmlScripts`** [function] — 5 incoming references

## Dependencies
- **root**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **analyzer**: `find`, `resolve`
- **store**: `load`

## Used By
- **analyzer**: `langForFile`, `supportedExtensions`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs` (+6 more)
- **server**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **test**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `spec`, `extractHtmlScripts`, `extractHtmlRefs` (+2 more)

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
