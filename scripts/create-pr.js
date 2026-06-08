/**
 * scripts/create-pr.js — Auto-generate PR via GitHub API
 *
 * Usage:
 *   node scripts/create-pr.js --branch <branch> [--title "<title>"] [--issue <num>] [--labels l1,l2] [--type feat|fix|docs|...] [--scope <scope>] [--changes "line1\nline2"]
 *   GITHUB_TOKEN=<token> node scripts/create-pr.js --branch fix/issue-123 --issue 123
 *
 * Environment:
 *   GITHUB_TOKEN - GitHub personal access token (required)
 *   GITHUB_REPO  - owner/repo override (default: detected from git remote)
 *
 * Auto-generates:
 *   - Title: Conventional Commits format (<type>(<scope>): <description>)
 *   - Body: 5-section standard with Goal, Issue, Changes, Breaking, Verification
 *
 * Examples:
 *   node scripts/create-pr.js --branch feat/github --title "feat(github): add auto PR"
 *   node scripts/create-pr.js --branch fix/issue-123 --issue 123
 *   node scripts/create-pr.js --branch fix/issue-123 --type feat --scope github
 */

const { execSync } = require('child_process');
const {
  generatePrPayload,
  detectRepo: detectRepoFn,
  parseArgs,
} = require('./pr-generator.js');

const args = process.argv.slice(2).filter(Boolean);
const parsed = parseArgs(args.join(' '));

for (const key of Object.keys(parsed)) {
  if (!['branch', 'title', 'issue', 'labels', 'type', 'scope', 'changes'].includes(key)) {
    delete parsed[key];
  }
}

const branch = parsed.branch;
const issueNum = parsed.issue ? String(parsed.issue).replace('#', '') : null;

if (!branch && !issueNum) {
  console.error('Error: --branch or --issue is required');
  console.error('Usage: node create-pr.js --branch <branch> [--title "..."] [--issue <num>] [--type feat|fix|docs|...] [--scope <scope>] [--labels l1,l2]');
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

  let issueData = null;
  if (issueNum) {
    console.log(`Fetching issue #${issueNum} from ${repo}...`);
    issueData = await getIssue({ repo, number: issueNum });
    if (!issueData.title) {
      throw new Error(`Issue #${issueNum} not found or inaccessible`);
    }
  }

  const { title, body, labels: autoLabels, isBreaking } = generatePrPayload({
    branch,
    issue: issueData ? { title: issueData.title, body: issueData.body, labels: issueData.labels, number: issueData.number } : null,
    typeOverride: parsed.type || null,
    scopeOverride: parsed.scope || null,
    changes: parsed.changes || null,
    verification: null,
  });

  const finalLabels = [...new Set([...(parsed.labels || []), ...autoLabels])];

  console.log(`\nCreating PR on ${repo}:`);
  console.log(`  Branch: ${branch} → ${base}`);
  console.log(`  Title:  ${title}`);
  if (isBreaking) console.log(`  ⚠️  Breaking changes detected`);
  if (finalLabels.length) console.log(`  Labels: ${finalLabels.join(', ')}`);

  const prUrl = await createPr({ repo, title, body, head: branch, base, labels: finalLabels });
  console.log(`\n✅ PR created: ${prUrl}`);

  return prUrl;
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});