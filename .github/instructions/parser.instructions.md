---
applyTo: "src/parser/**"
---

# Parser

## Working with this area
When working with code in **parser/**, follow these mandatory safety rules:

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
Contains 76 symbols (26 exported) across 15 files.

## Key Symbols
- **`LangSpec`** [interface] (src/parser/extract.ts:6) — 30 refs
- **`loadLanguage`** [function] (src/parser/loader.ts:21) — 14 refs
- **`getParser`** [function] (src/parser/loader.ts:32) — 13 refs
- **`extractFromTree`** [function] (src/parser/extract.ts:250) — 8 refs
- **`supportedExtensions`** [function] (src/parser/languages.ts:29) — 6 refs
- **`extractHtmlScripts`** [function] (src/parser/lang-html.ts:33) — 5 refs
- **`extractMarkdown`** [function] (src/parser/lang-md.ts:34) — 5 refs
- **`spec`** [variable] (src/parser/lang-ts.ts:5) — 5 refs
- **`extractVueScript`** [function] (src/parser/lang-vue.ts:18) — 5 refs
- **`initTreeSitter`** [function] (src/parser/loader.ts:15) — 5 refs
- **`clearQueryCache`** [function] (src/parser/extract.ts:67) — 4 refs
- **`extractHtmlRefs`** [function] (src/parser/lang-html.ts:52) — 4 refs
- **`extractVueTemplateRefs`** [function] (src/parser/lang-vue.ts:37) — 4 refs
- **`langForFile`** [function] (src/parser/languages.ts:24) — 4 refs
- **`spec`** [variable] (src/parser/lang-js.ts:5) — 3 refs

## Entry Points
- **`LangSpec`** [interface] — 30 incoming references
- **`loadLanguage`** [function] — 14 incoming references
- **`getParser`** [function] — 13 incoming references
- **`extractFromTree`** [function] — 8 incoming references
- **`supportedExtensions`** [function] — 6 incoming references

## Dependencies
- **root**: `CodeSymbol`, `RawImport`, `RawCall`, `RawHeritage`, `RawReExport`, `RawTypeBinding`, `RawAssignmentBinding`, `RawReturnType` (+4 more)
- **test**: `lang`, `parser`
- **analyzer**: `find`, `resolve`
- **store**: `load`

## Used By
- **analyzer**: `langForFile`, `supportedExtensions`, `getParser`, `loadLanguage`, `extractFromTree`, `clearQueryCache`, `extractVueScript`, `extractVueTemplateRefs` (+6 more)
- **server**: `getParser`, `loadLanguage`, `ALL_LANGS`
- **test**: `getParser`, `loadLanguage`, `extractFromTree`, `extractVueScript`, `extractVueTemplateRefs`, `spec`, `extractHtmlScripts`, `extractHtmlRefs` (+7 more)

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
