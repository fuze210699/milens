import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'java',
  extensions: ['.java'],
  wasmName: 'tree-sitter-java',
  mroStrategy: 'first-wins',
  importSemantics: 'named',
  queries: {
    classes: `[
      (class_declaration name: (identifier) @name) @def
      (record_declaration name: (identifier) @name) @def
    ]`,
    interfaces: `(interface_declaration name: (identifier) @name) @def`,
    methods: `[
      (method_declaration name: (identifier) @name) @def
      (constructor_declaration name: (identifier) @name) @def
    ]`,
    enums: `(enum_declaration name: (identifier) @name) @def`,
    imports: `[
      (import_declaration (scoped_identifier) @source) @def
      (import_declaration "static" (scoped_identifier) @source) @def
    ]`,
    calls: `[
      (method_invocation
        object: (_) @receiver
        name: (identifier) @callee
      ) @def
      (method_invocation
        name: (identifier) @callee
      ) @def
      (object_creation_expression type: (type_identifier) @callee) @def
      (marker_annotation name: (identifier) @callee) @def
      (annotation name: (identifier) @callee) @def
    ]`,
    variables: `(field_declaration declarator: (variable_declarator name: (identifier) @name)) @def`,
    heritage: `[
      (class_declaration
        name: (identifier) @child
        (superclass (type_identifier) @parent)
      ) @def
      (class_declaration
        name: (identifier) @child
        (super_interfaces (type_list (type_identifier) @parent))
      ) @def
    ]`,
    exports: `[
      (class_declaration (modifiers "public") name: (identifier) @name)
      (class_declaration (modifiers "public" "static") name: (identifier) @name)
      (class_declaration (modifiers "public" "abstract") name: (identifier) @name)
      (interface_declaration (modifiers "public") name: (identifier) @name)
      (enum_declaration (modifiers "public") name: (identifier) @name)
      (record_declaration (modifiers "public") name: (identifier) @name)
      (method_declaration (modifiers "public") name: (identifier) @name)
    ]`,
  },
  resolveImport(raw, _fromFile, root, _aliases) {
    // Java: com.example.Foo → com/example/Foo.java
    const parts = raw.split('.');
    const candidate = join(root, ...parts) + '.java';
    if (existsSync(candidate)) return relative(root, candidate).replace(/\\/g, '/');
    // Try searching in common source directories
    for (const srcDir of ['src', 'src/main/java']) {
      const p = join(root, srcDir, ...parts) + '.java';
      if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
    }
    return null;
  },
};

export default spec;
