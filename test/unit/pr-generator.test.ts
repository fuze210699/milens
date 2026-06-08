import { describe, it, expect } from 'vitest';

const {
  generateTitle,
  generateBody,
  generatePrPayload,
  detectTypeFromBranch,
  detectScopeFromBranch,
  detectBreakingFromBranch,
  detectBreakingFromLabels,
  parseArgs,
  slugify,
  VALID_TYPES,
} = await import('../../scripts/pr-generator.cjs');

describe('detectTypeFromBranch', () => {
  it('detects fix type', () => {
    expect(detectTypeFromBranch('fix/issue-123')).toBe('fix');
    expect(detectTypeFromBranch('fix/nested/path')).toBe('fix');
  });

  it('detects feat type', () => {
    expect(detectTypeFromBranch('feat/add-pr-template')).toBe('feat');
    expect(detectTypeFromBranch('feature/new-parser')).toBe('feat');
  });

  it('detects docs type', () => {
    expect(detectTypeFromBranch('docs/update-readme')).toBe('docs');
  });

  it('detects chore type', () => {
    expect(detectTypeFromBranch('chore/cleanup')).toBe('chore');
  });

  it('detects refactor type', () => {
    expect(detectTypeFromBranch('refactor/store')).toBe('refactor');
  });

  it('detects build type', () => {
    expect(detectTypeFromBranch('build/standalone')).toBe('build');
  });

  it('detects ci type', () => {
    expect(detectTypeFromBranch('ci/github-actions')).toBe('ci');
  });

  it('detects test type', () => {
    expect(detectTypeFromBranch('test/add-coverage')).toBe('test');
  });

  it('detects perf type', () => {
    expect(detectTypeFromBranch('perf/optimize')).toBe('perf');
  });

  it('detects revert type', () => {
    expect(detectTypeFromBranch('revert/abc123')).toBe('revert');
  });

  it('detects breaking via !', () => {
    expect(detectTypeFromBranch('feat!')).toBe('feat');
    expect(detectTypeFromBranch('fix!broken')).toBe('fix');
  });

  it('returns null for unrecognized prefix', () => {
    expect(detectTypeFromBranch('random/branch')).toBe(null);
    expect(detectTypeFromBranch('main')).toBe(null);
  });

  it('is case-insensitive', () => {
    expect(detectTypeFromBranch('FIX/issue-123')).toBe('fix');
    expect(detectTypeFromBranch('FEAT/new-feature')).toBe('feat');
  });
});

describe('detectScopeFromBranch', () => {
  it('extracts scope from feat(scope)/ format', () => {
    expect(detectScopeFromBranch('feat(github)/auto-pr')).toBe('github');
    expect(detectScopeFromBranch('fix(cli)/parser')).toBe('cli');
    expect(detectScopeFromBranch('refactor(store)/db')).toBe('store');
  });

  it('extracts scope with dashes', () => {
    expect(detectScopeFromBranch('feat(my-scope)/something')).toBe('my-scope');
  });

  it('returns null for branches without scope', () => {
    expect(detectScopeFromBranch('fix/issue-123')).toBe(null);
    expect(detectScopeFromBranch('feat/add-feature')).toBe(null);
  });

  it('returns null for empty branch', () => {
    expect(detectScopeFromBranch('')).toBe(null);
    expect(detectScopeFromBranch(null as any)).toBe(null);
  });
});

describe('detectBreakingFromBranch', () => {
  it('detects breaking from !', () => {
    expect(detectBreakingFromBranch('feat!')).toBe(true);
    expect(detectBreakingFromBranch('fix!broken')).toBe(true);
  });

  it('detects breaking from keyword', () => {
    expect(detectBreakingFromBranch('feat/breaking-change')).toBe(true);
    expect(detectBreakingFromBranch('fix/breaking')).toBe(true);
  });

  it('returns false for normal branches', () => {
    expect(detectBreakingFromBranch('fix/issue-123')).toBe(false);
    expect(detectBreakingFromBranch('feat/add-feature')).toBe(false);
  });
});

