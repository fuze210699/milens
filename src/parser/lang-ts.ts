import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'typescript',
  extensions: ['.ts', '.tsx'],
  wasmName: 'tree-sitter-tsx',
  mroStrategy: 'first-wins',
  importSemantics: 'named',
  isExported: () => false, // handled by exports query (export keyword)
  filterCallee(callee: string, defNodeType: string): boolean {
    if ((defNodeType === 'jsx_self_closing_element' || defNodeType === 'jsx_opening_element') && /^[a-z]/.test(callee)) {
      return false;
    }
    return true;
  },
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
    variables: `[
      (program (lexical_declaration
        (variable_declarator name: (identifier) @name))
      ) @def
      (export_statement
        (lexical_declaration
          (variable_declarator name: (identifier) @name))
      ) @def
    ]`,
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
      (decorator (call_expression arguments: (arguments (identifier) @callee))) @def
      (decorator (call_expression arguments: (arguments (object (pair value: (identifier) @callee))))) @def
      (decorator (call_expression arguments: (arguments (object (pair value: (array (identifier) @callee)))))) @def
      (decorator (call_expression arguments: (arguments (object (pair value: (array (object (pair value: (identifier) @callee)))))))) @def
      (decorator (call_expression arguments: (arguments (arrow_function body: (identifier) @callee)))) @def
      (decorator (call_expression arguments: (arguments (object (pair value: (arrow_function body: (identifier) @callee)))))) @def
      (call_expression arguments: (arguments (identifier) @callee)) @def
      (call_expression arguments: (arguments (object (pair value: (identifier) @callee)))) @def
      (call_expression arguments: (arguments (object (pair value: (array (identifier) @callee))))) @def
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
      (lexical_declaration
        (variable_declarator
          name: (identifier) @var
          type: (type_annotation (generic_type type_arguments: (type_arguments (type_identifier) @type)))
        )
      )
      (required_parameter
        pattern: (identifier) @var
        type: (type_annotation (generic_type type_arguments: (type_arguments (type_identifier) @type)))
      )
      (public_field_definition
        name: (property_identifier) @var
        type: (type_annotation (generic_type type_arguments: (type_arguments (type_identifier) @type)))
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
    returnTypes: `[
      (function_declaration
        name: (identifier) @name
        return_type: (type_annotation (type_identifier) @returnType)
      )
      (lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function
            return_type: (type_annotation (type_identifier) @returnType)
          )
        )
      )
      (class_declaration
        name: (type_identifier) @className
        body: (class_body
          (method_definition
            name: (property_identifier) @name
            return_type: (type_annotation (type_identifier) @returnType)
          )
        )
      )
      (function_declaration
        name: (identifier) @name
        return_type: (type_annotation (generic_type type_arguments: (type_arguments (type_identifier) @returnType)))
      )
      (lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function
            return_type: (type_annotation (generic_type type_arguments: (type_arguments (type_identifier) @returnType)))
          )
        )
      )
      (class_declaration
        name: (type_identifier) @className
        body: (class_body
          (method_definition
            name: (property_identifier) @name
            return_type: (type_annotation (generic_type type_arguments: (type_arguments (type_identifier) @returnType)))
          )
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
    // Names that can only ever be locally scoped — never a project symbol, import, or
    // global — so a bare call to one of these should never be counted as "unresolved".
    // Covers: any const/let/var declarator (including array/object destructuring, e.g.
    // `const [x, setX] = useState()`, `const { onClose } = props`) and function/arrow
    // parameters (plain or destructured), regardless of nesting depth.
    localBindings: `[
      (variable_declarator name: (identifier) @name)
      (variable_declarator name: (array_pattern (identifier) @name))
      (variable_declarator name: (object_pattern (shorthand_property_identifier_pattern) @name))
      (variable_declarator name: (object_pattern (pair_pattern value: (identifier) @name)))
      (required_parameter pattern: (identifier) @name)
      (optional_parameter pattern: (identifier) @name)
      (required_parameter pattern: (object_pattern (shorthand_property_identifier_pattern) @name))
      (optional_parameter pattern: (object_pattern (shorthand_property_identifier_pattern) @name))
      (required_parameter pattern: (object_pattern (pair_pattern value: (identifier) @name)))
      (required_parameter pattern: (array_pattern (identifier) @name))
      (catch_clause parameter: (identifier) @name)
    ]`,
  },
  resolveImport(raw, fromFile, root, aliases) {
    // Check aliases first (e.g. @ → src)
    let aliased = false;
    let aliasTargets: string[] | null = null;
    for (const [alias, target] of Object.entries(aliases)) {
      if (raw.startsWith(alias + '/') || raw === alias) {
        // Multiple targets separated by | (monorepo subdirectory aliases)
        aliasTargets = target.includes('|') ? target.split('|') : [target];
        raw = raw.replace(alias, aliasTargets[0]);
        aliased = true;
        break;
      }
    }

    // Skip bare module specifiers (node_modules) — but not alias-resolved paths
    if (!aliased && !raw.startsWith('.') && !raw.startsWith('/')) return null;

    // Alias-resolved paths are root-relative; relative paths resolve from file's dir
    const dir = aliased ? root : dirname(join(root, fromFile));
    const rawBase = join(dir, raw);

    // Strip .js/.jsx/.mjs/.cjs extension — TS convention: `import './foo.js'` → file is `foo.ts`.
    // Also strip an explicit .vue/.ts/.tsx extension if present, so a candidate path isn't built
    // by appending another extension on top of one the import specifier already has
    // (e.g. `import './Foo.vue'` must resolve against `Foo.vue`, not `Foo.vue.ts`/`Foo.vue.vue`).
    const KNOWN_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|vue)$/;
    const base = KNOWN_EXT.test(rawBase) ? rawBase.replace(KNOWN_EXT, '') : rawBase;

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

    // Fallback: try alternative alias targets (monorepo subdirectories)
    if (aliasTargets && aliasTargets.length > 1) {
      const originalRaw = raw.replace(aliasTargets[0], '');
      for (let i = 1; i < aliasTargets.length; i++) {
        const altBase = join(root, aliasTargets[i] + originalRaw);
        const altStripped = KNOWN_EXT.test(altBase) ? altBase.replace(KNOWN_EXT, '') : altBase;
        const altCandidates = [
          altStripped + '.ts', altStripped + '.tsx',
          altStripped + '.js', altStripped + '.jsx',
          altStripped + '.vue',
          join(altStripped, 'index.ts'), join(altStripped, 'index.tsx'),
          join(altStripped, 'index.js'),
        ];
        for (const p of altCandidates) {
          if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
        }
      }
    }
    return null;
  },
};

export default spec;
