import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'typescript',
  extensions: ['.ts', '.tsx'],
  wasmName: 'tree-sitter-tsx',
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
    classes: `(class_declaration name: (type_identifier) @name) @def`,
    methods: `(method_definition name: (property_identifier) @name) @def`,
    interfaces: `(interface_declaration name: (type_identifier) @name) @def`,
    enums: `(enum_declaration name: (identifier) @name) @def`,
    types: `(type_alias_declaration name: (type_identifier) @name) @def`,
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
        declaration: (class_declaration name: (type_identifier) @name)
      )
      (export_statement
        declaration: (interface_declaration name: (type_identifier) @name)
      )
      (export_statement
        declaration: (enum_declaration name: (identifier) @name)
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
        declaration: (type_alias_declaration name: (type_identifier) @name)
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
    heritage: `[
      (class_declaration
        name: (type_identifier) @child
        (class_heritage (extends_clause value: (identifier) @parent))
      ) @def
      (class_declaration
        name: (type_identifier) @child
        (class_heritage (implements_clause (type_identifier) @parent))
      ) @def
    ]`,
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
      (lexical_declaration
        (variable_declarator
          name: (identifier) @var
          type: (type_annotation (type_identifier) @type)
        )
      )
      (required_parameter
        pattern: (identifier) @var
        type: (type_annotation (type_identifier) @type)
      )
      (public_field_definition
        name: (property_identifier) @var
        type: (type_annotation (type_identifier) @type)
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

    // Skip bare module specifiers (node_modules) — but not alias-resolved paths
    if (!aliased && !raw.startsWith('.') && !raw.startsWith('/')) return null;

    // Alias-resolved paths are root-relative; relative paths resolve from file's dir
    const dir = aliased ? root : dirname(join(root, fromFile));
    const rawBase = join(dir, raw);

    // Strip .js/.jsx/.mjs/.cjs extension — TS convention: `import './foo.js'` → file is `foo.ts`
    const JS_EXT = /\.(js|jsx|mjs|cjs)$/;
    const base = JS_EXT.test(rawBase) ? rawBase.replace(JS_EXT, '') : rawBase;

    const candidates = [
      base + '.ts', base + '.tsx',
      base + '.js', base + '.jsx',
      base + '.vue',
      join(base, 'index.ts'), join(base, 'index.tsx'),
      join(base, 'index.js'),
    ];

    for (const p of candidates) {
      if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
    }
    return null;
  },
};

export default spec;
