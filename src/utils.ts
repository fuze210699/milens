const TEST_DIR_CODE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|php|rs)$/i;

/** Check if a file path looks like a test/spec file */
export function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    // Directory-based checks (any file under test/, tests/, __tests__/) only
    // count for actual code files — otherwise non-code content that merely
    // lives under a path segment named "test" (vendored docs, fixtures, etc.)
    // gets misdetected as a test file.
    ((/(^|[\/\\])tests?[\/\\]/.test(filePath) || /__tests__[/\\]/.test(filePath)) && TEST_DIR_CODE_EXT_RE.test(filePath)) ||
    /_test\.(go|py|rb|rs|java|php)$/.test(filePath) ||
    /^test_.*\.py$/.test(filePath.split('/').pop() ?? '');
}

/** Convert a glob pattern (supporting `**`, `*`, `?`, `{a,b,c}`) into a fully-escaped RegExp. */
export function globToRegex(glob: string): RegExp {
  const STARSTAR = ' STARSTAR ';
  const PLACEHOLDER = '\x00BRACE';

  // Expand brace expansions {a,b,c} → (?:a|b|c). Only groups containing
  // a comma are treated as expansions; {x} without comma is literal.
  const expansions: string[] = [];
  let expanded = glob;
  // Expand from innermost outward: match brace groups that contain no
  // nested braces but have at least one comma.
  const braceGroupRe = /\{([^{}]*,[^{}]*)\}/;
  let m: RegExpExecArray | null;
  while ((m = braceGroupRe.exec(expanded)) !== null) {
    const parts = m[1].split(',').map(p => p.trim());
    const idx = expansions.length;
    expansions.push(`(?:${parts.join('|')})`);
    expanded = expanded.slice(0, m.index) + `${PLACEHOLDER}${idx}${PLACEHOLDER}` + expanded.slice(m.index + m[0].length);
  }

  // Escape regex specials (placeholders use only \x00, digits, and safe chars)
  const escaped = expanded.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('**').join(STARSTAR)
    .replace(/\*/g, '[^/]*')
    .split(STARSTAR).join('.*')
    .replace(/\?/g, '.');

  // Restore expanded alternations
  let result = escaped;
  for (let i = 0; i < expansions.length; i++) {
    result = result.replace(`${PLACEHOLDER}${i}${PLACEHOLDER}`, expansions[i]);
  }

  return new RegExp(`^${result}$`, 'i');
}
