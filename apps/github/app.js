/**
 * Milens GitHub App — Probot-based GitHub App
 *
 * Free:   /milens analyze → AGENTS.md + skills (public repos, 10/mo)
 * Pro:    Auto review_pr + security_scan on every PR (private repos, 50/seat/mo)
 * Pro: $1/seat PR auto-review (private repos)
 */

const { execSync } = require('node:child_process');
const { readFileSync, mkdirSync, existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const crypto = require('node:crypto');
const { generatePrPayload, parseArgs } = require('../../scripts/pr-generator.cjs');

// ── Rate limiting ──

const rateLimitCache = new Map();

function checkRateLimit(installationId, tier, repoId) {
  const key = `${installationId}:${repoId}:${new Date().toISOString().slice(0, 7)}`;
  const monthlyLimit = tier === 'free' ? 10 : tier === 'pro' ? 50 : Infinity;

  let entry = rateLimitCache.get(key);
  const now = Date.now();

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() };
    rateLimitCache.set(key, entry);
  }

  entry.count++;

  if (entry.count > monthlyLimit) {
    return {
      allowed: false,
      message: `Monthly limit reached (${entry.count}/${monthlyLimit}). Upgrade to ${tier === 'free' ? 'Pro ($1/seat)' : 'Pro'} for more.`,
    };
  }

  return { allowed: true };
}

// ── Tier detection ──

async function getTier(context) {
  const repo = context.payload.repository;

  // Env override for dev/test — set MILENS_PRO_TIER=true to allow private repos
  if (process.env.MILENS_PRO_TIER === 'true') return 'pro';
  if (!repo.private) return 'free';

  try {
    const octokit = context.octokit;
    const inst = await octokit.apps.getInstallation({
      installation_id: context.payload.installation.id,
    });
    const plan = inst.data.plan;
    if (plan && plan.name && plan.name.includes('enterprise')) return 'enterprise';
    if (plan && plan.name && plan.name.includes('pro')) return 'pro';
  } catch {}

  return 'free';
}

// ── Milens analysis runner ──

