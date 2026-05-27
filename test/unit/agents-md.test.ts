import { describe, it, expect } from 'vitest';
import { generateAgentsMd } from '../../src/agents-md.js';
import { Database } from '../../src/store/db.js';

describe('AGENTS.md Generator', () => {
  it('generates basic AGENTS.md on empty DB', () => {
    const db = new Database(':memory:');
    const md = generateAgentsMd(db, '/test/project');
    expect(md).toContain('# Project:');
    expect(md).toContain('## Codebase Summary');
    expect(md).toContain('## Session Startup');
    expect(md).toContain('codebase_summary');
    db.close();
  });

  it('shows zero symbols on empty DB', () => {
    const db = new Database(':memory:');
    const md = generateAgentsMd(db, '/test/project');
    expect(md).toContain('Symbols: 0');
    db.close();
  });

  it('includes codebase summary stats', () => {
    const db = new Database(':memory:');
    const md = generateAgentsMd(db, '/test/project');
    expect(md).toMatch(/Symbols: \d+/);
    expect(md).toMatch(/Links: \d+/);
    db.close();
  });

  it('includes session startup instructions', () => {
    const db = new Database(':memory:');
    const md = generateAgentsMd(db, '/test/project');
    expect(md).toContain('session_start');
    expect(md).toContain('recall');
    expect(md).toContain('codebase_summary');
    db.close();
  });

  it('includes milens workflows section', () => {
    const db = new Database(':memory:');
    const md = generateAgentsMd(db, '/test/project');
    expect(md).toContain('## Milens Workflows Available');
    expect(md).toContain('/milens:plan');
    expect(md).toContain('/milens:review');
    expect(md).toContain('/milens:tdd');
    expect(md).toContain('/milens:security');
    expect(md).toContain('/milens:refactor');
    db.close();
  });
});
