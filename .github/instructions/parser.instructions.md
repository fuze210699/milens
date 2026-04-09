---
applyTo: "src/parser/**"
---

# Parser

## Overview
Contains 30 symbols (10 exported) across 12 files.

## Key Symbols
- **`loadLanguage`** [function] (src/parser/loader.ts:20) — 3 refs
- **`extractFromTree`** [function] (src/parser/extract.ts:167) — 2 refs
- **`extractVueScript`** [function] (src/parser/lang-vue.ts:18) — 2 refs
- **`extractVueTemplateRefs`** [function] (src/parser/lang-vue.ts:37) — 2 refs
- **`getParser`** [function] (src/parser/loader.ts:31) — 2 refs
- **`clearQueryCache`** [function] (src/parser/extract.ts:47) — 1 refs
- **`langForFile`** [function] (src/parser/languages.ts:21) — 1 refs
- **`supportedExtensions`** [function] (src/parser/languages.ts:26) — 1 refs
- **`initTreeSitter`** [function] (src/parser/loader.ts:14) — 1 refs
- **`LangSpec`** [interface] (src/parser/extract.ts:6) — 0 refs

## Entry Points
- **`loadLanguage`** [function] — 3 incoming references
- **`walkImportNames`** [function] — 2 incoming references
- **`extractFromTree`** [function] — 2 incoming references
- **`extractVueScript`** [function] — 2 incoming references
- **`extractVueTemplateRefs`** [function] — 2 incoming references

## Dependencies
- **root**: `has`
- **server**: `get`
- **store**: `clear`, `load`

## Used By
- **analyzer**: `langForFile`, `getParser`, `loadLanguage`, `resolveImport`, `clearQueryCache`, `extractVueScript`, `extractFromTree`, `extractVueTemplateRefs` (+1 more)

## Files
- src/parser/extract.ts
- src/parser/lang-go.ts
- src/parser/lang-java.ts
- src/parser/lang-js.ts
- src/parser/lang-php.ts
- src/parser/lang-py.ts
- src/parser/lang-ruby.ts
- src/parser/lang-rust.ts
- src/parser/lang-ts.ts
- src/parser/lang-vue.ts
- src/parser/languages.ts
- src/parser/loader.ts
