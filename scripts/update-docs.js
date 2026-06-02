/**
 * Auto-update hardcoded stats in docs HTML files.
 * Reads actual tool count, rule count, and version from source,
 * then replaces matching patterns in all docs/*.html files (except changelog).
 *
 * Usage: node scripts/update-docs.js
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function countTools() {
  const mcpPath = join(root, 'src', 'server', 'mcp.ts');
  const content = readFileSync(mcpPath, 'utf-8');
  const matches = content.match(/server\.tool\(/g);
  return matches ? matches.length : 0;
}

function countRules() {
  const rulesPath = join(root, 'src', 'security', 'rules.ts');
  const content = readFileSync(rulesPath, 'utf-8');
  const matches = content.match(/id:\s*'SEC-\d+'/g);
  return matches ? matches.length : 0;
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  return pkg.version;
}

function updateHtmlFile(filePath, toolCount, ruleCount, version) {
  let content = readFileSync(filePath, 'utf-8');
  let changed = false;

  // Replace MCP tool count patterns: "43 MCP tools", "All 43 MCP tools"
  const toolPattern = /(\d+)(\s*MCP\s+tools?)/g;
  const newToolText = `${toolCount}$2`;
  const oldToolMatch = content.match(toolPattern);
  if (oldToolMatch) {
    const newContent = content.replace(toolPattern, (_, num, rest) => {
      const parsed = parseInt(num, 10);
      if (parsed !== toolCount) {
        changed = true;
        return `${toolCount}${rest}`;
      }
      return `${num}${rest}`;
    });
    content = newContent;
  }

  // Replace security rules count patterns: "50+ security rules", "50 security rules"
  const rulePattern = /(\d+)\+?\s+(security\s+rules?)/gi;
  const newRuleText = `${ruleCount}+ $2`;
  const newContent2 = content.replace(rulePattern, (match, num, rest) => {
    const parsed = parseInt(num, 10);
    if (parsed !== ruleCount) {
      changed = true;
      return `${ruleCount}+ ${rest}`;
    }
    return match;
  });
  content = newContent2;

  if (changed) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✓ ${filePath.replace(root + '/', '')}`);
    return true;
  }
  return false;
}

// ── Main ──

const toolCount = countTools();
const ruleCount = countRules();
const version = readVersion();

console.log(`Stats: ${toolCount} tools, ${ruleCount} rules, v${version}`);

const docsDir = join(root, 'docs');
const htmlFiles = readdirSync(docsDir).filter(f => f.endsWith('.html'));
const skipFiles = ['changelog.html'];  // historical entries, don't touch

let updated = 0;
for (const file of htmlFiles) {
  if (skipFiles.includes(file)) {
    console.log(`  - docs/${file} (skipped — changelog)`);
    continue;
  }
  const filePath = join(docsDir, file);
  if (updateHtmlFile(filePath, toolCount, ruleCount, version)) {
    updated++;
  }
}

if (updated === 0) {
  console.log('All docs are up to date.');
} else {
  console.log(`\nUpdated ${updated} file(s).`);
}
