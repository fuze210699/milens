import type { Database } from '../store/db.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';

export interface TestPlan {
  symbol: string;
  kind: string;
  file: string;
  signature?: string;
  mockStrategy: Array<{ dependency: string; type: 'mock' | 'stub' | 'spy'; reason: string }>;
  testScenarios: Array<{ name: string; description: string }>;
  existingTests: string[];
  planText: string;
}

/** Extract describe/it block names from a test file that reference the target symbol */
function extractTestNames(testFilePath: string, symbolName: string): string[] {
  try {
    const content = readFileSync(testFilePath, 'utf-8');
    const names: string[] = [];
    // Match describe/it blocks that contain the symbol name
    const blockRe = /(?:describe|it)\s*\(\s*['"`]([^'"`]*)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(content)) !== null) {
      // Only include if the block or surrounding code references the symbol
      const blockStart = m.index;
      const blockEnd = Math.min(content.length, blockStart + 500);
      const blockContent = content.slice(blockStart, blockEnd);
      if (blockContent.includes(symbolName)) {
        names.push(m[1]);
      }
    }
    return names;
  } catch {
    return [];
  }
}

export function generateTestPlan(db: Database, name: string, rootPath?: string): TestPlan | null {
  const matches = db.findSymbolByName(name);
  if (matches.length === 0) return null;

  const sym = matches[0];
  const symbolId = sym.id;

  const incomingLinks = db.getIncomingLinks(symbolId).filter(l => l.type !== 'contains');
  const outgoingLinks = db.getOutgoingLinks(symbolId).filter(l => l.type !== 'contains');

  const mockStrategy: TestPlan['mockStrategy'] = [];

  for (const link of outgoingLinks) {
    const dep = db.findSymbolById(link.toId);
    if (!dep) continue;

    const depName = dep.name;
    const sameFile = dep.filePath === sym.filePath;
    const isImport = link.type === 'imports';

    if (isImport && !sameFile) {
      mockStrategy.push({
        dependency: depName,
        type: 'stub',
        reason: 'Imported data type or value — minimal stub required',
      });
    } else if (sameFile) {
      mockStrategy.push({
        dependency: depName,
        type: 'spy',
        reason: 'Same-file helper — spy to verify interaction',
      });
    } else {
      mockStrategy.push({
        dependency: depName,
        type: 'mock',
        reason: 'External module dependency — mock to isolate unit under test',
      });
    }
  }

  const testScenarios = [
    {
      name: 'Happy path',
      description: `Normal valid input produces expected ${sym.kind === 'function' || sym.kind === 'method' ? 'return value' : 'output'}.`,
    },
    {
      name: 'Edge case',
      description: 'Null, empty, or boundary inputs handled gracefully.',
    },
    {
      name: 'Error handling',
      description: 'A dependency fails — verify graceful degradation or error propagation.',
    },
  ];

  const existingTests: string[] = [];
  const seenTestFiles = new Set<string>();
  for (const link of incomingLinks) {
    const caller = db.findSymbolById(link.fromId);
    if (!caller) continue;
    if (
      caller.filePath.includes('/test/') ||
      caller.filePath.includes('.test.') ||
      caller.filePath.includes('.spec.')
    ) {
      // Try to extract actual describe/it block names from the test file
      if (!seenTestFiles.has(caller.filePath)) {
        seenTestFiles.add(caller.filePath);
        const testPath = rootPath ? resolve(rootPath, caller.filePath) : caller.filePath;
        let addedFromFile = false;
        if (existsSync(testPath)) {
          const testNames = extractTestNames(testPath, sym.name);
          if (testNames.length > 0) {
            existingTests.push(...testNames);
            addedFromFile = true;
          }
        }
        // Per-file fallback: if no block names extracted, use caller name
        if (!addedFromFile) {
          existingTests.push(caller.name !== '_top' ? caller.name : caller.filePath.replace(/^.*[\\/]/, ''));
        }
      }
    }
  }
  // Deduplicate
  const uniqueTests = [...new Set(existingTests)];

  const sortedDeps = (include: 'mock' | 'stub' | 'spy') =>
    mockStrategy
      .filter(m => m.type === include)
      .map(m => `- **${m.dependency}** — ${m.reason}`)
      .join('\n');

  const planText = [
    `# Test Plan: \`${sym.name}\``,
    '',
    `- **Kind:** ${sym.kind}`,
    `- **File:** ${sym.filePath}${sym.signature ? `\n- **Signature:** \`${sym.signature}\`` : ''}`,
    '',
    '## Mock Strategy',
    '',
    sortedDeps('mock') || '*No external module dependencies to mock.*',
    '',
    sortedDeps('spy') || '*No same-file helpers to spy on.*',
    '',
    sortedDeps('stub') || '*No imported data types to stub.*',
    '',
    '## Test Scenarios',
    '',
    ...testScenarios.map(s => `### ${s.name}\n\n${s.description}\n`),
    existingTests.length > 0
      ? `## Existing Tests\n\n${uniqueTests.map(t => `- \`${t}\``).join('\n')}\n`
      : '## Existing Tests\n\n*No existing tests found.*\n',
  ].join('\n');

  return {
    symbol: sym.name,
    kind: sym.kind,
    file: sym.filePath,
    signature: sym.signature,
    mockStrategy,
    testScenarios,
    existingTests: uniqueTests,
    planText,
  };
}
