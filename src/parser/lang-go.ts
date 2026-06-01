import { join, dirname, relative } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'go',
  extensions: ['.go'],
  wasmName: 'tree-sitter-go',
  uppercaseExported: true,
  mroStrategy: 'first-wins',
  importSemantics: 'wildcard-leaf',
  isExported: (sym) => sym.name[0] === sym.name[0].toUpperCase() && /[A-Z]/.test(sym.name[0]),
  queries: {
    functions: `(function_declaration name: (identifier) @name) @def`,
    variables: `[
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
    types: `(type_declaration
      (type_spec
        name: (type_identifier) @name
        type: [
          (type_identifier)
          (qualified_type)
          (pointer_type)
          (slice_type)
          (map_type)
          (channel_type)
          (function_type)
          (array_type)
        ]
      )
    ) @def`,
    imports: `(import_spec
      path: (interpreted_string_literal) @source
    ) @def`,
    calls: `[
      (call_expression function: (identifier) @callee) @def
      (call_expression function: (selector_expression operand: (_) @receiver field: (field_identifier) @callee)) @def
    ]`,
    heritage: `[
      (type_declaration (type_spec
        name: (type_identifier) @child
        type: (struct_type (field_declaration_list
          (field_declaration type: (type_identifier) @parent)
        ))
      )) @def
      (type_declaration (type_spec
        name: (type_identifier) @child
        type: (interface_type
          (type_identifier) @parent
        )
      )) @def
    ]`,
    typeBindings: `[
      (var_declaration (var_spec name: (identifier) @var type: (type_identifier) @type))
      (const_declaration (const_spec name: (identifier) @var type: (type_identifier) @type))
      (short_var_declaration left: (identifier) @var right: (composite_literal type: (type_identifier) @type))
      (field_declaration name: (field_identifier) @var type: (type_identifier) @type)
      (parameter_declaration name: (identifier) @var type: (type_identifier) @type)
    ]`,
    returnTypes: `[
      (function_declaration name: (identifier) @name result: (type_identifier) @returnType)
      (function_declaration name: (identifier) @name result: (pointer_type (type_identifier) @returnType))
      (method_declaration name: (field_identifier) @name result: (type_identifier) @returnType)
      (method_declaration name: (field_identifier) @name result: (pointer_type (type_identifier) @returnType))
    ]`,
  },
  resolveImport(raw, _fromFile, root, _aliases) {
    // Go imports are package paths — resolve local packages
    const cleanPath = raw.replace(/^"|"$/g, '');

    // Read module name from go.mod to identify local packages
    let moduleName = '';
    try {
      const goMod = join(root, 'go.mod');
      if (existsSync(goMod)) {
        const content = readFileSync(goMod, 'utf-8');
        const match = content.match(/^module\s+(\S+)/m);
        if (match) moduleName = match[1];
      }
    } catch { /* ignore */ }

    // If import starts with module name, it's a local package
    if (moduleName && cleanPath.startsWith(moduleName + '/')) {
      const localPath = cleanPath.slice(moduleName.length + 1);
      const pkgDir = join(root, localPath);
      if (existsSync(pkgDir)) return relative(root, pkgDir).replace(/\\/g, '/');
      return null;
    }

    // External module (contains domain-like dots with slashes)
    if (cleanPath.includes('.')) return null;

    // Simple local package name
    const pkgDir = join(root, cleanPath);
    if (existsSync(pkgDir)) return relative(root, pkgDir).replace(/\\/g, '/');
    return null;
  },
};

export default spec;
