import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'ruby',
  extensions: ['.rb', '.rake'],
  wasmName: 'tree-sitter-ruby',
  allTopLevelExported: true,
  mroStrategy: 'ruby-mixin',
  importSemantics: 'wildcard-leaf',
  isExported: (sym) => !sym.name.startsWith('_'),
  queries: {
    classes: `(class name: (constant) @name) @def`,
    modules: `(module name: (constant) @name) @def`,
    constants: `(assignment left: (constant) @name) @def`,
    variables: `[
      (assignment left: (instance_variable) @name) @def
      (assignment left: (class_variable) @name) @def
    ]`,
    methods: `[
      (method name: (identifier) @name) @def
      (singleton_method name: (identifier) @name) @def
      (call method: (identifier) @_attr arguments: (argument_list (simple_symbol (identifier) @name))) @def
    ]`,
    imports: `(call
      method: (identifier) @_req
      arguments: (argument_list (string (string_content) @source))
    ) @def`,
    calls: `[
      (call method: (identifier) @callee) @def
      (call receiver: (_) @receiver method: (identifier) @callee) @def
    ]`,
    heritage: `[
      (class name: (constant) @child superclass: (superclass (constant) @parent)) @def
      (class name: (constant) @child superclass: (superclass (scope_resolution name: (constant) @parent))) @def
      (class name: (constant) @child body: (body_statement (call method: (identifier) @_inc arguments: (argument_list (constant) @parent)))) @def
      (class name: (constant) @child body: (body_statement (call method: (identifier) @_inc arguments: (argument_list (scope_resolution name: (constant) @parent))))) @def
    ]`,
    typeBindings: `[
      (assignment
        left: (identifier) @var
        right: (call receiver: (constant) @type method: (identifier)))
      (assignment
        left: (instance_variable) @var
        right: (call receiver: (constant) @type method: (identifier)))
      (assignment
        left: (identifier) @var
        right: (call receiver: (scope_resolution name: (constant) @type) method: (identifier)))
    ]`,
  },
  resolveImport(raw, fromFile, root, _aliases) {
    // Relative paths (require_relative)
    if (raw.startsWith('.')) {
      const dir = dirname(join(root, fromFile));
      const candidate = join(dir, raw) + '.rb';
      if (existsSync(candidate)) return relative(root, candidate).replace(/\\/g, '/');
      return null;
    }
    // Absolute paths from load path / Rails conventions
    const candidates = [
      join(root, raw) + '.rb',
      join(root, 'lib', raw) + '.rb',
      join(root, 'app', raw) + '.rb',
    ];
    for (const p of candidates) {
      if (existsSync(p)) return relative(root, p).replace(/\\/g, '/');
    }
    return null;
  },
};

export default spec;
