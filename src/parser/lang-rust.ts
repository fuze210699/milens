import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'rust',
  extensions: ['.rs'],
  wasmName: 'tree-sitter-rust',
  queries: {
    functions: `[
      (function_item name: (identifier) @name) @def
      (const_item name: (identifier) @name) @def
      (static_item name: (identifier) @name) @def
      (type_item name: (type_identifier) @name) @def
      (mod_item name: (identifier) @name) @def
    ]`,
    structs: `(struct_item name: (type_identifier) @name) @def`,
    enums: `(enum_item name: (type_identifier) @name) @def`,
    traits: `(trait_item name: (type_identifier) @name) @def`,
    methods: `(impl_item
      body: (declaration_list
        (function_item name: (identifier) @name) @def
      )
    )`,
    imports: `(use_declaration
      argument: [
        (scoped_identifier) @source
        (use_as_clause path: (scoped_identifier) @source)
        (scoped_use_list path: (scoped_identifier) @source)
      ]
    ) @def`,
    calls: `[
      (call_expression function: (identifier) @callee) @def
      (call_expression function: (scoped_identifier name: (identifier) @callee)) @def
      (call_expression function: (field_expression value: (_) @receiver field: (field_identifier) @callee)) @def
      (macro_invocation macro: (identifier) @callee) @def
    ]`,
    heritage: `(impl_item
      trait: (type_identifier) @parent
      type: (type_identifier) @child
    ) @def`,
  },
  resolveImport(raw, _fromFile, root, _aliases) {
    // Rust use: crate::module::item → src/module.rs or src/module/mod.rs
    if (!raw.startsWith('crate')) return null;
    const parts = raw.replace('crate::', '').split('::');
    parts.pop(); // last part is usually the item, not the file
    if (parts.length === 0) return null;
    const candidates = [
      join(root, 'src', ...parts) + '.rs',
      join(root, 'src', ...parts, 'mod.rs'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
    }
    return null;
  },
};

export default spec;
