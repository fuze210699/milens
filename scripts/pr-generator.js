/**
 * scripts/pr-generator.js — Conventional Commits PR title & body generator
 *
 * Shared module for auto-generating PR titles and bodies following:
 *   - Conventional Commits v1.0.0 (https://www.conventionalcommits.org/)
 *   - Keep a Changelog 1.1.0 (https://keepachangelog.com/)
 *
 * Used by:
 *   - scripts/create-pr.js (standalone CLI)
 *   - apps/github/app.js (GitHub App /milens pr handler)
 *
 * Usage:
 *   const { generateTitle, generateBody, detectTypeFromBranch } = require('./pr-generator.js');
 *   const title = generateTitle({ branch: 'fix/issue-123', issue: { title: 'Parser fails' } });
 *   const body = generateBody({ issue, breakingChange: false });
 */

const VALID_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const TYPE_LABELS = {
  feat: 'Feature',
  fix: 'Bug Fix',
  docs: 'Documentation',
  style: 'Code Style',
  refactor: 'Refactoring',
  perf: 'Performance',
  test: 'Tests',
  build: 'Build',
  ci: 'CI',
  chore: 'Chore',
  revert: 'Revert',
};

function slugify(text, maxLen = 72) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .replace(/^fix\s*/i, '')
    .replace(/^feature\s*/i, '');
}

function detectTypeFromBranch(branch) {
  if (!branch) return null;
  const lower = branch.toLowerCase();

  for (const type of VALID_TYPES) {
    if (lower.startsWith(`${type}/`) || lower.startsWith(`${type}!`) || lower === type) {
      return type;
    }
  }

  const match = branch.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/i);
  return match ? match[1].toLowerCase() : null;
}

function detectBreakingFromBranch(branch) {
  if (!branch) return false;
  return branch.includes('!') || branch.toLowerCase().includes('breaking');
}

function detectBreakingFromLabels(labels) {
  if (!labels || !labels.length) return false;
  const labelNames = Array.isArray(labels) ? labels.map(l => typeof l === 'string' ? l : l.name) : [];
  return labelNames.some(n =>
    n.toLowerCase().includes('breaking') ||
    n.toLowerCase().includes('breaking-change') ||
    n.toLowerCase() === 'breaking'
  );
}

function detectBreakingFromIssue(issue) {
  if (!issue) return false;
  const labels = issue.labels || [];
  if (detectBreakingFromLabels(labels)) return true;

  if (issue.body && /breaking\s*change/i.test(issue.body)) return true;
  if (issue.body && /breaking:\s*yes/i.test(issue.body)) return true;

  return false;
}

function detectScopeFromBranch(branch) {
  if (!branch) return null;

  const match = branch.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\(([^/)]+)\)/i);
  if (match && match[2]) {
    const scope = match[2].toLowerCase().replace(/[^a-z0-9-]/g, '');
    return scope || null;
  }

  return null;
}

function detectScopeFromGitDiff(workDir) {
  return null;
}

