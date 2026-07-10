import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Deps } from './deps.js';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type Severity = (typeof SEVERITIES)[number];

const findingSchema = z.object({
  id: z.string().describe('Short stable identifier, e.g. "BUG-1"'),
  severity: z.enum(SEVERITIES),
  title: z.string(),
  file: z.string().describe('Path relative to repo root'),
  line: z.number().int().positive(),
  root_cause: z.string(),
  repro: z.string(),
  fix: z.string(),
  impact: z.string().optional(),
  status: z.string().optional().default('open'),
});

type Finding = z.infer<typeof findingSchema>;

interface VerifiedFinding extends Finding {
  verified: true;
}
interface RejectedFinding {
  finding: Finding;
  reason: string;
}

function verifyLocation(root: string, f: Finding): { ok: true } | { ok: false; reason: string } {
  const abs = join(root, f.file);
  if (!existsSync(abs)) return { ok: false, reason: `file does not exist: ${f.file}` };
  let lineCount: number;
  try {
    lineCount = readFileSync(abs, 'utf-8').split('\n').length;
  } catch (e) {
    return { ok: false, reason: `could not read file: ${(e as Error).message}` };
  }
  if (f.line < 1 || f.line > lineCount) {
    return { ok: false, reason: `line ${f.line} out of range (file has ${lineCount} lines)` };
  }
  return { ok: true };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'report';
}

function renderReport(opts: {
  title: string;
  root: string;
  method?: string;
  verified: VerifiedFinding[];
  rejected: RejectedFinding[];
  notes?: string[];
  fixOrder?: string;
}): string {
  const { title, root, method, verified, rejected, notes, fixOrder } = opts;
  const lines: string[] = [];

  lines.push(`<report title="${title}" repo="${root}" generated="${new Date().toISOString()}">`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  if (method) lines.push(method.trim());
  lines.push('');
  if (verified.length > 0) {
    lines.push('| ID | Severity | Location | Status |');
    lines.push('|---|---|---|---|');
    for (const f of verified) {
      lines.push(`| ${f.id} | ${f.severity} | ${f.file}:${f.line} | ${f.status} |`);
    }
  } else {
    lines.push('_No verified findings — see Rejected section below._');
  }
  lines.push('');

  for (const f of verified) {
    lines.push(`<finding id="${f.id}" severity="${f.severity}" status="${f.status}" file="${f.file}" line="${f.line}">`);
    lines.push('');
    lines.push(`### ${f.title}`);
    lines.push('');
    lines.push('**Root cause**');
    lines.push(f.root_cause.trim());
    lines.push('');
    lines.push('**Repro**');
    lines.push(f.repro.trim());
    lines.push('');
    if (f.impact) {
      lines.push('**Impact**');
      lines.push(f.impact.trim());
      lines.push('');
    }
    lines.push('**Fix**');
    lines.push(f.fix.trim());
    lines.push('');
    lines.push('</finding>');
    lines.push('');
  }

  if (rejected.length > 0) {
    lines.push('## ⚠ Rejected — location unverified');
    lines.push('');
    lines.push('These findings were dropped from the report above because their `file:line` could not be verified against the repo. Fix the location and resubmit if they are real.');
    lines.push('');
    for (const r of rejected) {
      lines.push(`- **${r.finding.id}** (${r.finding.title}) — claimed \`${r.finding.file}:${r.finding.line}\`: ${r.reason}`);
    }
    lines.push('');
  }

  if (notes && notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const n of notes) lines.push(`- ${n}`);
    lines.push('');
  }

  if (fixOrder) {
    lines.push('## Fix order');
    lines.push('');
    lines.push(fixOrder.trim());
    lines.push('');
  }

  lines.push('</report>');
  return lines.join('\n');
}

export function registerFindingsReportTools(server: McpServer, deps: Deps): void {
  const { resolveRoot } = deps;

  server.tool(
    'generate_findings_report',
    'Render a set of already-investigated findings (bugs, security issues, etc.) into a single Markdown+XML report file for a worker/coder agent to act on. Verifies every file:line against the real repo before including it — unverifiable findings are excluded from the report and listed separately as rejected. Does not delete old reports automatically; clean up .milens/tmp/reports/ yourself when done.',
    {
      repo: z.string().describe('Repository root path'),
      title: z.string(),
      method: z.string().optional().describe('Short prose describing how the findings were gathered'),
      findings: z.array(findingSchema).min(1),
      notes: z.array(z.string()).optional().describe('Minor/non-blocking observations'),
      fix_order: z.string().optional().describe('Prose guidance on what to fix first and why'),
    },
    async ({ repo, title, method, findings, notes, fix_order }) => {
      const root = resolveRoot(repo);

      const verified: VerifiedFinding[] = [];
      const rejected: RejectedFinding[] = [];
      for (const f of findings) {
        const result = verifyLocation(root, f);
        // Don't rely on the zod .default('open') having been applied — depending
        // on how the caller invokes this handler, schema parsing may be bypassed.
        const normalized: Finding = { ...f, status: f.status ?? 'open' };
        if (result.ok) {
          verified.push({ ...normalized, verified: true });
        } else {
          rejected.push({ finding: normalized, reason: result.reason });
        }
      }

      const content = renderReport({ title, root, method, verified, rejected, notes, fixOrder: fix_order });

      const reportsDir = join(root, '.milens', 'tmp', 'reports');
      mkdirSync(reportsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = join(reportsDir, `${slugify(title)}-${timestamp}.md`);
      writeFileSync(filePath, content, 'utf-8');

      const gitignorePath = join(root, '.gitignore');
      let gitignoreWarning = '';
      try {
        const gitignoreContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
        if (!/(^|\n)\.milens\/?(\n|$)/.test(gitignoreContent)) {
          gitignoreWarning = '\n\n⚠ ".milens/" is not in this repo\'s .gitignore — this report may get picked up by `git add -A`. Consider adding ".milens/" to .gitignore.';
        }
      } catch { /* non-fatal */ }

      const summary = [
        `Report written: ${filePath}`,
        `Verified findings: ${verified.length}/${findings.length}`,
        rejected.length > 0 ? `Rejected (unverified location): ${rejected.length} — ${rejected.map(r => r.finding.id).join(', ')}` : null,
        gitignoreWarning || null,
      ].filter(Boolean).join('\n');

      return { content: [{ type: 'text' as const, text: summary }] };
    },
  );
}
