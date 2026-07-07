import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolve, relative, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadRules } from '../../security/rules.js';
import { globToRegex } from '../../utils.js';
import type { Deps } from './deps.js';

export function registerSecurityTools(server: McpServer, deps: Deps): void {
  const { getDb } = deps;

  server.tool(
    'security_scan',
    'Scan codebase for security vulnerabilities using 190+ built-in rules across 25 categories. Replaces multiple manual grep() calls. Categories: secrets, injection, rce, xss, deserialization, ssrf, xxe, path-traversal, file-upload, unicode, dangerous, config, data-leak, crypto, auth, jwt, cors-headers, dependency, cloud, docker, kubernetes, iac, business-logic, api-security, misc, file-access.',
    {
      scope: z.enum(['all', 'secrets', 'injection', 'rce', 'xss', 'deserialization', 'ssrf', 'xxe', 'path-traversal', 'file-upload', 'unicode', 'dangerous', 'config', 'data-leak', 'crypto', 'auth', 'jwt', 'cors-headers', 'dependency', 'cloud', 'docker', 'kubernetes', 'iac', 'business-logic', 'api-security', 'misc', 'file-access']).optional().default('all').describe('Scan scope'),
      repo: z.string().optional().describe('Repository root path'),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('Minimum severity filter'),
      limit: z.number().optional().default(50).describe('Max findings'),
    },
    async ({ scope, repo, severity, limit }) => {
      const { db, root } = getDb(repo);
      const rules = loadRules();

      // Filter rules by scope and severity
      const filtered = rules.filter(r => {
        if (scope !== 'all' && r.category !== scope) return false;
        if (severity) {
          const sevOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          if ((sevOrder[r.severity] || 0) < (sevOrder[severity] || 0)) return false;
        }
        return r.enabled;
      });

      // Get all source files from the DB
      const symbols = db.getAllSymbols();
      const fileSet = new Set<string>();
      for (const s of symbols) {
        if (s.filePath && !s.filePath.includes('node_modules') && !s.filePath.includes('.git')) {
          fileSet.add(s.filePath);
        }
      }
      const files = [...fileSet].slice(0, 1000); // cap at 1000 files

      const { readFileSync: rfs, existsSync: es } = await import('node:fs');
      const { resolve: resolvePath } = await import('node:path');

      const findings: any[] = [];
      const byCategory: Record<string, number> = {};
      const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

      for (const file of files) {
        const fullPath = resolvePath(root, file);
        if (!es(fullPath)) continue;

        // Apply excludeGlob from each rule's exclusion pattern
        let shouldExclude = false;
        for (const rule of filtered) {
          if (rule.excludeGlob) {
            const excludePatterns = rule.excludeGlob.split(',');
            for (const pattern of excludePatterns) {
              const regex = globToRegex(pattern.trim());
              if (regex.test(file) || regex.test('/' + file)) {
                shouldExclude = true;
                break;
              }
            }
          }
          if (shouldExclude) break;
        }
        if (shouldExclude) continue;

        // Skip files that don't match rule fileGlobs (simple check)
        const applicableRules = filtered.filter(r => {
          if (!r.fileGlob) return true;
          // Simple glob: just check extension
          const ext = r.fileGlob.replace('**/*.', '').replace('**/*', '');
          return file.endsWith(ext) || r.fileGlob === '**/*';
        });

        if (applicableRules.length === 0) continue;

        try {
          const content = rfs(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (const rule of applicableRules) {
            for (const pattern of rule.patterns) {
              let match;
              // Reset regex lastIndex for global patterns
              pattern.lastIndex = 0;
              while ((match = pattern.exec(content)) !== null) {
                const lineNum = content.substring(0, match.index).split('\n').length;
                const ctxStart = Math.max(0, lineNum - 3);
                const ctxEnd = Math.min(lines.length, lineNum + 2);
                const context = lines.slice(ctxStart, ctxEnd).join('\n');

                findings.push({
                  ruleId: rule.id,
                  category: rule.category,
                  severity: rule.severity,
                  owasp: rule.owasp,
                  file,
                  line: lineNum,
                  match: match[0].length > 100 ? match[0].slice(0, 97) + '...' : match[0],
                  context,
                  fix: rule.fix,
                });

                byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
                bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      // Calculate security score (100 - deductions)
      const deduction = findings.filter((f: any) => f.severity === 'CRITICAL').length * 5 +
        findings.filter((f: any) => f.severity === 'HIGH').length * 2 +
        findings.filter((f: any) => f.severity === 'MEDIUM').length * 0.5;
      const score = Math.max(0, Math.round(100 - deduction));

      const limited = findings.slice(0, limit);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            summary: {
              totalScanned: files.length,
              findings: findings.length,
              byCategory,
              bySeverity,
              score,
            },
            findings: limited,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'fix_apply',
    'Apply a security fix suggestion to a file. Creates a backup before modifying. CRITICAL rules require confirm: true.',
    {
      ruleId: z.string().describe('Security rule ID (e.g. "hardcoded_secret")'),
      file: z.string().describe('File path relative to repo root'),
      line: z.number().describe('Line number where the issue was found'),
      confirm: z.boolean().optional().default(false).describe('Confirmation required for CRITICAL rules'),
      repo: z.string().optional(),
    },
    async ({ ruleId, file, line, confirm, repo }) => {
      const { root } = getDb(repo);
      const rules = loadRules();
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) return { content: [{ type: 'text' as const, text: `Rule not found: "${ruleId}"` }] };
      if (rule.severity === 'CRITICAL' && !confirm) {
        return { content: [{ type: 'text' as const, text: `CRITICAL rule "${ruleId}" requires confirmation. Set confirm: true to proceed.` }] };
      }

      const fullPath = resolve(root, file);
      if (!existsSync(fullPath)) return { content: [{ type: 'text' as const, text: `File not found: ${file}` }] };

      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      if (line < 1 || line > lines.length) return { content: [{ type: 'text' as const, text: `Line ${line} out of range (file has ${lines.length} lines).` }] };

      // Backup original
      const backupDir = join(root, '.milens', 'backups');
      mkdirSync(backupDir, { recursive: true });
      const backupPath = join(backupDir, `${file.replace(/[\\/]/g, '_')}_${Date.now()}.bak`);
      writeFileSync(backupPath, content, 'utf-8');

      // Apply fix: add comment above the affected line with the fix suggestion
      const targetLine = lines[line - 1];
      const indent = targetLine.match(/^(\s*)/)?.[1] ?? '';
      const fixComment = `${indent}// milens(fix): rule=${rule.id} — ${rule.fix ?? 'Review manually'}`;
      lines.splice(line - 1, 0, fixComment);
      const newContent = lines.join('\n');
      writeFileSync(fullPath, newContent, 'utf-8');

      return { content: [{ type: 'text' as const, text: `Fix applied for rule "${ruleId}" at ${file}:${line}\nSeverity: ${rule.severity}\nBackup: ${relative(root, backupPath)}\nFix: ${rule.fix ?? 'Manual review needed'}\n\nAdded fix comment above line ${line}.` }] };
    },
  );
}
