import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { scanFiles } from '../../src/analyzer/scanner.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('Scanner', () => {
  it('finds TypeScript files in ts-project', () => {
    const files = scanFiles(join(FIXTURES, 'ts-project'));
    const paths = files.map(f => f.relativePath);
    expect(paths).toContain('src/models.ts');
    expect(paths).toContain('src/auth.ts');
  });

  it('finds Python files in py-project', () => {
    const files = scanFiles(join(FIXTURES, 'py-project'));
    const paths = files.map(f => f.relativePath);
    expect(paths).toContain('models.py');
    expect(paths).toContain('service.py');
  });

  it('finds Go files in go-project', () => {
    const files = scanFiles(join(FIXTURES, 'go-project'));
    const paths = files.map(f => f.relativePath);
    expect(paths).toContain('models/user.go');
    expect(paths).toContain('service/handler.go');
  });

  it('skips node_modules and hidden directories', () => {
    const files = scanFiles(join(FIXTURES, 'ts-project'));
    for (const f of files) {
      expect(f.relativePath).not.toContain('node_modules');
      expect(f.relativePath).not.toMatch(/^\./);
    }
  });
});
