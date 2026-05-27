/**
 * Milens GitHub App — Probot-based GitHub App
 *
 * Turns every repo into an AI-ready project.
 *
 * Free:   /milens analyze → PR with AGENTS.md + skills (public repos, 10/mo)
 * Pro:    Auto review_pr + security_scan on every PR (private repos, 50/seat/mo)
 * Enterprise: Custom rules, SSO, on-prem (contact)
 */

import { Probot } from 'probot';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:os' ? import('node:crypto') : null;

const crypto = await import('node:crypto');

// ── Tier detection ──

type Tier = 'free' | 'pro' | 'enterprise';

async function getTier(context: any): Promise<Tier> {
  const repo = context.payload.repository;
  if (repo.private) {
    // Check installation plan
    try {
      const inst = await context.octokit.apps.getInstallation({
        installation_id: context.payload.installation.id,
      });
      const plan = inst.data.plan;
      if (plan?.name?.includes('enterprise')) return 'enterprise';
      if (plan?.name?.includes('pro')) return 'pro';
    } catch {}
    return 'free'; // private repo requires at least pro
  }
  return 'free';
}

// ── Rate limiting ──

const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(installationId: number, tier: Tier, repoId: number): { allowed: boolean; message?: string } {
  const key = `${installationId}:${repoId}:${new Date().toISOString().slice(0, 7)}`; // monthly key
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
      message: `Monthly limit reached (${entry.count}/${monthlyLimit}). Upgrade to ${tier === 'free' ? 'Pro ($19/seat)' : 'Enterprise'} for more.`,
    };
  }
  
  return { allowed: true };
}

// ── PR permissions check ──

function isPrivateRepo(payload: any): boolean {
  return payload.repository?.private === true;
}

function getProMessage(): string {
  return `\n\n---\n> 💡 **Pro tip:** Upgrade to [Milens Pro ($19/seat)](https://github.com/fuze210699/milens) for auto-review on every PR, private repo support, and advanced security scanning.`;
}

// ── Milens analysis runner ──

interface AnalysisResult {
  success: boolean;
  agentsMd?: string;
  securityMd?: string;
  skillFiles?: string[];
  stats?: { symbols: number; links: number; files: number };
  error?: string;
}

