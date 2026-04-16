/** Check if a file path looks like a test/spec file */
export function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    /(^|[\/\\])tests?[\/\\]/.test(filePath) ||
    /__tests__[/\\]/.test(filePath) ||
    /_test\.(go|py|rb|rs|java|php)$/.test(filePath) ||
    /^test_.*\.py$/.test(filePath.split('/').pop() ?? '');
}
