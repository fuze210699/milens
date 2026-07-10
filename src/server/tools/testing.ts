import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { generateTestPlan } from '../test-plan.js';
import type { TestPlan } from '../test-plan.js';
import { countDependentFiles } from '../../analyzer/risk.js';
import type { Deps } from './deps.js';

export function registerTestingTools(server: McpServer, deps: Deps): void {
  const { getDb } = deps;

  server.tool(
    'test_coverage_gaps',
    'Untested exported symbols sorted by risk. Prioritize writing tests for these.',
    { limit: z.number().optional().default(20), repo: z.string().optional() },
    async ({ limit, repo }) => {
      const { db } = getDb(repo);
      const coverage = db.getTestCoverage();
      const gaps = db.getTestCoverageGaps(limit);
      const lines = [`Test Coverage: ${coverage.testedSymbols}/${coverage.exportedProductionSymbols} (${coverage.exportedProductionSymbols > 0 ? Math.round(coverage.testedSymbols / coverage.exportedProductionSymbols * 100) : 0}%) from ${coverage.testFiles} test files\n`];
      if (gaps.length === 0) {
        lines.push('All exported symbols have test coverage!');
      } else {
        lines.push(`Top ${gaps.length} untested symbols:\n`);
        for (const g of gaps) {
          const depsCount = countDependentFiles(db, g.id).count;
          const risk = (g.heat ?? 0) > 80 ? 'CRITICAL' : (g.heat ?? 0) > 50 ? 'HIGH' : (g.heat ?? 0) > 30 ? 'MEDIUM' : 'LOW';
          lines.push(`  ${g.name} [${g.kind}] ${g.filePath}:${g.startLine} — heat:${g.heat ?? 0} deps:${depsCount} risk:${risk}`);
        }
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'test_impact',
    'Map changed code -> which test files to run. Use after making changes.',
    { ref: z.string().optional().default('HEAD'), repo: z.string().optional() },
    async ({ ref, repo }) => {
      const { db, root } = getDb(repo);
      let changedFiles: string[] = [];
      try {
        const { execSync } = await import('node:child_process');
        const diff = execSync(`git diff --name-only ${ref}`, { cwd: root, encoding: 'utf-8' }).trim();
        changedFiles = diff ? diff.split('\n').filter(Boolean) : [];
      } catch {}
      if (changedFiles.length === 0) return { content: [{ type: 'text' as const, text: 'No changed files.' }] };
      const changedIds: string[] = [];
      const changedNames: string[] = [];
      for (const file of changedFiles) {
        for (const sym of db.getSymbolsByFile(file)) {
          if (sym.kind === 'section') continue;
          changedIds.push(sym.id);
          changedNames.push(sym.name);
        }
      }
      if (changedIds.length === 0) return { content: [{ type: 'text' as const, text: 'No symbols in changed files.' }] };
      const impact = db.getTestImpact(changedIds);
      const lines = [`Changed symbols (${changedNames.length}): ${changedNames.join(', ')}`];
      lines.push(`\nAffected test files (${impact.testFiles.length}):`);
      for (const f of impact.testFiles) lines.push(`  ${f}`);
      if (impact.testFiles.length > 0) {
        lines.push(`\nSuggested command: npx vitest run ${impact.testFiles.join(' ')}`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'test_plan',
    'Generate a test strategy for a symbol: mock plan + >=3 test scenarios.',
    { name: z.string(), repo: z.string().optional() },
    async ({ name, repo }) => {
      const { db, root } = getDb(repo);
      const plan = generateTestPlan(db, name, root);
      if (!plan) return { content: [{ type: 'text' as const, text: `"${name}" not found.` }] };
      return { content: [{ type: 'text' as const, text: plan.planText }] };
    },
  );

  server.tool(
    'test_generate',
    'Generate a test file for a symbol using its test plan. Detects test framework and follows project conventions.',
    {
      symbol: z.string().describe('Symbol name to generate tests for'),
      repo: z.string().optional(),
    },
    async ({ symbol, repo }) => {
      const { db, root } = getDb(repo);
      const plan = generateTestPlan(db, symbol, root);
      if (!plan) return { content: [{ type: 'text' as const, text: `Symbol not found: "${symbol}"` }] };

      // Verify the symbol is actually a module-level export of its file
      const syms = db.findSymbolByName(symbol);
      const targetSym = syms[0];
      const exportedFromFile = targetSym?.exported ?? false;
      let factoryHint: string | undefined;
      if (!exportedFromFile && targetSym) {
        // Look for exported factory functions in the same file
        const fileSyms = db.getSymbolsByFile(targetSym.filePath);
        const exportedFactories = fileSyms.filter(
          s => s.exported && (s.kind === 'function' || s.kind === 'variable') && s.name !== targetSym.name
        );
        if (exportedFactories.length > 0) {
          factoryHint = exportedFactories[0].name;
        }
      }

      // Detect test framework
      const framework = detectTestFramework(root);
      const testExt = framework === 'pytest' ? '.py' : '.test.ts';

      // Determine test file path
      const srcFile = plan.file;
      const srcDir = dirname(srcFile);
      const srcName = basename(srcFile, srcFile.includes('.') ? '.' + srcFile.split('.').pop()! : '');
      const testFileName = `${srcName}${testExt}`;
      const testDir = join(srcDir, '__tests__');
      const testPath = join(testDir, testFileName);

      // Don't overwrite existing test files
      if (existsSync(join(root, testPath))) {
        return { content: [{ type: 'text' as const, text: `Test file already exists at ${testPath}. Skipping to avoid overwrite.` }] };
      }

      // Check if a sister test file exists alongside the source
      const altTestPath = join(srcDir, testFileName);
      const existingTestDir = existsSync(join(root, testDir));
      const altExists = existsSync(join(root, altTestPath));
      if (altExists) {
        return { content: [{ type: 'text' as const, text: `Test file exists at ${altTestPath}. Skipping to avoid overwrite.` }] };
      }

      // Generate test code
      const testCode = generateTestCode(plan, framework, srcFile, exportedFromFile, factoryHint);

      // Write the test file
      const writePath = existingTestDir ? testPath : altTestPath;
      mkdirSync(dirname(join(root, writePath)), { recursive: true });
      writeFileSync(join(root, writePath), testCode, 'utf-8');

      return { content: [{ type: 'text' as const, text: `Test file generated: ${writePath}\nFramework: ${framework}\nScenarios: ${plan.testScenarios.length}\nMock deps: ${plan.mockStrategy.length}` }] };
    },
  );
}

function detectTestFramework(rootPath: string): 'jest' | 'vitest' | 'mocha' | 'pytest' {
  try {
    const pkgPath = resolve(rootPath, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    if (deps.vitest) return 'vitest';
    if (deps.jest) return 'jest';
    if (deps.mocha) return 'mocha';
  } catch {}
  // Check for Python
  try {
    readFileSync(resolve(rootPath, 'pytest.ini'), 'utf-8');
    return 'pytest';
  } catch {}
  try {
    const cfg = readFileSync(resolve(rootPath, 'setup.cfg'), 'utf-8');
    if (cfg.includes('[tool:pytest]')) return 'pytest';
  } catch {}
  return 'vitest'; // default (Vitest is most common for TS projects)
}

function generateTestCode(plan: TestPlan, framework: string, srcFile: string, exportedFromFile: boolean, factoryHint?: string): string {
  const lines: string[] = [];

  if (framework === 'pytest') {
    lines.push(`# Generated by milens — test plan for ${plan.symbol}`);
    lines.push(`import pytest`);
    lines.push(`from ${srcFile.replace(/[/\\]/g, '.').replace(/\.(ts|tsx|js|jsx|py)$/, '')} import ${plan.symbol}`);
    lines.push('');
    lines.push(`class Test${capitalize(plan.symbol)}:`);
    for (const s of plan.testScenarios) {
      lines.push(`    def test_${s.name.toLowerCase().replace(/\s+/g, '_')}(self):`);
      lines.push(`        """${s.description}"""`);
      lines.push(`        pass  # TODO: implement`);
      lines.push('');
    }
  } else {
    const hasTypescript = srcFile.endsWith('.ts') || srcFile.endsWith('.tsx');
    const ext = hasTypescript ? '.ts' : '.js';

    // What to actually import: the symbol itself if it's a real module export,
    // otherwise the exported factory that returns it (with a warning), or —
    // last resort — the symbol name anyway with an explicit warning that the
    // import is likely wrong.
    const importLines: string[] = [];
    if (exportedFromFile) {
      importLines.push(`import { ${plan.symbol} } from '${relativeImport(srcFile, hasTypescript)}';`);
    } else if (factoryHint) {
      importLines.push(`import { ${factoryHint} } from '${relativeImport(srcFile, hasTypescript)}';`);
      importLines.push(`// NOTE: ${plan.symbol} is NOT a module-level export. It is returned by ${factoryHint}().`);
      importLines.push(`// Write tests against the factory call and access the symbol via the returned object.`);
    } else {
      importLines.push(`// WARNING: ${plan.symbol} is NOT a module-level export of '${srcFile}'.`);
      importLines.push(`// The import below may fail — verify the import path manually.`);
      importLines.push(`import { ${plan.symbol} } from '${relativeImport(srcFile, hasTypescript)}';`);
    }

    lines.push(`// Generated by milens — test plan for ${plan.symbol}`);
    if (framework === 'vitest') {
      lines.push(`import { describe, it, expect${plan.mockStrategy.length > 0 ? ', vi' : ''} } from 'vitest';`);
      lines.push(...importLines);
    } else if (framework === 'mocha') {
      lines.push(`import { expect } from 'chai';`);
      lines.push(...importLines);
    } else {
      lines.push(...importLines);
    }

    // Mock imports — only for cross-file dependencies with a real module path
    for (const m of plan.mockStrategy) {
      if (!m.modulePath) continue;
      if (framework === 'vitest') {
        lines.push(`vi.mock('${m.modulePath}');`);
      } else if (framework === 'jest') {
        lines.push(`jest.mock('${m.modulePath}');`);
      }
    }

    lines.push('');

    const describeFn = framework === 'mocha' ? `describe('${plan.symbol}'` : `describe('${plan.symbol}', () =>`;
    const beforeEachHook = `  beforeEach(() => {`;

    lines.push(`${describeFn} {`);
    lines.push(`${beforeEachHook}`);
    lines.push(`    // Setup mocks`);
    lines.push(`  });`);
    lines.push('');

    const isAsync = !!plan.signature && /^\s*async\b/.test(plan.signature);
    // Signature params between the first '(' and its matching ')' — used only
    // to warn that args are required, not to infer real argument values.
    const sigParams = plan.signature?.match(/\(([^)]*)\)/)?.[1]?.trim();
    const needsArgs = !!sigParams && sigParams.length > 0;
    const awaitKw = isAsync ? 'await ' : '';

    for (const s of plan.testScenarios) {
      const testFn = framework === 'mocha' ? `it('${s.name}'` : `it('${s.name}', ${isAsync ? 'async ' : ''}() =>`;
      lines.push(`    ${testFn} {`);
      lines.push(`      // ${s.description}`);
      if (needsArgs) {
        lines.push(`      // TODO: this call needs real arguments — signature: ${plan.signature}`);
      }
      if (!exportedFromFile && factoryHint) {
        lines.push(`      const store = ${factoryHint}();`);
        lines.push(`      const result = ${awaitKw}store.${plan.symbol}(${needsArgs ? '/* args */' : ''});`);
      } else {
        lines.push(`      const result = ${awaitKw}${plan.symbol}(${needsArgs ? '/* args */' : ''});`);
      }
      lines.push(`      expect(result).toBeDefined();`);
      lines.push(`    });`);
      lines.push('');
    }

    lines.push(`});`);
  }

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeImport(srcFile: string, hasTypescript: boolean): string {
  // Convert src/foo/bar.ts → ../foo/bar (relative import for __tests__/bar.test.ts)
  const withoutExt = srcFile.replace(/\.(ts|tsx|js|jsx)$/, '');
  return `.${hasTypescript ? '' : '.js'}/${withoutExt.split('/').pop()!}`;
}
