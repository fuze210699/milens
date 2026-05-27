import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class MilensRunner {
  static async handleAnalyzeCommand(context) {
    const repo = context.payload.repository;
    const issue = context.payload.issue;

    await context.octokit.reactions.createForIssueComment({
      owner: repo.owner.login,
      repo: repo.name,
      comment_id: context.payload.comment.id,
      content: 'eyes',
    });

    try {
      const workDir = `/tmp/milens-${randomUUID()}`;
      execSync(`git clone ${repo.clone_url} ${workDir}`, { stdio: 'pipe' });

      execSync('npx milens analyze -p . --force --skills', {
        cwd: workDir,
        stdio: 'pipe',
        timeout: 300000,
      });

      const { readFileSync } = await import('node:fs');
      let agentsMd = '';
      let securityMd = '';
      try { agentsMd = readFileSync(join(workDir, 'AGENTS.md'), 'utf-8'); } catch {}
      try { securityMd = readFileSync(join(workDir, 'SECURITY.md'), 'utf-8'); } catch {}

      const branchName = `milens/analyze-${Date.now()}`;

      await context.octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issue.number,
        body: `✅ Milens analysis complete! Check the generated files. Run \`/milens analyze\` again to regenerate.`,
      });
    } catch (error) {
      await context.octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issue.number,
        body: `❌ Milens analysis failed: ${error.message}`,
      });
    }
  }

  static async handlePullRequest(context) {
    const pr = context.payload.pull_request;
    const repo = context.payload.repository;
    app.log.info(`Processing PR #${pr.number} in ${repo.full_name}`);
  }

  static async handlePush(context) {
    const repo = context.payload.repository;
    app.log.info(`Processing push to ${repo.full_name}`);
  }
}
