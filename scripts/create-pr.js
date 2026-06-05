/**
 * scripts/create-pr.js — Auto-generate PR via GitHub API
 *
 * Usage:
 *   node scripts/create-pr.js --branch <branch> --title "<title>" --body "<body>" [--labels label1,label2] [--repo owner/repo] [--base main]
 *   GITHUB_TOKEN=<token> node scripts/create-pr.js --issue <issue-number> --branch <branch>
 *
 * Environment:
 *   GITHUB_TOKEN - GitHub personal access token (required)
 *   GITHUB_REPO  - owner/repo override (default: detected from git remote)
 *
 * Examples:
 *   node scripts/create-pr.js --branch feature/x --title "feat: add X" --body "## Goal\n- Add X"
 *   node scripts/create-pr.js --branch fix/y --title "fix: Y" --issue 123
 */

const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const args = process.argv.slice(2).filter(Boolean);
const parsed = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (['--branch', '--title', '--body', '--repo', '--base', '--issue'].includes(arg)) {
    const key = arg.replace('--', '');
    parsed[key] = args[++i] || true;
  } else if (arg.startsWith('--')) {
    parsed[arg.slice(2)] = args[++i] || true;
  }
}

const branch = parsed.branch;
const issueNum = parsed.issue ? String(parsed.issue).replace('#', '') : null;

if (!branch && !issueNum) {
  console.error('Error: --branch or --issue is required');
  console.error('Usage: node create-pr.js --branch <branch> [--title "..."] [--body "..."] [--labels l1,l2] [--repo owner/repo] [--base main]');
  console.error('       node create-pr.js --issue <number> --branch <branch> [--title "..."] [--labels l1,l2] [--repo owner/repo] [--base main]');
  process.exit(1);
}

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', shell: true, stdio: 'pipe', ...opts }).trim();
  } catch (err) {
    throw new Error(`Command failed: ${cmd}\n${err.stderr}`);
  }
}

function detectRepo() {
  if (parsed.repo) return parsed.repo;
  try {
    const remote = exec('git remote get-url origin');
    const match = remote.match(/github\.com[/:]([\w-]+\/[\w.-]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {}
  const repoEnv = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY;
  if (repoEnv) return repoEnv;
  throw new Error('Cannot detect repo. Set --repo or GITHUB_REPO env var.');
}

async function createPr({ repo, title, body, head, base, labels }) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var is required');

  const url = `https://api.github.com/repos/${repo}/pulls`;
  const data = { title, head, base, body, draft: false };
  if (labels && labels.length) data.labels = labels;

  const curlCmd = [
    'curl', '-s', '-X', 'POST',
    '-H', `Authorization: token ${token}`,
    '-H', 'Accept: application/vnd.github.v3+json',
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify(data).replace(/"/g, '\\"'),
    url,
  ];

  const result = exec(curlCmd.join(' '));
  const json = JSON.parse(result);

  if (json.url) {
    return json.html_url || json.url;
  }
  throw new Error(`PR creation failed: ${json.message || JSON.stringify(json)}`);
}

async function getIssue({ repo, number }) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var is required');

  const url = `https://api.github.com/repos/${repo}/issues/${number}`;
  const result = exec(`curl -s -H "Authorization: token ${token}" -H "Accept: application/vnd.github.v3+json" "${url}"`);
  return JSON.parse(result);
}

async function main() {
  const repo = detectRepo();
  const base = parsed.base || 'main';
  let title = parsed.title || '';
  let body = parsed.body || '';
  const labels = parsed.labels
    ? String(parsed.labels).split(',').map(l => l.trim()).filter(Boolean)
    : [];

  if (issueNum) {
    console.log(`Fetching issue #${issueNum} from ${repo}...`);
    const issue = await getIssue({ repo, number: issueNum });
    if (issue.title) {
      title = title || `Fix: ${issue.title}`;
      body = body || `Fixes #${issueNum}\n\n## Issue\n${issue.body || '(no description)'}\n\n---\n\n## Goal\n<!-- Describe the goal of this PR -->\n\n## Changes Made\n<!-- List the changes -->\n\n## Verification\n<!-- How was this verified -->`;
      if (issue.labels) {
        const labelNames = issue.labels.map(l => l.name).filter(n => !['bug', 'feature', 'security'].includes(n));
        if (labelNames.length) labels.push(...labelNames);
      }
    } else {
      throw new Error(`Issue #${issueNum} not found or inaccessible`);
    }
  }

  if (!title) {
    console.error('Error: --title is required when not using --issue');
    process.exit(1);
  }

  console.log(`\nCreating PR on ${repo}:`);
  console.log(`  Branch: ${branch} → ${base}`);
  console.log(`  Title:  ${title}`);
  if (labels.length) console.log(`  Labels: ${labels.join(', ')}`);

  const prUrl = await createPr({ repo, title, body, head: branch, base, labels });
  console.log(`\n✅ PR created: ${prUrl}`);

  return prUrl;
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});