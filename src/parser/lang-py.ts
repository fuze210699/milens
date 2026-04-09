import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'python',
  extensions: ['.py'],
  wasmName: 'tree-sitter-python',
  queries: {
    functions: `[
      (module (function_definition name: (identifier) @name) @def)
      (module (decorated_definition definition: (function_definition name: (identifier) @name) @def))
    ]`,
    classes: `[
      (class_definition name: (identifier) @name) @def
      (decorated_definition definition: (class_definition name: (identifier) @name) @def)
    ]`,
    methods: `[
      (class_definition body: (block (function_definition name: (identifier) @name) @def))
      (class_definition body: (block (decorated_definition definition: (function_definition name: (identifier) @name) @def)))
    ]`,
    imports: `[
      (import_from_statement
        module_name: (dotted_name) @source
      ) @def
      (import_statement
        name: (dotted_name) @source
      ) @def
    ]`,
    exports: `(module
      (expression_statement
        (assignment
          left: (identifier) @_all
          right: (list (string (string_content) @name))
        )
      )
    )`,
    calls: `[
      (call function: (identifier) @callee) @def
      (call function: (attribute attribute: (identifier) @callee)) @def
      (decorator (identifier) @callee) @def
      (decorator (call function: (identifier) @callee)) @def
    ]`,
    heritage: `(class_definition
      name: (identifier) @child
      superclasses: (argument_list (identifier) @parent)
    ) @def`,
  },
  resolveImport(raw, fromFile, root, _aliases) {
    // Convert dotted path: models.user → models/user
    const parts = raw.split('.');
    const candidates = [
      join(root, ...parts) + '.py',
      join(root, ...parts, '__init__.py'),
    ];
    // Also try relative to current file
    const fromDir = join(root, fromFile, '..');
    candidates.push(
      join(fromDir, ...parts) + '.py',
      join(fromDir, ...parts, '__init__.py'),
    );
    for (const p of candidates) {
      if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
    }
    return null;
  },
};

export default spec;