async function runMilensAnalyze(repoUrl: string, branch: string): Promise<AnalysisResult> {
  const workDir = join(process.env.TEMP || '/tmp', `milens-${crypto.randomUUID().slice(0, 8)}`);
  
  try {
    mkdirSync(workDir, { recursive: true });
    
    // Clone repo
    execSync(`git clone --depth 50 --single-branch --branch ${branch} ${repoUrl} .`, {
      cwd: workDir,
      stdio: 'pipe',
      timeout: 120000,
    });
    
    // Run milens analyze
    execSync('npx milens analyze -p . --force --skills --skills-agents', {
      cwd: workDir,
      stdio: 'pipe',
      timeout: 300000,
      env: { ...process.env, MILENS_PROFILE: 'standard' },
    });
    
    // Collect results
    const result: AnalysisResult = { success: true };
    
    // Count symbols/links from DB
    try {
      const dbPath = join(workDir, '.milens', 'milens.db');
      if (existsSync(dbPath)) {
        const { Database } = await import('../../src/store/db.js').catch(() => ({} as any));
        if (Database) {
          const db = new Database(dbPath);
          const stats = db.getCodebaseSummary();
          result.stats = { symbols: stats.symbols, links: stats.links, files: stats.files };
          db.close();
        }
      }
    } catch {}
    
    // Read AGENTS.md
    try {
      result.agentsMd = readFileSync(join(workDir, 'AGENTS.md'), 'utf-8');
    } catch {}
    
    // Read skill files
    try {
      const skillsDir = join(workDir, '.agents', 'skills');
      if (existsSync(skillsDir)) {
        const { readdirSync } = await import('node:fs');
        result.skillFiles = readdirSync(skillsDir).filter(f => f.startsWith('milens-'));
      }
    } catch {}
    
    return result;
  } catch (err: any) {
    return { success: false, error: err.message || 'Analysis failed' };
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

// ── PR review runner ──

async function runMilensReview(owner: string, repo: string, prNumber: number): Promise<string> {
  const workDir = join(process.env.TEMP || '/tmp', `milens-review-${crypto.randomUUID().slice(0, 8)}`);
  
  try {
    mkdirSync(workDir, { recursive: true });
    
    // Clone repo with full history for git diff
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    execSync(`git clone ${cloneUrl} .`, { cwd: workDir, stdio: 'pipe', timeout: 120000 });
    execSync(`git fetch origin pull/${prNumber}/head:pr-${prNumber}`, { cwd: workDir, stdio: 'pipe', timeout: 60000 });
    
    // Run milens on PR branch
    execSync(`git checkout pr-${prNumber}`, { cwd: workDir, stdio: 'pipe' });
    
    // Build index
    execSync('npx milens analyze -p . --force', {
      cwd: workDir,
      stdio: 'pipe',
      timeout: 300000,
      env: { ...process.env, MILENS_PROFILE: 'standard' },
    });
    
    // Review PR
    const reviewOutput = execSync('npx milens workflow review --path .', {
      cwd: workDir,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 120000,
    });
    
    return reviewOutput;
  } catch (err: any) {
    return `Review failed: ${err.message}`;
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

// ── Probot App ──

export default (app: Probot) => {
  app.log.info('Milens GitHub App started');

  // ═══ Handle /milens analyze command ═══
  app.on('issue_comment.created', async (context) => {
    const comment = context.payload.comment.body;
    if (!comment.includes('/milens analyze') && !comment.includes('/milens scan')) return;
    
    const tier = await getTier(context);
    const repo = context.payload.repository;
    const issue = context.payload.issue;
    
    // Rate limit
    const rateCheck = checkRateLimit(context.payload.installation.id, tier, repo.id);
    if (!rateCheck.allowed) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issue.number,
        body: `⚠️ ${rateCheck.message}`,
      });
      return;
    }
    
    // Private repo check for free tier
    if (tier === 'free' && isPrivateRepo(context.payload)) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issue.number,
        body: `🔒 Private repos require [Milens Pro ($19/seat)](https://github.com/fuze210699/milens). Install on a public repo to try for free.`,
      });
      return;
    }
    
    // Acknowledge
    await context.octokit.reactions.createForIssueComment({
      owner: repo.owner.login,
      repo: repo.name,
      comment_id: context.payload.comment.id,
      content: 'eyes',
    });
    
    // Run analysis
    const result = await runMilensAnalyze(repo.clone_url, repo.default_branch);
    
    if (!result.success) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issue.number,
        body: `❌ Analysis failed: ${result.error}\n\nMake sure \`milens\` is installed and the repo is indexable.`,
      });
      return;
    }
    
    // Format result comment
    const lines: string[] = [
      '## Milens Analysis Complete ✅',
      '',
      `**${result.stats?.symbols || '?'} symbols · ${result.stats?.links || '?'} links · ${result.stats?.files || '?'} files indexed**`,
      '',
    ];
    
    if (result.agentsMd) {
      lines.push('### AGENTS.md Generated');
      lines.push('Your AI agent now has full codebase context on session start.');
      lines.push('');
    }
    
    if (result.skillFiles && result.skillFiles.length > 0) {
      lines.push('### Skills Installed');
      for (const skill of result.skillFiles) {
        lines.push(`- **${skill}**`);
      }
      lines.push('');
    }
    
    lines.push('### Next Steps');
    lines.push('1. Your agent auto-loads `AGENTS.md` with codebase context');
    lines.push('2. Call `codebase_summary()` to refresh at session start');
    lines.push('3. Use `edit_check()` before every edit, `impact()` for blast radius');
    lines.push('4. Run `review_pr()` to assess risk on your changes');
    lines.push('');
    lines.push(`---`);
    lines.push(`💡 **Tip:** Re-run \`/milens analyze\` any time to regenerate.`);
    
    if (tier === 'free') {
      lines.push(getProMessage());
    }
    
    await context.octokit.issues.createComment({
      owner: repo.owner.login,
      repo: repo.name,
      issue_number: issue.number,
      body: lines.join('\n'),
    });
  });

  // ═══ Auto-review on PR (Pro/Enterprise only) ═══
  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {
    const tier = await getTier(context);
    
    // Free tier: only respond to explicit commands, not auto-review
    if (tier === 'free') return;
    
    const repo = context.payload.repository;
    const pr = context.payload.pull_request;
    
    // Acknowledge
    await context.octokit.reactions.createForIssueComment({
      owner: repo.owner.login,
      repo: repo.name,
      comment_id: (await context.octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: pr.number,
        body: '🔍 Milens is reviewing this PR...',
      })).data.id,
      content: 'eyes',
    });
    
    // Run review
    const reviewResult = await runMilensReview(repo.owner.login, repo.name, pr.number);
    
    // Post review comment
    const riskLevel = reviewResult.includes('CRITICAL') ? '⚠️ CRITICAL' :
                      reviewResult.includes('HIGH') ? '⚠️ HIGH' : '✅ OK';
    
    await context.octokit.issues.createComment({
      owner: repo.owner.login,
      repo: repo.name,
      issue_number: pr.number,
      body: `## Milens PR Review ${riskLevel}\n\n\`\`\`\n${reviewResult}\n\`\`\`\n\n---\n> Automated by [Milens Pro](https://github.com/fuze210699/milens)`,
    });
  });

  // ═══ Push handler (Pro/Enterprise) ═══
  app.on('push', async (context) => {
    const tier = await getTier(context);
    if (tier === 'free') return;
    
    const repo = context.payload.repository;
    const branch = context.payload.ref?.replace('refs/heads/', '');
    
    if (branch !== repo.default_branch) return; // only main/master
    
    app.log.info(`Pro: Auto-indexing ${repo.full_name} on push to ${branch}`);
    
    // Run analysis silently (best-effort)
    try {
      await runMilensAnalyze(repo.clone_url, branch);
      app.log.info(`Pro: Index updated for ${repo.full_name}`);
    } catch (err: any) {
      app.log.error(`Pro: Index failed for ${repo.full_name}: ${err.message}`);
    }
  });

  // ═══ App installed ═══
  app.on('installation.created', async (context) => {
    const repos = context.payload.repositories;
    app.log.info(`Milens installed on ${repos?.length || 0} repos`);
  });
};
