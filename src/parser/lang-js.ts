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
      (generator_function_declaration name: (identifier) @name) @def
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
      (call_expression
        function: (import)
        arguments: (arguments (string (string_fragment) @source))
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
      (export_statement
        declaration: (generator_function_declaration name: (identifier) @name)
      )
      (export_statement
        value: (identifier) @name
      )
    ]`,
    calls: `[
      (call_expression function: (identifier) @callee) @def
      (call_expression function: (member_expression object: (_) @receiver property: (property_identifier) @callee)) @def
      (new_expression constructor: (identifier) @callee) @def
      (new_expression constructor: (member_expression object: (identifier) @receiver property: (property_identifier) @callee)) @def
      (decorator (identifier) @callee) @def
      (jsx_self_closing_element name: (identifier) @callee) @def
      (jsx_opening_element name: (identifier) @callee) @def
      (jsx_self_closing_element name: (member_expression object: (identifier) @receiver property: (property_identifier) @callee)) @def
      (jsx_opening_element name: (member_expression object: (identifier) @receiver property: (property_identifier) @callee)) @def
    ]`,
    heritage: `(class_declaration
      name: (identifier) @child
      (class_heritage (identifier) @parent)
    ) @def`,
    reExports: `[
      (export_statement
        source: (string (string_fragment) @source)
        (export_clause (export_specifier name: (identifier) @name))
      ) @def
      (export_statement
        source: (string (string_fragment) @source)
        "*"
      ) @def
    ]`,
    typeBindings: `[
      (lexical_declaration
        (variable_declarator
          name: (identifier) @var
          value: (new_expression constructor: (identifier) @type)
        )
      )
    ]`,
    assignmentChains: `[
      (lexical_declaration
        (variable_declarator
          name: (identifier) @target
          value: (identifier) @source
        )
      )
    ]`,
    callResultBindings: `[
      (lexical_declaration
        (variable_declarator
          name: (identifier) @var
          value: (call_expression function: (identifier) @callee)
        )
      )
      (lexical_declaration
        (variable_declarator
          name: (identifier) @var
          value: (call_expression function: (member_expression object: (_) @receiver property: (property_identifier) @callee))
        )
      )
    ]`,
  },
  resolveImport(raw, fromFile, root, aliases) {
    // Check aliases first (e.g. @ → src)
    let aliased = false;
    for (const [alias, target] of Object.entries(aliases)) {
      if (raw.startsWith(alias + '/') || raw === alias) {
        raw = raw.replace(alias, target);
        aliased = true;
        break;
      }
    }

    if (!aliased && !raw.startsWith('.') && !raw.startsWith('/')) return null;
    const dir = aliased ? root : dirname(join(root, fromFile));
    const rawBase = join(dir, raw);

    // Strip .js/.jsx/.mjs/.cjs extension for cross-extension resolution
    const JS_EXT = /\.(js|jsx|mjs|cjs)$/;
    const base = JS_EXT.test(rawBase) ? rawBase.replace(JS_EXT, '') : rawBase;

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
