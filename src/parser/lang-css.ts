import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'css',
  extensions: ['.css'],
  wasmName: 'tree-sitter-css',
  queries: {
    imports: `(import_statement (string_value) @source) @def`,
    variables: `[
      (declaration (property_name) @name) @def
      (rule_set (selectors (class_selector (class_name) @name))) @def
      (rule_set (selectors (id_selector (id_name) @name))) @def
      (keyframes_statement (keyframes_name) @name) @def
      (media_statement (feature_query (feature_name) @name)) @def
    ]`,
  },
  resolveImport(raw, fromFile, root, aliases) {
    // Strip quotes from CSS string values
    raw = raw.replace(/^['"]|['"]$/g, '');
    // Strip url(...) wrapper
    raw = raw.replace(/^url\(\s*['"]?|['"]?\s*\)$/g, '');

    let aliased = false;
    for (const [alias, target] of Object.entries(aliases)) {
      if (raw.startsWith(alias + '/') || raw === alias) {
        raw = raw.replace(alias, target);
        aliased = true;
        break;
      }
    }

    if (!aliased && !raw.startsWith('.') && !raw.startsWith('/')) return null;
    const base = aliased ? join(root, raw) : join(dirname(join(root, fromFile)), raw);
    if (existsSync(base)) return relative(root, base).replace(/\\/g, '/');
    return null;
  },
};

export default spec;
