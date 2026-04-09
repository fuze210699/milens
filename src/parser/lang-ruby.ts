import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'ruby',
  extensions: ['.rb', '.rake'],
  wasmName: 'tree-sitter-ruby',
  queries: {
    classes: `(class name: (constant) @name) @def`,
    modules: `(module name: (constant) @name) @def`,
    methods: `[
      (method name: (identifier) @name) @def
      (singleton_method name: (identifier) @name) @def
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
