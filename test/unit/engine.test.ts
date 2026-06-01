import { describe, it, expect } from 'vitest';
import { getCachedTree, clearTreeCache } from '../../src/analyzer/engine.js';

describe('Engine Tree Cache', () => {
  it('getCachedTree returns undefined for unknown path', () => {
    expect(getCachedTree('/nonexistent.ts')).toBeUndefined();
  });

  it('clearTreeCache does not throw when called', () => {
    expect(() => clearTreeCache()).not.toThrow();
  });

  it('clearTreeCache can be called multiple times safely', () => {
    clearTreeCache();
    clearTreeCache();
    // Should not throw
  });

  it('getCachedTree returns undefined after clearing', () => {
    clearTreeCache();
    expect(getCachedTree('any.ts')).toBeUndefined();
  });

  it('tree cache is initially empty on module load', () => {
    clearTreeCache();
    // After clearing, any path should return undefined
    expect(getCachedTree('test.ts')).toBeUndefined();
    expect(getCachedTree('src/main.ts')).toBeUndefined();
  });
});
