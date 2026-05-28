import { describe, it, expect } from 'vitest';
import { isTestFile } from '../../src/utils.js';

describe('isTestFile', () => {
  it('returns true for .test.ts', () => {
    expect(isTestFile('src/auth.test.ts')).toBe(true);
  });

  it('returns true for .spec.ts', () => {
    expect(isTestFile('src/auth.spec.ts')).toBe(true);
  });

  it('returns true for .test.jsx', () => {
    expect(isTestFile('src/Component.test.jsx')).toBe(true);
  });

  it('returns true for .spec.jsx', () => {
    expect(isTestFile('src/Component.spec.jsx')).toBe(true);
  });

  it('returns true for .test.js', () => {
    expect(isTestFile('src/utils.test.js')).toBe(true);
  });

  it('returns true for .spec.js', () => {
    expect(isTestFile('src/utils.spec.js')).toBe(true);
  });

  it('returns true for .test.tsx', () => {
    expect(isTestFile('src/Component.test.tsx')).toBe(true);
  });

  it('returns false for regular source file', () => {
    expect(isTestFile('src/auth.ts')).toBe(false);
  });

  it('returns false for regular .jsx file', () => {
    expect(isTestFile('src/Component.jsx')).toBe(false);
  });

  it('returns true for __tests__/auth.test.ts', () => {
    expect(isTestFile('src/__tests__/auth.test.ts')).toBe(true);
  });

  it('returns true for __tests__ directory with .spec file', () => {
    expect(isTestFile('src/__tests__/auth.spec.ts')).toBe(true);
  });

  it('returns true for tests/auth.test.ts', () => {
    expect(isTestFile('tests/auth.test.ts')).toBe(true);
  });

  it('returns true for test/unit/database.test.ts', () => {
    expect(isTestFile('test/unit/database.test.ts')).toBe(true);
  });

  it('returns true for Go test file (_test.go)', () => {
    expect(isTestFile('pkg/auth_test.go')).toBe(true);
  });

  it('returns true for Python test file (test_*.py)', () => {
    expect(isTestFile('test_auth.py')).toBe(true);
  });

  it('returns true for Python _test.py file', () => {
    expect(isTestFile('tests/test_auth.py')).toBe(true);
  });

  it('returns true for Ruby test file (_test.rb)', () => {
    expect(isTestFile('test_user_test.rb')).toBe(true);
  });

  it('returns true for Rust test file (_test.rs)', () => {
    expect(isTestFile('src/lib_test.rs')).toBe(true);
  });

  it('returns true for Java test file (_test.java) in test directory', () => {
    expect(isTestFile('src/test/AuthService_test.java')).toBe(true);
  });

  it('returns true for PHP test file (_test.php) in tests directory', () => {
    expect(isTestFile('tests/AuthService_test.php')).toBe(true);
  });

  it('returns false for non-test file with underscore', () => {
    expect(isTestFile('src/user_profile.ts')).toBe(false);
  });

  it('returns false for .test directory name', () => {
    expect(isTestFile('.test/config.ts')).toBe(false);
  });

  it('returns false for _test suffix in non-matching language', () => {
    expect(isTestFile('src/helper_test.c')).toBe(false);
  });

  it('returns false for test_ prefix on non-Python file', () => {
    expect(isTestFile('test_utils.ts')).toBe(false);
  });
});