describe('detectBreakingFromLabels', () => {
  it('detects breaking from label names', () => {
    expect(detectBreakingFromLabels(['breaking-change'])).toBe(true);
    expect(detectBreakingFromLabels([{ name: 'breaking' }])).toBe(true);
    expect(detectBreakingFromLabels(['breaking-change', 'bug'])).toBe(true);
  });

  it('returns false for normal labels', () => {
    expect(detectBreakingFromLabels(['bug'])).toBe(false);
    expect(detectBreakingFromLabels(['feature', 'enhancement'])).toBe(false);
    expect(detectBreakingFromLabels([])).toBe(false);
  });
});

describe('slugify', () => {
  it('lowercases text', () => {
    expect(slugify('Some Issue 123')).toBe('some issue 123');
  });

  it('removes brackets and content', () => {
    expect(slugify('[Bug] Parser fails')).toBe('parser fails');
    expect(slugify('[Feature] Add new')).toBe('add new');
  });

  it('removes special characters', () => {
    expect(slugify('resolve @#$%^ issue')).toBe('resolve issue');
  });

  it('trims and collapses spaces', () => {
    expect(slugify('some  issue  123  ')).toBe('some issue 123');
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long, 72).length).toBe(72);
  });

  it('removes leading fix/feature prefix', () => {
    expect(slugify('fix parser error')).toBe('parser error');
    expect(slugify('feature add new')).toBe('add new');
  });
});