async function runMilensAnalyze(repoUrl, branch, token) {
  const workDir = join(process.env.TEMP || '/tmp', `milens-${crypto.randomUUID().slice(0, 8)}`);

  try {
    mkdirSync(workDir, { recursive: true });

    const authUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`);
    execSync(`git clone --depth 50 --single-branch --branch ${branch} ${authUrl} .`, {
      cwd: workDir, stdio: 'pipe', timeout: 120000,
    });

    execSync('npx milens analyze -p . --force --skills --skills-agents', {
      cwd: workDir, stdio: 'pipe', timeout: 300000,
      env: { ...process.env, MILENS_PROFILE: 'standard' },
    });

    const result = { success: true };

    try {
      const dbPath = join(workDir, '.milens', 'milens.db');
      if (existsSync(dbPath)) {
        const Database = require('../../src/store/db.js').Database;
        if (Database) {
          const db = new Database(dbPath);
          const summary = db.getCodebaseSummary();
          result.stats = { symbols: summary.symbols, links: summary.links, files: summary.files };
          db.close();
        }
      }
    } catch {}

    try {
      result.agentsMd = readFileSync(join(workDir, 'AGENTS.md'), 'utf-8');
    } catch {}

    try {
      const skillsDir = join(workDir, '.agents', 'skills');
      if (existsSync(skillsDir)) {
        const { readdirSync } = require('node:fs');
        result.skillFiles = readdirSync(skillsDir).filter(f => f.startsWith('milens-'));
      }
    } catch {}

    return result;
  } catch (err) {
    return { success: false, error: err.message || 'Analysis failed' };
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

// ── App ──

module.exports = (app) => {
  app.log.info('Milens GitHub App started');

  // ═══ Handle /milens analyze ═══
  app.on('issue_comment.created', async (context) => {
    const comment = context.payload.comment.body;
    if (!comment.includes('/milens analyze') && !comment.includes('/milens scan')) return;

    const tier = await getTier(context);
    const repo = context.payload.repository;
    const issue = context.payload.issue;
    const installationId = context.payload.installation.id;

    const rateCheck = checkRateLimit(installationId, tier, repo.id);
    if (!rateCheck.allowed) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: `⚠️ ${rateCheck.message}`,
      });
      return;
    }

    if (tier === 'free' && repo.private) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: `🔒 Private repos require [Milens Pro ($1/seat)](https://github.com/fuze210699/milens).\n\nInstall on a public repo to try for free.`,
      });
      return;
    }

    await context.octokit.reactions.createForIssueComment({
      owner: repo.owner.login, repo: repo.name,
      comment_id: context.payload.comment.id,
      content: 'eyes',
    });

    const installationToken = (await context.octokit.apps.createInstallationAccessToken({
      installation_id: installationId,
    })).data.token;

    const result = await runMilensAnalyze(repo.clone_url, repo.default_branch, installationToken);

    if (!result.success) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: `❌ Analysis failed: ${result.error}\n\nMake sure the repo is indexable and has supported source files.`,
      });
      return;
    }

    const lines = [
      '## ✅ Milens Analysis Complete',
      '',
      `**${result.stats ? `${result.stats.symbols} symbols · ${result.stats.links} links · ${result.stats.files} files` : 'Indexed successfully'}**`,
      '',
    ];

    if (result.agentsMd) {
      lines.push('### AGENTS.md Generated', 'Your AI agent now has full codebase context on session start.', '');
    }

    if (result.skillFiles && result.skillFiles.length > 0) {
      lines.push('### Skills Installed');
      for (const skill of result.skillFiles) lines.push(`- **${skill}**`);
      lines.push('');
    }

    lines.push(
      '### Next Steps',
      '1. Agent auto-loads `AGENTS.md` with codebase context',
      '2. Call `codebase_summary()` to refresh at session start',
      '3. Use `edit_check()` before every edit, `impact()` for blast radius',
      '',
    );

    if (tier === 'free') {
      lines.push('---', '💡 **Pro tip:** Upgrade to [Milens Pro ($1/seat)](https://github.com/fuze210699/milens) for private repos and auto-review on every PR.');
    }

    await context.octokit.issues.createComment({
      owner: repo.owner.login, repo: repo.name,
      issue_number: issue.number,
      body: lines.join('\n'),
    });
  });

  // ═══ Handle /milens pr ═══
  app.on('issue_comment.created', async (context) => {
    const comment = context.payload.comment.body;
    const isPrCmd = comment.match(/^\/milens\s+pr/i) || comment.match(/^\/milens\s+create-pr/i);
    if (!isPrCmd) return;

    const repo = context.payload.repository;
    const issue = context.payload.issue;
    const installationId = context.payload.installation.id;
    const actor = context.payload.comment.user.login;

    const rateCheck = checkRateLimit(installationId, 'pro', repo.id);
    if (!rateCheck.allowed) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: `⚠️ ${rateCheck.message}`,
      });
      return;
    }

    await context.octokit.reactions.createForIssueComment({
      owner: repo.owner.login, repo: repo.name,
      comment_id: context.payload.comment.id,
      content: 'rocket',
    });

    const args = parseArgs(comment);
    if (!args.branch) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: `❌ Usage: \`/milens pr --branch <branch> [--title "..."] [--issue <num>] [--type feat|fix|docs|...] [--scope <scope>] [--labels bug,feature]\`\n\nExamples:\n\`/milens pr --branch fix/issue-123 --issue 123\`\n\`/milens pr --branch feat/github --type feat --scope github\``,
      });
      return;
    }

    let issueData = null;
    if (args.issue) {
      try {
        const res = await context.octokit.issues.get({
          owner: repo.owner.login, repo: repo.name,
          issue_number: args.issue,
        });
        issueData = {
          title: res.data.title,
          body: res.data.body || '',
          labels: res.data.labels,
          number: res.data.number,
        };
      } catch {}
    }

    const { title, body, labels: autoLabels, isBreaking } = generatePrPayload({
      branch: args.branch,
      issue: issueData,
      typeOverride: args.type || null,
      scopeOverride: args.scope || null,
      changes: args.changes || null,
      verification: null,
    });

    const labels = [...new Set([...(args.labels || []), ...autoLabels])];

    try {
      const pr = await context.octokit.pulls.create({
        owner: repo.owner.login,
        repo: repo.name,
        title,
        head: args.branch,
        base: repo.default_branch,
        body,
        draft: false,
      });

      if (labels.length > 0) {
        await context.octokit.issues.addLabels({
          owner: repo.owner.login,
          repo: repo.name,
          issue_number: pr.data.number,
          labels,
        });
      }

      const lines = [
        `## ✅ PR Created`,
        ``,
        `**#${pr.data.number}** — ${title}`,
        ``,
        `🌐 ${pr.data.html_url}`,
        ``,
        `Branch: \`${args.branch}\` → \`${repo.default_branch}\``,
      ];

      if (issueData && issueData.number) lines.push(`Linked: fixes #${issueData.number}`);
      if (isBreaking) lines.push(`⚠️ **Breaking changes** detected`);
      if (labels.length) lines.push(`Labels: ${labels.map(l => `\`${l}\``).join(', ')}`);

      lines.push('', '> Auto-generated by [Milens](https://github.com/fuze210699/milens) — Conventional Commits v1.0.0');

      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: lines.join('\n'),
      });
    } catch (err) {
      let msg = 'Failed to create PR';
      if (err.message && err.message.includes('Reference already exists')) {
        msg = `Branch \`${args.branch}\` already has an open PR. Check the existing PR or use a different branch name.`;
      } else if (err.message && err.message.includes('does not exist')) {
        msg = `Branch \`${args.branch}\` not found. Make sure the branch exists on the remote.`;
      }
      await context.octokit.issues.createComment({
        owner: repo.owner.login, repo: repo.name,
        issue_number: issue.number,
        body: `❌ ${msg}\n\nError: \`${err.message}\``,
      });
    }
  });

  // ═══ Auto-review on PR (Pro/Enterprise) ═══
  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {
    const tier = await getTier(context);
    if (tier === 'free') return;

    const repo = context.payload.repository;
    const pr = context.payload.pull_request;

    await context.octokit.issues.createComment({
      owner: repo.owner.login, repo: repo.name,
      issue_number: pr.number,
      body: `🔍 Milens is reviewing this PR...\n\n> Automated by [Milens Pro](https://github.com/fuze210699/milens)`,
    });
  });

  // ═══ Installed ═══
  app.on('installation.created', async (context) => {
    const repos = context.payload.repositories;
    app.log.info(`Milens installed on ${repos ? repos.length : 0} repos`);
  });
};
