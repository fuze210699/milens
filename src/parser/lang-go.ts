import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'go',
  extensions: ['.go'],
  wasmName: 'tree-sitter-go',
  queries: {
    functions: `[
      (function_declaration name: (identifier) @name) @def
      (const_declaration (const_spec name: (identifier) @name)) @def
      (var_declaration (var_spec name: (identifier) @name)) @def
    ]`,
    methods: `(method_declaration
      name: (field_identifier) @name
    ) @def`,
    structs: `(type_declaration
      (type_spec
        name: (type_identifier) @name
        type: (struct_type)
      )
    ) @def`,
    interfaces: `(type_declaration
      (type_spec
        name: (type_identifier) @name
        type: (interface_type)
      )
    ) @def`,
    imports: `(import_spec
      path: (interpreted_string_literal) @source
    ) @def`,
    calls: `
      (call_expression function: (identifier) @callee) @def
      (call_expression function: (selector_expression field: (field_identifier) @callee)) @def
    `,
  },
  resolveImport(raw, fromFile, root, _aliases) {
    // Go imports are package paths — only resolve local packages
    const cleanPath = raw.replace(/^"|"$/g, '');
    if (cleanPath.includes('.')) return null; // external module
    // Local package: look for directory under root
    const pkgDir = join(root, cleanPath);
    if (existsSync(pkgDir)) return relative(root, pkgDir).replace(/\\/g, '/');
    return null;
  },
};

export default spec;
