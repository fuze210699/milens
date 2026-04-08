import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from '../../src/core/tree-sitter/loader.js';
import { vueProvider } from '../../src/core/parsers/vue.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'sample-vue', 'src', 'components');

describe('Vue Provider', () => {
  let parsed: ReturnType<typeof vueProvider.extract>;

  beforeAll(async () => {
    const source = readFileSync(join(FIXTURES, 'UserCard.vue'), 'utf-8');
    // For Vue, we parse the script block as TS
    const scriptMatch = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    const scriptContent = scriptMatch?.[1] ?? '';
    const tree = await parseSource(scriptContent, 'typescript');
    parsed = vueProvider.extract(source, 'src/components/UserCard.vue', tree);
  });

  it('should extract Component node', () => {
    const component = parsed.nodes.find(n => n.label === 'Component');
    expect(component).toBeDefined();
    expect(component!.name).toBe('UserCard');
    expect(component!.properties).toHaveProperty('framework', 'vue');
  });

  it('should create DEFINES edge for component', () => {
    const definesEdge = parsed.relationships.find(
      r => r.type === 'DEFINES' && r.targetId.includes('Component')
    );
    expect(definesEdge).toBeDefined();
  });

  it('should extract RENDERS edges from template', () => {
    const renders = parsed.relationships.filter(r => r.type === 'RENDERS');
    expect(renders.length).toBeGreaterThanOrEqual(1);
    // Should find Avatar component usage
    const avatarRenders = renders.find(r => (r.properties as any)?.unresolvedTarget === 'Avatar');
    expect(avatarRenders).toBeDefined();
  });

  it('should extract imports from script block', () => {
    expect(parsed.imports.length).toBeGreaterThanOrEqual(1);
    const avatarImport = parsed.imports.find(i => i.source.includes('Avatar'));
    expect(avatarImport).toBeDefined();
  });

  it('should have a default export', () => {
    const defaultExport = parsed.exports.find(e => e.name === 'default');
    expect(defaultExport).toBeDefined();
  });
});
