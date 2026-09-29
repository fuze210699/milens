import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolve, relative, join, sep } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { loadRules } from '../../security/rules.js';
import { globToRegex } from '../../utils.js';
import type { Deps } from './deps.js';

/** Resolve `file` under `root` and reject any path that escapes it (path traversal / symlink). */
function resolveInsideRoot(root: string, file: string): string | null {
  const resolvedRoot = resolve(root);
  const fullPath = resolve(resolvedRoot, file);
  if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + sep)) return null;
  return fullPath;
}

function redactSecret(s: string): string {
  if (s.length <= 8) return '****';
  return `${s.slice(0, 2)}****${s.slice(-2)} [redacted]`;
}

export function registerSecurityTools(server: McpServer, deps: Deps): void {
  const { getDb } = deps;

  const runScan = async ({ scope, repo, severity, limit }: { scope: string; repo?: string; severity?: string; limit: number }) => {
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
      // Also include non-code config files that may contain secrets
      // (these typically have no indexed symbols but are critical for security scanning)
      const SECRET_FILE_EXTS = new Set(['.env', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.tf', '.json', '.npmrc', '.yarnrc']);
      const SECRET_FILE_NAMES = new Set(['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore', '.env.example']);
      try {
        const walkDir = (dir: string): void => {
          let entries;
          try { entries = readdirSync(resolve(root, dir), { withFileTypes: true }); }
          catch { return; }
          for (const entry of entries) {
            const relPath = join(dir, entry.name).replace(/\\/g, '/');
            if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === '.milens') continue;
            if (entry.isDirectory()) { walkDir(relPath); continue; }
            const ext = entry.name.includes('.') ? entry.name.substring(entry.name.lastIndexOf('.')) : '';
            if (SECRET_FILE_EXTS.has(ext) || SECRET_FILE_NAMES.has(entry.name)) {
              fileSet.add(relPath);
            }
          }
        };
        walkDir('.');
      } catch { /* ignore directory walk errors */ }
      const files = [...fileSet].slice(0, 2000); // cap at 2000 files (upped from 1000 to accommodate config files)

      const { readFileSync: rfs, existsSync: es } = await import('node:fs');
      const { resolve: resolvePath } = await import('node:path');

      const findings: any[] = [];

      const compiledRules = filtered.map(rule => ({
        rule,
        includeRes: rule.fileGlob ? rule.fileGlob.split(',').map(g => globToRegex(g.trim())) : [],
        excludeRes: rule.excludeGlob ? rule.excludeGlob.split(',').map(g => globToRegex(g.trim())) : [],
      }));
      const matchesAny = (res: RegExp[], f: string): boolean => res.some(re => re.test(f) || re.test('/' + f));

      for (const file of files) {
        const fullPath = resolvePath(root, file);
        if (!es(fullPath)) continue;

        const applicableRules = compiledRules
          .filter(c => !matchesAny(c.excludeRes, file))
          .filter(c => c.includeRes.length === 0 || matchesAny(c.includeRes, file))
          .map(c => c.rule);

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
                  const matchedLine = lines[lineNum - 1] || '';

                  // Filter SEC-001 false positives in Vue/HTML template attributes:
                  // - kebab-case event names (e.g., @generate-password="...")
                  // - template attribute bindings (e.g., @toggle-password="...", :password="...")
                  if (rule.id === 'SEC-001' && file.endsWith('.vue')) {
                    const beforeMatch = matchedLine.substring(0, matchedLine.indexOf(match[0]));
                    if (beforeMatch.includes('@') || beforeMatch.includes('v-on:') ||
                        beforeMatch.match(/(^|\s):(\w+-)*password/)) continue;
                    // Check if 'password' preceded by hyphen (kebab-case compound)
                    const keywordIdx = matchedLine.indexOf(match[0]);
                    if (keywordIdx > 0 && matchedLine[keywordIdx - 1] === '-') continue;
                  }

                  const ctxStart = Math.max(0, lineNum - 3);
                const ctxEnd = Math.min(lines.length, lineNum + 2);
                // Minified/bundled files can have a single line spanning hundreds of KB
                // (e.g. webpack bundles) — cap context length so one finding can't blow
                // past the tool's output size limit.
                const MAX_CONTEXT_LEN = 500;
                let context = lines.slice(ctxStart, ctxEnd).join('\n');
                if (context.length > MAX_CONTEXT_LEN) {
                  context = context.slice(0, MAX_CONTEXT_LEN) + '... [truncated]';
                }

                const isSecret = rule.category === 'secrets';
                const rawMatch = match[0];
                findings.push({
                  ruleId: rule.id,
                  category: rule.category,
                  severity: rule.severity,
                  owasp: rule.owasp,
                  file,
                  line: lineNum,
                  match: isSecret
                    ? redactSecret(rawMatch)
                    : (rawMatch.length > 100 ? rawMatch.slice(0, 97) + '...' : rawMatch),
                  context: isSecret ? '[redacted]' : context,
                  fix: rule.fix,
                });
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      const SEV_ORDER: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const seenKeys = new Set<string>();
      const deduped: any[] = [];
      for (const f of findings) {
        const key = `${f.category}|${f.file}|${f.line}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        deduped.push(f);
      }
      deduped.sort((a, b) => (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0));

      const byCategory: Record<string, number> = {};
      const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const f of deduped) {
        byCategory[f.category] = (byCategory[f.category] || 0) + 1;
        bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      }
      const deduction = bySeverity.CRITICAL * 5 + bySeverity.HIGH * 2 + bySeverity.MEDIUM * 0.5;
      const score = Math.max(0, Math.round(100 - deduction));

      const limited = deduped.slice(0, limit);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            summary: {
              totalScanned: files.length,
              findings: deduped.length,
              byCategory,
              bySeverity,
              score,
            },
            findings: limited,
          }, null, 2),
        }],
      };
  };

  const runFix = async ({ ruleId, file, line, confirm, repo }: { ruleId: string; file: string; line: number; confirm: boolean; repo?: string }) => {
      const { root } = getDb(repo);
      const rules = loadRules();
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) return { content: [{ type: 'text' as const, text: `Rule not found: "${ruleId}"` }] };
      if (rule.severity === 'CRITICAL' && !confirm) {
        return { content: [{ type: 'text' as const, text: `CRITICAL rule "${ruleId}" requires confirmation. Set confirm: true to proceed.` }] };
      }

      const fullPath = resolveInsideRoot(root, file);
      if (!fullPath) return { content: [{ type: 'text' as const, text: `Invalid file path: "${file}" resolves outside the repo root.` }] };
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
      const ext = file.split('.').pop()?.toLowerCase() ?? '';
      const isPythonStyle = /^(py|rb|sh|yaml|yml|toml|cfg|ini|env)$/.test(ext);
      const isHtmlStyle = /^(html|htm|vue|xml)$/.test(ext);
      const commentPrefix = isPythonStyle ? '#' : isHtmlStyle ? '<!--' : '//';
      const commentSuffix = isHtmlStyle ? ' -->' : '';
      const fixComment = `${indent}${commentPrefix} milens(fix): rule=${rule.id} — ${rule.fix ?? 'Review manually'}${commentSuffix}`;
      lines.splice(line - 1, 0, fixComment);
      const newContent = lines.join('\n');
      writeFileSync(fullPath, newContent, 'utf-8');

      return { content: [{ type: 'text' as const, text: `Fix comment added for rule "${ruleId}" at ${file}:${line}\nSeverity: ${rule.severity}\nBackup: ${relative(root, backupPath)}\nSuggestion: ${rule.fix ?? 'Manual review needed'}\n\nAdded fix annotation above line ${line}. Original line is preserved below — replace manually following the suggestion.` }] };
  };

  server.tool(
    'security_scan',
    'Scan codebase for security vulnerabilities using 190+ built-in rules across 25 categories. Replaces multiple manual grep() calls. Pass `mode: "fix"` with {ruleId,file,line} to apply a fix (backs up first; CRITICAL needs confirm:true). Scan categories: secrets, injection, rce, xss, deserialization, ssrf, xxe, path-traversal, file-upload, unicode, dangerous, config, data-leak, crypto, auth, jwt, cors-headers, dependency, cloud, docker, kubernetes, iac, business-logic, api-security, misc, file-access.',
    {
      mode: z.enum(['scan', 'fix']).optional().default('scan').describe('scan=find vulnerabilities; fix=apply a fix suggestion'),
      scope: z.enum(['all', 'secrets', 'injection', 'rce', 'xss', 'deserialization', 'ssrf', 'xxe', 'path-traversal', 'file-upload', 'unicode', 'dangerous', 'config', 'data-leak', 'crypto', 'auth', 'jwt', 'cors-headers', 'dependency', 'cloud', 'docker', 'kubernetes', 'iac', 'business-logic', 'api-security', 'misc', 'file-access']).optional().default('all').describe('Scan scope (mode=scan)'),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('Minimum severity filter (mode=scan)'),
      limit: z.number().optional().default(50).describe('Max findings (mode=scan)'),
      ruleId: z.string().optional().describe('Security rule ID (mode=fix)'),
      file: z.string().optional().describe('File path relative to repo root (mode=fix)'),
      line: z.number().optional().describe('Line number of the issue (mode=fix)'),
      confirm: z.boolean().optional().default(false).describe('Confirmation for CRITICAL rules (mode=fix)'),
      repo: z.string().optional(),
    },
    async ({ mode, scope, severity, limit, ruleId, file, line, confirm, repo }) => {
      if (mode === 'fix') {
        if (!ruleId || !file || line == null) {
          return { content: [{ type: 'text' as const, text: 'mode=fix requires `ruleId`, `file`, and `line`.' }] };
        }
        return runFix({ ruleId, file, line, confirm: confirm ?? false, repo });
      }
      return runScan({ scope: scope ?? 'all', severity, limit: limit ?? 50, repo });
    },
  );
}
