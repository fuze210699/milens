import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'javascript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  wasmName: 'tree-sitter-javascript',
  queries: {
    functions: `[
      (function_declaration name: (identifier) @name) @def
      (lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function)
        )
      ) @def
    ]`,
    classes: `(class_declaration name: (identifier) @name) @def`,
    methods: `(method_definition name: (property_identifier) @name) @def`,
    imports: `[
      (import_statement
        source: (string (string_fragment) @source)
      ) @def
      (lexical_declaration
        (variable_declarator
          value: (call_expression
            function: (identifier) @_req
            arguments: (arguments (string (string_fragment) @source))
          )
        )
      ) @def
    ]`,
    exports: `[
      (export_statement
        declaration: (function_declaration name: (identifier) @name)
      )
      (export_statement
        declaration: (class_declaration name: (identifier) @name)
      )
      (export_statement
        declaration: (lexical_declaration
          (variable_declarator name: (identifier) @name)
        )
      )
      (export_statement
        (export_clause (export_specifier name: (identifier) @name))
      )
    ]`,
    calls: `
      (call_expression function: (identifier) @callee) @def
      (call_expression function: (member_expression property: (property_identifier) @callee)) @def
    `,
    heritage: `(class_declaration
      name: (identifier) @child
      (class_heritage (identifier) @parent)
    ) @def`,
  },
  resolveImport(raw, fromFile, root, _aliases) {
    if (!raw.startsWith('.') && !raw.startsWith('/')) return null;
    const dir = dirname(join(root, fromFile));
    const base = join(dir, raw);
    const candidates = [
      base + '.js', base + '.jsx', base + '.mjs',
      join(base, 'index.js'), join(base, 'index.mjs'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
    }
    return null;
  },
};

export default spec;
