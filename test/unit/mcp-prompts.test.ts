import { describe, it, expect } from 'vitest';
import { MILENS_PROMPT_NAMES, registerAllPrompts } from '../../src/server/mcp-prompts.js';

describe('MILENS_PROMPT_NAMES', () => {
  it('contains all 6 prompt names', () => {
    expect(MILENS_PROMPT_NAMES).toHaveLength(6);
    expect(MILENS_PROMPT_NAMES).toContain('milens-planner');
    expect(MILENS_PROMPT_NAMES).toContain('milens-reviewer');
    expect(MILENS_PROMPT_NAMES).toContain('milens-tester');
    expect(MILENS_PROMPT_NAMES).toContain('milens-architect');
    expect(MILENS_PROMPT_NAMES).toContain('milens-security');
    expect(MILENS_PROMPT_NAMES).toContain('milens-debugger');
  });

  it('has names in expected order', () => {
    expect(MILENS_PROMPT_NAMES).toEqual([
      'milens-planner',
      'milens-reviewer',
      'milens-tester',
      'milens-architect',
      'milens-security',
      'milens-debugger',
    ]);
  });
});

describe('registerAllPrompts', () => {
  it('calls server.prompt for each prompt name', () => {
    const calls: Array<{ name: string; description: string }> = [];
    const mockServer = {
      prompt: (name: string, description: string, _args: unknown, _handler: unknown) => {
        calls.push({ name, description });
      },
    };

    registerAllPrompts(mockServer as any);

    expect(calls).toHaveLength(6);
    const names = calls.map(c => c.name);
    expect(names).toEqual(MILENS_PROMPT_NAMES);
  });

  it('registers prompts with non-empty descriptions', () => {
    const calls: Array<{ name: string; description: string }> = [];
    const mockServer = {
      prompt: (name: string, description: string, _args: unknown, _handler: unknown) => {
        calls.push({ name, description });
      },
    };

    registerAllPrompts(mockServer as any);

    for (const call of calls) {
      expect(call.description.length).toBeGreaterThan(0);
    }
  });

  it('does not throw when called with a valid server', () => {
    const mockServer = {
      prompt: () => {},
    };

    expect(() => registerAllPrompts(mockServer as any)).not.toThrow();
  });
});
