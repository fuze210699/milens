import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'python',
  extensions: ['.py'],
  wasmName: 'tree-sitter-python',
  allTopLevelExported: true,
  mroStrategy: 'c3',
  importSemantics: 'namespace',
  queries: {
    functions: `[
      (module (function_definition name: (identifier) @name) @def)
      (module (decorated_definition definition: (function_definition name: (identifier) @name) @def))
    ]`,
    classes: `[
      (class_definition name: (identifier) @name) @def
      (decorated_definition definition: (class_definition name: (identifier) @name) @def)
    ]`,
    variables: `(module (expression_statement (assignment left: (identifier) @name))) @def`,
    methods: `[
      (class_definition body: (block (function_definition name: (identifier) @name) @def))
      (class_definition body: (block (decorated_definition definition: (function_definition name: (identifier) @name) @def)))
    ]`,
    imports: `[
      (import_from_statement
        module_name: (dotted_name) @source
      ) @def
      (import_from_statement
        module_name: (relative_import) @source
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
      (call function: (attribute object: (_) @receiver attribute: (identifier) @callee)) @def
      (decorator (identifier) @callee) @def
      (decorator (call function: (identifier) @callee)) @def
    ]`,
    heritage: `(class_definition
      name: (identifier) @child
      superclasses: (argument_list (identifier) @parent)
    ) @def`,
    typeBindings: `[
      (assignment left: (identifier) @var type: (type (identifier) @type))
      (typed_parameter (identifier) @var type: (type (identifier) @type))
      (typed_default_parameter name: (identifier) @var type: (type (identifier) @type))
      (function_definition parameters: (parameters (typed_parameter (identifier) @var type: (type (identifier) @type))))
      (function_definition parameters: (parameters (typed_default_parameter name: (identifier) @var type: (type (identifier) @type))))
    ]`,
    returnTypes: `[
      (function_definition name: (identifier) @name return_type: (type (identifier) @returnType))
      (decorated_definition definition: (function_definition name: (identifier) @name return_type: (type (identifier) @returnType)))
    ]`,
  },
  resolveImport(raw, fromFile, root, _aliases) {
    // Handle relative imports: leading dots
    const dotMatch = raw.match(/^(\.+)(.*)/);
    if (dotMatch) {
      const dots = dotMatch[1].length;
      const rest = dotMatch[2].replace(/^\./, ''); // remove separator dot
      const fromDir = join(root, fromFile, '..');
      let base = fromDir;
      for (let i = 1; i < dots; i++) base = join(base, '..');
      const parts = rest ? rest.split('.') : [];
      const candidates = parts.length > 0
        ? [join(base, ...parts) + '.py', join(base, ...parts, '__init__.py')]
        : [join(base, '__init__.py')];
      for (const p of candidates) {
        if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
      }
      return null;
    }

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
