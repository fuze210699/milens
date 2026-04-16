import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RepoRegistry } from '../../src/store/registry.js';

const TEST_DIR = join(import.meta.dirname, '..', 'tmp', 'registry-test');
const REGISTRY_FILE = join(TEST_DIR, 'registry.json');

// Monkey-patch homedir for testing — RepoRegistry reads from ~/.milens/registry.json
// Instead, we test the class methods directly with a fresh instance

describe('RepoRegistry', () => {
  let registry: RepoRegistry;

  // We can't easily isolate homedir, so we test via the public API
  // and verify behavior is consistent
  beforeEach(() => {
    registry = new RepoRegistry();
  });

  it('listAll returns an array', () => {
    const entries = registry.listAll();
    expect(Array.isArray(entries)).toBe(true);
  });

  it('register and findByRoot round-trips', () => {
    const testRoot = join(TEST_DIR, 'test-repo-' + Date.now());
    mkdirSync(testRoot, { recursive: true });

    const dbPath = join(testRoot, 'test.db');
    registry.register(testRoot, dbPath, 'hash123');

    const found = registry.findByRoot(testRoot);
    expect(found).toBeDefined();
    expect(found!.hash).toBe('hash123');
    expect(found!.dbPath).toContain('test.db');

    // Cleanup
    registry.remove(testRoot);
  });

  it('register overwrites on same root', () => {
    const testRoot = join(TEST_DIR, 'test-repo-overwrite-' + Date.now());
    mkdirSync(testRoot, { recursive: true });

    const dbPath = join(testRoot, 'test.db');
    registry.register(testRoot, dbPath, 'hash-v1');
    registry.register(testRoot, dbPath, 'hash-v2');

    const found = registry.findByRoot(testRoot);
    expect(found!.hash).toBe('hash-v2');

    // Should not duplicate
    const all = registry.listAll();
    const matches = all.filter(e => e.rootPath.includes('test-repo-overwrite'));
    expect(matches).toHaveLength(1);

    registry.remove(testRoot);
  });

  it('findDbPath returns null for unregistered root', () => {
    const path = registry.findDbPath('/nonexistent/path/xyz');
    expect(path).toBeNull();
  });

  it('remove returns true for existing entry', () => {
    const testRoot = join(TEST_DIR, 'test-repo-remove-' + Date.now());
    mkdirSync(testRoot, { recursive: true });

    const dbPath = join(testRoot, 'test.db');
    registry.register(testRoot, dbPath, 'hash');

    const removed = registry.remove(testRoot);
    expect(removed).toBe(true);
    expect(registry.findByRoot(testRoot)).toBeUndefined();
  });

  it('remove returns false for non-existent entry', () => {
    const removed = registry.remove('/nonexistent/path/xyz');
    expect(removed).toBe(false);
  });
});