function generateTitle({ branch, issue, typeOverride, scopeOverride }) {
  const type = typeOverride || detectTypeFromBranch(branch) || 'chore';
  let scope = scopeOverride || detectScopeFromBranch(branch);

  let description = '';
  if (issue && issue.title) {
    description = slugify(issue.title);
  } else if (branch) {
    const cleanBranch = branch.replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)[\/!]*/i, '');
    description = slugify(cleanBranch);
  }

  if (!description) {
    description = 'update project';
  }

  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${description}`;
}

function generateBody({ issue, changes, breakingChange, verification, type, labels }) {
  const lines = [];

  lines.push('## 🎯 Goal');
  if (issue && issue.title) {
    const cleanTitle = issue.title.replace(/\[.*?\]\s*/g, '').trim();
    lines.push(cleanTitle);
  } else {
    lines.push('<!-- Describe the goal of this PR -->');
  }
  lines.push('');

  lines.push('## 🔗 Issue');
  if (issue && issue.body) {
    lines.push(issue.body);
  } else {
    lines.push('<!-- Link to issue: Fixes #123 -->');
  }
  lines.push('');

  lines.push('## ✅ Changes Made');
  if (changes && changes.length) {
    for (const change of changes) {
      lines.push(`- ${change}`);
    }
  } else {
    lines.push('<!-- List concrete changes: -->');
    lines.push('<!-- - Fixed X in src/file.ts:45 -->');
    lines.push('<!-- - Added Y to src/file.ts -->');
    lines.push('<!-- - Updated tests for... -->');
  }
  lines.push('');

  const isBreaking = breakingChange ||
    (issue && detectBreakingFromIssue(issue)) ||
    (issue && issue.labels && detectBreakingFromLabels(issue.labels)) ||
    detectBreakingFromBranch(issue && issue.body && '');

  lines.push('## ⚠️ Breaking Changes');
  if (isBreaking) {
    lines.push('**Yes** — this PR contains breaking changes.');
    if (issue && issue.body) {
      const breakMatch = issue.body.match(/breaking.*?[:\n](.+?)(?=\n\n|\n--|$)/gi);
      if (breakMatch) {
        lines.push('');
        lines.push('Details:');
        for (const m of breakMatch) {
          lines.push(`- ${m.replace(/^breaking.*?[:\n]/i, '').trim()}`);
        }
      }
    }
  } else {
    lines.push('**No** — no breaking changes.');
  }
  lines.push('');

  lines.push('## 🔍 Verification');
  if (verification) {
    lines.push(verification);
  } else {
    lines.push('<!-- How was this verified? -->');
    lines.push('- [ ] Lint passes: `npm run lint`');
    lines.push('- [ ] Tests pass: `npm test`');
    lines.push('- [ ] Build succeeds: `npm run build`');
  }
  lines.push('');

  lines.push('## 📋 PR Checklist');
  lines.push('- [ ] Tests added/updated');
  lines.push('- [ ] Docs updated (if needed)');
  lines.push('- [ ] No hardcoded numbers or magic strings');
  lines.push('- [ ] Milens pre-commit check passed');
  lines.push('');

  if (issue && issue.number) {
    lines.push(`Fixes #${issue.number}`);
  }

  return lines.join('\n');
}

function generatePrPayload({ branch, issue, typeOverride, scopeOverride, changes, verification, labels }) {
  const breakingFromBranch = detectBreakingFromBranch(branch);
  const breakingFromLabels = issue && detectBreakingFromLabels(issue.labels || []);
  const breakingFromBody = issue && issue.body && /breaking\s*change/i.test(issue.body);
  const isBreaking = breakingFromBranch || breakingFromLabels || breakingFromBody;

  const title = generateTitle({ branch, issue, typeOverride, scopeOverride });
  const body = generateBody({
    issue,
    changes,
    breakingChange: isBreaking,
    verification,
    type: typeOverride || detectTypeFromBranch(branch),
    labels,
  });

  const autoLabels = [];
  if (issue && issue.labels) {
    const labelNames = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
    for (const name of labelNames) {
      if (!['bug', 'feature', 'security'].includes(name.toLowerCase()) && !autoLabels.includes(name)) {
        autoLabels.push(name);
      }
    }
  }

  const effectiveType = typeOverride || detectTypeFromBranch(branch) || 'chore';
  if (!autoLabels.includes(effectiveType)) {
    if (effectiveType === 'fix') autoLabels.push('bug');
    if (effectiveType === 'feat') autoLabels.push('enhancement');
  }

  return { title, body, labels: autoLabels, isBreaking };
}

function parseArgs(commentBody) {
  const result = {};

  const branchMatch = commentBody.match(/--branch\s+(\S+)/);
  if (branchMatch) result.branch = branchMatch[1];

  const titleMatch = commentBody.match(/--title\s+"([^"]+)"/) || commentBody.match(/--title\s+(\S.+)/);
  if (titleMatch) result.title = titleMatch[1];

  const issueMatch = commentBody.match(/--issue\s+(\d+)/);
  if (issueMatch) result.issue = parseInt(issueMatch[1]);

  const labelsMatch = commentBody.match(/--labels\s+(.+)/);
  if (labelsMatch) result.labels = labelsMatch[1].split(',').map(l => l.trim()).filter(Boolean);

  const typeMatch = commentBody.match(/--type\s+(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/i);
  if (typeMatch) result.type = typeMatch[1].toLowerCase();

  const scopeMatch = commentBody.match(/--scope\s+(\S+)/);
  if (scopeMatch) result.scope = scopeMatch[1];

  const changesMatch = commentBody.match(/--changes\s+(.+?)(?=--|$)/s);
  if (changesMatch) result.changes = changesMatch[1].split('\n').map(l => l.trim()).filter(Boolean);

  return result;
}

module.exports = {
  generateTitle,
  generateBody,
  generatePrPayload,
  detectTypeFromBranch,
  detectScopeFromBranch,
  detectBreakingFromBranch,
  detectBreakingFromLabels,
  detectBreakingFromIssue,
  parseArgs,
  VALID_TYPES,
  TYPE_LABELS,
  slugify,
};