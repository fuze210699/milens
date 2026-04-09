import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'php',
  extensions: ['.php'],
  wasmName: 'tree-sitter-php',
  queries: {
    functions: `[
      (function_definition name: (name) @name) @def
      (const_declaration (const_element (name) @name)) @def
    ]`,
    classes: `(class_declaration name: (name) @name) @def`,
    interfaces: `(interface_declaration name: (name) @name) @def`,
    traits: `(trait_declaration name: (name) @name) @def`,
    enums: `(enum_declaration name: (name) @name) @def`,
    methods: `(method_declaration name: (name) @name) @def`,
    imports: `[
      (namespace_use_declaration
        (namespace_use_clause (qualified_name) @source)
      ) @def
      (expression_statement
        (include_expression (string (string_content) @source))
      ) @def
    ]`,
    calls: `[
      (function_call_expression
        function: (name) @callee
      ) @def
      (member_call_expression
        object: (_) @receiver
        name: (name) @callee
      ) @def
      (scoped_call_expression
        scope: (name) @receiver
        name: (name) @callee
      ) @def
      (object_creation_expression (name) @callee) @def
    ]`,
    heritage: `[
      (class_declaration
        name: (name) @child
        (base_clause (name) @parent)
      ) @def
      (class_declaration
        name: (name) @child
        (class_interface_clause (name) @parent)
      ) @def
      (class_declaration
        name: (name) @child
        body: (declaration_list
          (use_declaration (name) @parent)
        )
      ) @def
    ]`,
  },
  resolveImport(raw, _fromFile, root, aliases) {
    // PHP PSR-4: App\Models\User → app/Models/User.php (using aliases/psr4 map)
    for (const [ns, dir] of Object.entries(aliases)) {
      const nsPrefix = ns.replace(/\\$/, '');
      if (raw.startsWith(nsPrefix)) {
        const rest = raw.slice(nsPrefix.length).replace(/\\/g, '/');
        const candidate = join(root, dir, rest) + '.php';
        if (existsSync(candidate)) return relative(root, candidate).replace(/\\/g, '/');
      }
    }
    // Fallback: try direct path mapping
    const filePath = raw.replace(/\\/g, '/') + '.php';
    const candidate = join(root, filePath);
    if (existsSync(candidate)) return relative(root, candidate).replace(/\\/g, '/');
    return null;
  },
};

export default spec;
