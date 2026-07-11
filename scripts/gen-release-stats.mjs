import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Database } from '../dist/store/db.js';
import { loadRules } from '../dist/security/rules.js';
import { ALL_LANGS } from '../dist/parser/languages.js';
import { MILENS_PROMPT_NAMES } from '../dist/server/mcp-prompts.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

// Static counts derived from source, not the marketing copy in package.json's
// description — so a drift between the two is visible instead of silently
// copy-pasted forward release after release.
function countCallSites(files, pattern) {
  let count = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    count += (text.match(pattern) || []).length;
  }
  return count;
}

const serverToolsDir = join(root, 'src/server/tools');
const toolFiles = [
  join(root, 'src/server/mcp.ts'),
  ...readdirSync(serverToolsDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(serverToolsDir, f)),
];
const mcpToolCount = countCallSites(toolFiles, /\bserver\.tool\(/g);

// MILENS_PROMPT_NAMES appends the always-present 'dead_code_remove' prompt
// after the sub-agent prompts array — see src/server/mcp-prompts.ts.
const subAgentCount = MILENS_PROMPT_NAMES.length - 1;

const db = new Database('.milens/milens.db');
const summary = db.getCodebaseSummary();
db.close();

writeFileSync('release-stats.json', JSON.stringify({
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  symbols: summary.symbols,
  files: summary.files,
  links: summary.links,
  coveragePct: summary.coveragePct,
  mcpToolCount,
  subAgentCount,
  securityRuleCount: loadRules().length,
  languageCount: ALL_LANGS.length,
}, null, 2));
