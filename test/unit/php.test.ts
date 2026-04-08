import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from '../../src/core/tree-sitter/loader.js';
import { phpProvider } from '../../src/core/parsers/php.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'sample-php', 'app', 'Models');

describe('PHP Provider', () => {
  let parsed: ReturnType<typeof phpProvider.extract>;

  beforeAll(async () => {
    const source = readFileSync(join(FIXTURES, 'User.php'), 'utf-8');
    const tree = await parseSource(source, 'php');
    parsed = phpProvider.extract(source, 'app/Models/User.php', tree);
  });

  it('should extract namespace as Module', () => {
    const ns = parsed.nodes.find(n => n.label === 'Module');
    expect(ns).toBeDefined();
    expect(ns!.name).toBe('App\\Models');
  });

  it('should extract class declarations', () => {
    const user = parsed.nodes.find(n => n.name === 'User' && n.label === 'Class');
    expect(user).toBeDefined();
    expect(user!.isExported).toBe(true);

    const baseModel = parsed.nodes.find(n => n.name === 'BaseModel' && n.label === 'Class');
    expect(baseModel).toBeDefined();
  });

  it('should extract EXTENDS relationship', () => {
    const extendsEdges = parsed.relationships.filter(r => r.type === 'EXTENDS');
    expect(extendsEdges.length).toBeGreaterThanOrEqual(1);
    // User extends BaseModel
    const userExtends = extendsEdges.find(r => r.sourceId.includes('User'));
    expect(userExtends).toBeDefined();
  });

  it('should extract methods with HAS_METHOD edges', () => {
    const methods = parsed.nodes.filter(n => n.label === 'Method');
    expect(methods.length).toBeGreaterThanOrEqual(4); // __construct, save, find, jsonSerialize, hashPassword

    const hasMethodEdges = parsed.relationships.filter(r => r.type === 'HAS_METHOD');
    expect(hasMethodEdges.length).toBeGreaterThanOrEqual(4);
  });

  it('should extract properties with visibility', () => {
    const props = parsed.nodes.filter(n => n.label === 'Property');
    expect(props.length).toBeGreaterThanOrEqual(3); // name, email, id, password

    // Check visibility
    const privateProp = props.find(n => (n.properties as any)?.visibility === 'private');
    expect(privateProp).toBeDefined();
  });

  it('should extract standalone functions', () => {
    const fn = parsed.nodes.find(n => n.name === 'formatUserName' && n.label === 'Function');
    expect(fn).toBeDefined();
  });

  it('should extract use statements as imports', () => {
    expect(parsed.imports.length).toBeGreaterThanOrEqual(1);
    const authImport = parsed.imports.find(i => i.source.includes('AuthService'));
    expect(authImport).toBeDefined();
  });
});
