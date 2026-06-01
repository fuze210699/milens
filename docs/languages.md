# Language Support

Milens parses **12 languages** with tree-sitter WASM. Each language has declarative `LangSpec` configurations with custom queries, MRO strategies, and import semantics.

## Support Matrix

| Language | Extensions | Symbols | Features |
|----------|-----------|:------:|----------|
| TypeScript/TSX | `.ts`, `.tsx` | 14 query types | Full: type bindings, decorators, generics |
| JavaScript/JSX | `.js`, `.jsx` | 12 query types | Full: imports, exports, JSX |
| Python | `.py` | 10 query types | Full: decorators, `__all__`, type annotations |
| Java | `.java` | 8 query types | Classes, interfaces, enums, imports |
| Go | `.go` | 8 query types | Structs, interfaces, uppercase=exported |
| Rust | `.rs` | 8 query types | Structs, traits, enums, macros |
| PHP | `.php` | 8 query types | Classes, traits, interfaces |
| **Ruby** | `.rb`, `.rake` | 10 query types | Constants, variables, type bindings, Rails DSL |
| **Vue SFC** | `.vue` | TS + custom | Composition API, AST template, scoped CSS |
| **HTML** | `.html`, `.htm` | Tree-sitter + regex | Elements, attributes, forms, links |
| **CSS** | `.css` | 7 query types | Classes, IDs, keyframes, media queries |
| Markdown | `.md` | Section-based | Headings as symbols, cross-file links |

## Ruby

### Constant & Variable Detection

```ruby
MAX_USERS = 100           # → constant "MAX_USERS"
@name = "Alice"           # → variable "@name"
@@count = 0               # → variable "@@count"
```

### Type Bindings

```ruby
repo = UserRepo.new       # → typeBinding: repo → UserRepo
@cache = Cache.new        # → typeBinding: @cache → Cache
```

### attr_accessor → Virtual Methods

```ruby
class User
  attr_accessor :name, :email
  # → method "name" (reader) + "name=" (writer)
  # → method "email" (reader) + "email=" (writer)
end
```

### Rails DSL Detection

```ruby
class Post < ApplicationRecord
  has_many :comments      # → heritage: Post → Comment
  belongs_to :author      # → heritage: Post → Author
  scope :published, -> { where(published: true) }  # → method "published"
  validates :title, presence: true  # → annotation on "title"
end

class PostsController < ApplicationController
  before_action :authenticate_user!  # → call to authenticate_user!
end
```

### Visibility Detection

```ruby
class User
  def public_method; end   # → exported: true

  private

  def private_method; end  # → exported: false
end
```

## Vue SFC (.vue)

### Composition API

```vue
<script setup>
const props = defineProps<{ name: string; age?: number }>()
// → symbol "props" + child symbols "name", "age"

const emit = defineEmits(['update:modelValue', 'change'])
// → symbol "emit" + child symbols "update:modelValue", "change"
</script>
```

### AST-Based Template Parsing

The `<template>` block is parsed with tree-sitter-html for:
- Component tags (`<MyComponent>`, `<el-button>`)
- Event handlers (`@click`, `v-on:submit`)
- Directives (`v-if`, `v-model`, `:prop`, `v-bind:src`)
- `class` attributes → cross-language CSS links
- `ref` attributes → template reference symbols

### Style Scoped

```vue
<style scoped>
.container { color: red; }  # → symbol ".container" (exported: false)
#app { font-size: 16px; }   # → symbol "#app" (exported: false)
</style>
```

Scoped styles are marked `exported: false`. Global styles are `exported: true`.

## CSS

### Selector Detection

```css
.container { }         # → symbol "container" → prefixed to ".container"
#main-header { }       # → symbol "main-header" → prefixed to "#main-header"
```

### Keyframes & Media Queries

```css
@keyframes fadeIn { }          # → symbol "fadeIn"
@media (max-width: 768px) { }  # → symbol "max-width"
```

### Cross-Language CSS Links

```
HTML:  <div class="container">  →  calleeName: ".container"
CSS:   .container { ... }       →  symbol name: ".container"
          ↓
Resolver matches ".container" ↔ ".container" → creates cross-file link
```

## HTML

### Tree-Sitter Attribute Extraction

All attribute values are extracted as calls via tree-sitter-html:

```html
<div class="container main" id="app">
  <a href="/page">Link</a>
  <img src="logo.png">
</div>
```

### Form & Link Detection

```html
<form action="/submit">    → import "/submit"
<a href="/page">           → import "/page"
<img src="image.png">      → import "image.png"
<link rel="icon" href="..."> → import
```

### Class → CSS Cross-Linking

HTML class values are prefixed with `.` to match CSS symbols:

```
<div class="container">  →  calleeName: ".container"
                              ↓
CSS .container { ... }   →  symbol: ".container"  ← MATCH
```

## Architecture

All languages share a unified extraction pipeline:

```
Source file
    ↓
langForFile() → finds LangSpec by extension
    ↓
getParser() → loads tree-sitter WASM
    ↓
extractFromTree() → runs declarative queries from LangSpec
    ↓
Symbols + Imports + Calls + Heritage + TypeBindings + ...
```
