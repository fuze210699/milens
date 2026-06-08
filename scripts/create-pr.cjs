/**
 * scripts/create-pr.cjs — Auto-generate/update PR via GitHub API
 *
 * Automatically loads GITHUB_TOKEN from .env file (gitignored).
 * Copy .env.example to .env and set your token.
 *
 * Create PR:
 *   node scripts/create-pr.cjs --branch fix/issue-123 --issue 123
 *   node scripts/create-pr.cjs --branch feat/new --type feat --scope cli
 *
 * Update existing PR with Conventional Commits format:
 *   node scripts/create-pr.cjs --update 5 --issue 123
 *   node scripts/create-pr.cjs --update 5 --branch fix/issue-123
 *
 * Auto-detect:
 *   - Branch from `git branch --show-current` (if not specified)
 *   - Repo from `git remote get-url origin`
 *   - Title/body auto-generated per Conventional Commits v1.0.0
 *   - Changes from git log when no --issue provided
 *
 * Prerequisites:
 *   1. Copy .env.example → .env
 *   2. Set GITHUB_TOKEN=ghp_xxx in .env
 *   3. Token needs `repo` scope
 */

require('dotenv').config();
const { execSync } = require('child_process');
const https = require('https');
const { generatePrPayload, parseArgs } = require('./pr-generator.cjs');

const args = process.argv.slice(2).filter(Boolean);
const parsed = parseArgs(args.join(' '));

for (const key of Object.keys(parsed)) {
  if (!['branch', 'title', 'issue', 'labels', 'type', 'scope', 'changes', 'update'].includes(key)) {
    delete parsed[key];
  }
}

const prNumber = parsed.update || null;
const branch = parsed.branch || (() => {
  try { return exec('git branch --show-current'); } catch { return null; }
})();
const issueNum = parsed.issue ? String(parsed.issue).replace('#', '') : null;

if (!prNumber && !branch) {
  console.error('Error: --branch or --update is required');
  console.error('Usage:');
  console.error('  node scripts/create-pr.cjs --branch fix/issue-123 --issue 123');
  console.error('  node scripts/create-pr.cjs --update <pr-number> --issue 123');
  process.exit(1);
}

function exec(cmd, opts) {
  try {
    return execSync(cmd, { encoding: 'utf8', shell: true, stdio: 'pipe', ...opts }).trim();
  } catch(err) {
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

function checkToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('❌ GITHUB_TOKEN not set.');
    console.error('   Copy .env.example to .env and set your token.');
    process.exit(1);
  }
  return token;
}

function ghApi(method, path, data) {
  return new Promise((resolve, reject) => {
    const token = checkToken();
    const url = new URL(`https://api.github.com${path}`);
    const body = data ? JSON.stringify(data) : null;

    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'milens-create-pr',
        'Content-Type': 'application/json',
      },
    };

    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || `HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        } catch(e) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getIssue(repo, number) {
  return ghApi('GET', `/repos/${repo}/issues/${number}`);
}

async function createPr({ repo, title, body, head, base, labels }) {
  const data = { title, head, base, body, draft: false };
  if (labels && labels.length) data.labels = labels;
  return ghApi('POST', `/repos/${repo}/pulls`, data);
}

async function updatePr({ repo, number, title, body }) {
  return ghApi('PATCH', `/repos/${repo}/pulls/${number}`, { title, body });
}

function detectRepo() {
  if (parsed.repo) return parsed.repo;
  try {
    const remote = exec('git remote get-url origin');
    const match = remote.match(/github\.com[/:]([\w-]+\/[\w.-]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {}
  const repoEnv = process.env.GITHUB_REPO;
  if (repoEnv) return repoEnv;
  throw new Error('Cannot detect repo. Set --repo or GITHUB_REPO env var.');
}

async function main() {
  const repo = detectRepo();
  let base = parsed.base || 'main';

  let issueData = null;
  if (issueNum) {
    console.log(`Fetching issue #${issueNum}...`);
    issueData = await getIssue(repo, issueNum);
    if (!issueData.title) throw new Error(`Issue #${issueNum} not found or inaccessible`);
  }

  if (prNumber) {
    const pr = await ghApi('GET', `/repos/${repo}/pulls/${prNumber}`);
    base = parsed.base || pr.base.ref;
    console.log(`Base branch: ${base}`);
  }

  let changes = parsed.changes || null;
  if (!changes && !issueData && branch) {
    try {
      const compareRef = `origin/${base}..HEAD`;
      const log = exec(`git log ${compareRef} --oneline --no-merges`);
      if (log) {
        changes = log.split('\n').map(l => l.trim()).filter(Boolean);
        console.log(`Auto-detected ${changes.length} commits`);
      }
    } catch {}
  }

  const { title, body, labels: autoLabels, isBreaking } = generatePrPayload({
    branch: branch || '',
    issue: issueData ? { title: issueData.title, body: issueData.body, labels: issueData.labels, number: issueData.number } : null,
    typeOverride: parsed.type || null,
    scopeOverride: parsed.scope || null,
    titleOverride: parsed.title || null,
    changes,
    verification: null,
  });

  const finalLabels = [...new Set([...(parsed.labels || []), ...autoLabels])];

  if (prNumber) {
    console.log(`Updating PR #${prNumber} on ${repo}:`);
    console.log(`  Title:  ${title}`);
    if (isBreaking) console.log(`  ⚠️  Breaking changes detected`);
    if (finalLabels.length) console.log(`  Labels: ${finalLabels.join(', ')}`);

    const pr = await updatePr({ repo, number: prNumber, title, body });
    console.log(`\n✅ PR #${prNumber} updated: ${pr.html_url}`);
  } else {
    console.log(`Creating PR on ${repo}:`);
    console.log(`  Branch: ${branch} → ${base}`);
    console.log(`  Title:  ${title}`);
    if (isBreaking) console.log(`  ⚠️  Breaking changes detected`);
    if (finalLabels.length) console.log(`  Labels: ${finalLabels.join(', ')}`);

    const pr = await createPr({ repo, title, body, head: branch, base, labels: finalLabels });
    console.log(`\n✅ PR created: ${pr.html_url}`);
  }
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});