describe('parseArgs', () => {
  it('parses branch', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123');
    expect(result.branch).toBe('fix/issue-123');
  });

  it('parses issue number', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123 --issue 456');
    expect(result.issue).toBe(456);
  });

  it('parses title', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123 --title "fix: resolve X"');
    expect(result.title).toBe('fix: resolve X');
  });

  it('parses title without quotes', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123 --title fix-resolve-x');
    expect(result.title).toBe('fix-resolve-x');
  });

  it('parses labels', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123 --labels bug,high-priority');
    expect(result.labels).toEqual(['bug', 'high-priority']);
  });

  it('parses type', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123 --type feat');
    expect(result.type).toBe('feat');
  });

  it('parses scope', () => {
    const result = parseArgs('/milens pr --branch fix/issue-123 --scope github');
    expect(result.scope).toBe('github');
  });

  it('returns empty object for empty input', () => {
    const result = parseArgs('');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('generateTitle', () => {
  it('generates title from branch and issue', () => {
    const title = generateTitle({
      branch: 'fix/issue-123',
      issue: { title: 'Parser fails on empty files' },
    });
    expect(title).toBe('fix: parser fails on empty files');
  });

  it('uses scope from branch', () => {
    const title = generateTitle({
      branch: 'feat(github)/auto-pr',
      issue: { title: 'Add auto PR' },
    });
    expect(title).toBe('feat(github): add auto pr');
  });

  it('overrides type with typeOverride', () => {
    const title = generateTitle({
      branch: 'fix/issue-123',
      issue: { title: 'Parser fails' },
      typeOverride: 'feat',
    });
    expect(title).toBe('feat: parser fails');
  });

  it('overrides scope with scopeOverride', () => {
    const title = generateTitle({
      branch: 'fix/issue-123',
      issue: { title: 'Parser fails' },
      scopeOverride: 'cli',
    });
    expect(title).toBe('fix(cli): parser fails');
  });

  it('defaults to chore if no type detected', () => {
    const title = generateTitle({
      branch: 'random/branch',
      issue: { title: 'Some change' },
    });
    expect(title).toBe('chore: some change');
  });

  it('handles missing issue gracefully', () => {
    const title = generateTitle({
      branch: 'fix/issue-123',
    });
    expect(title).toBe('fix: issue-123');
  });

  it('truncates long titles at 72 chars', () => {
    const longTitle = 'a'.repeat(100);
    const title = generateTitle({
      branch: 'fix/issue-123',
      issue: { title: longTitle },
    });
    expect(title.length).toBeLessThanOrEqual(80);
  });
});

describe('generateBody', () => {
  it('includes all 5 sections', () => {
    const body = generateBody({
      issue: { title: 'Test', body: 'Issue body', number: 123 },
    });
    expect(body).toContain('## 🎯 Goal');
    expect(body).toContain('## 🔗 Issue');
    expect(body).toContain('## ✅ Changes Made');
    expect(body).toContain('## ⚠️ Breaking Changes');
    expect(body).toContain('## 🔍 Verification');
    expect(body).toContain('Fixes #123');
  });

  it('includes changes if provided', () => {
    const body = generateBody({
      issue: { title: 'Test', body: '', number: 123 },
      changes: ['- Fixed X in src/file.ts:45', '- Added Y'],
    });
    expect(body).toContain('- Fixed X in src/file.ts:45');
    expect(body).toContain('- Added Y');
  });

  it('marks breaking as Yes when breakingChange is true', () => {
    const body = generateBody({
      issue: { title: 'Test', body: '', number: 123 },
      breakingChange: true,
    });
    expect(body).toContain('**Yes** — this PR contains breaking changes.');
  });

  it('marks breaking as No when breakingChange is false', () => {
    const body = generateBody({
      issue: { title: 'Test', body: '', number: 123 },
      breakingChange: false,
    });
    expect(body).toContain('**No** — no breaking changes.');
  });

  it('includes PR checklist', () => {
    const body = generateBody({
      issue: { title: 'Test', body: '', number: 123 },
    });
    expect(body).toContain('- [ ] Tests added/updated');
    expect(body).toContain('Milens pre-commit check passed');
  });

  it('handles missing issue body gracefully', () => {
    const body = generateBody({});
    expect(body).toContain('## 🎯 Goal');
    expect(body).toContain('<!-- Describe the goal of this PR -->');
  });
});

describe('generatePrPayload', () => {
  it('generates title, body, labels from branch and issue', () => {
    const payload = generatePrPayload({
      branch: 'fix/issue-123',
      issue: {
        title: 'Parser fails',
        body: 'Steps to reproduce...',
        labels: [{ name: 'bug' }, { name: 'parser' }],
        number: 123,
      },
    });

    expect(payload.title).toBe('fix: parser fails');
    expect(payload.body).toContain('## 🎯 Goal');
    expect(payload.body).toContain('## 🔗 Issue');
    expect(payload.body).toContain('Fixes #123');
    expect(payload.isBreaking).toBe(false);
  });

  it('detects breaking from branch !', () => {
    const payload = generatePrPayload({
      branch: 'feat!/breaking-change',
      issue: { title: 'Test', body: '', labels: [], number: 1 },
    });
    expect(payload.isBreaking).toBe(true);
  });

  it('detects breaking from labels', () => {
    const payload = generatePrPayload({
      branch: 'fix/issue-123',
      issue: {
        title: 'Test',
        body: '',
        labels: [{ name: 'breaking-change' }],
        number: 1,
      },
    });
    expect(payload.isBreaking).toBe(true);
  });

  it('adds bug label for fix type', () => {
    const payload = generatePrPayload({
      branch: 'fix/issue-123',
      issue: { title: 'Test', body: '', labels: [], number: 1 },
    });
    expect(payload.labels).toContain('bug');
  });

  it('adds enhancement label for feat type', () => {
    const payload = generatePrPayload({
      branch: 'feat/add-feature',
      issue: { title: 'Test', body: '', labels: [], number: 1 },
    });
    expect(payload.labels).toContain('enhancement');
  });

  it('uses typeOverride to set label', () => {
    const payload = generatePrPayload({
      branch: 'fix/issue-123',
      issue: { title: 'Test', body: '', labels: [], number: 1 },
      typeOverride: 'feat',
    });
    expect(payload.labels).toContain('enhancement');
  });

  it('preserves non-standard labels from issue', () => {
    const payload = generatePrPayload({
      branch: 'fix/issue-123',
      issue: {
        title: 'Test',
        body: '',
        labels: [{ name: 'needs-review' }],
        number: 1,
      },
    });
    expect(payload.labels).toContain('needs-review');
  });
});