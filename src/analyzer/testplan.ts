import { execFileSync } from 'node:child_process';
import type { Database } from '../store/db.js';
import type { CodeSymbol, SymbolLink } from '../types.js';
import { isTestFile } from '../utils.js';

export interface MockSuggestion {
  dependency: string;
  kind: string;
  filePath: string;
  strategy: 'stub' | 'spy' | 'fake';
  reason: string;
}

export interface TestSuggestion {
  type: 'unit' | 'integration' | 'edge_case';
  description: string;
  mocksNeeded: string[];
}

export interface TestPlan {
  target: { name: string; kind: string; signature?: string; filePath: string; role?: string };
  dependencies: Array<{ name: string; kind: string; filePath: string; linkType: string }>;
  callers: Array<{ name: string; kind: string; filePath: string }>;
  existingTests: string[];
  mockSuggestions: MockSuggestion[];
  suggestedTests: TestSuggestion[];
}

export interface CoverageGap {
  symbol: CodeSymbol;
  dependents: number;
  riskIfUntested: 'low' | 'medium' | 'high';
}

export interface TestImpactResult {
  changedSymbols: Array<{ name: string; filePath: string }>;
  mustRun: string[];
  shouldRun: string[];
  coverageGaps: Array<{ name: string; filePath: string; dependents: number }>;
}

function classifyMockStrategy(sym: CodeSymbol, linkType: string): { strategy: 'stub' | 'spy' | 'fake'; reason: string } {
  // IO-related patterns
  if (/database|db|sql|query|connect|pool/i.test(sym.name) ||
      /store|repository|repo/i.test(sym.name)) {
    return { strategy: 'fake', reason: 'database/IO dependency' };
  }
  if (/fetch|request|http|api|client/i.test(sym.name) ||
      /read|write|file|stream|socket/i.test(sym.name)) {
    return { strategy: 'fake', reason: 'IO/network dependency' };
  }

  // Classes → partial mock
  if (sym.kind === 'class') {
    return { strategy: 'stub', reason: 'class dependency — stub methods' };
  }

  // Pure utility functions → spy (verify call, use real impl)
  if (sym.role === 'leaf' || sym.role === 'utility') {
    return { strategy: 'spy', reason: 'pure utility — spy to verify calls' };
  }

  // Default for imports/calls
  return { strategy: 'stub', reason: `${linkType} dependency` };
}

function buildTestSuggestions(
  target: CodeSymbol,
  deps: Array<{ name: string; kind: string; filePath: string; linkType: string }>,
  mockSuggestions: MockSuggestion[],
): TestSuggestion[] {
  const suggestions: TestSuggestion[] = [];
  const depNames = deps.map(d => d.name);
  const mockNames = mockSuggestions.map(m => m.dependency);

  // Unit test
  suggestions.push({
    type: 'unit',
    description: `Test ${target.name} in isolation with mocked dependencies`,
    mocksNeeded: mockNames,
  });

  // Integration test if deps exist
  if (deps.length > 0) {
    suggestions.push({
      type: 'integration',
      description: `Test ${target.name} with real ${depNames.slice(0, 3).join(', ')}${depNames.length > 3 ? '...' : ''}`,
      mocksNeeded: mockSuggestions.filter(m => m.strategy === 'fake').map(m => m.dependency),
    });
  }

  // Edge cases based on kind
  if (target.kind === 'function' || target.kind === 'method') {
    suggestions.push({
      type: 'edge_case',
      description: `Test ${target.name} with invalid/empty/null inputs and error paths`,
      mocksNeeded: mockSuggestions.filter(m => m.strategy === 'fake').map(m => m.dependency),
    });
  }

  return suggestions;
}

export function generateTestPlan(db: Database, symbolName: string): TestPlan | null {
  const syms = db.findSymbolByName(symbolName);
  if (syms.length === 0) return null;

  const sym = syms[0];

  // Get direct dependencies (outgoing links)
  const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
  const deps: TestPlan['dependencies'] = [];
  const seen = new Set<string>();
  for (const link of outgoing) {
    const depSym = db.findSymbolById(link.toId);
    if (!depSym || seen.has(depSym.name)) continue;
    seen.add(depSym.name);
    deps.push({ name: depSym.name, kind: depSym.kind, filePath: depSym.filePath, linkType: link.type });
  }

  // Get callers (incoming links — for integration context)
  const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
  const callers: TestPlan['callers'] = [];
  const callerSeen = new Set<string>();
  for (const link of incoming) {
    const callerSym = db.findSymbolById(link.fromId);
    if (!callerSym || callerSeen.has(callerSym.name) || isTestFile(callerSym.filePath)) continue;
    callerSeen.add(callerSym.name);
    callers.push({ name: callerSym.name, kind: callerSym.kind, filePath: callerSym.filePath });
  }

  // Find existing test files
  const existingTests: string[] = [];
  for (const link of incoming) {
    const from = db.findSymbolById(link.fromId);
    if (from && isTestFile(from.filePath) && !existingTests.includes(from.filePath)) {
      existingTests.push(from.filePath);
    }
  }

  // Generate mock suggestions
  const mockSuggestions: MockSuggestion[] = [];
  for (const dep of deps) {
    const depSym = db.findSymbolByName(dep.name)[0];
    if (!depSym) continue;
    const { strategy, reason } = classifyMockStrategy(depSym, dep.linkType);
    mockSuggestions.push({
      dependency: dep.name,
      kind: dep.kind,
      filePath: dep.filePath,
      strategy,
      reason,
    });
  }

  // Generate test suggestions
  const suggestedTests = buildTestSuggestions(sym, deps, mockSuggestions);

  return {
    target: {
      name: sym.name,
      kind: sym.kind,
      signature: sym.signature ?? undefined,
      filePath: sym.filePath,
      role: sym.role ?? undefined,
    },
    dependencies: deps,
    callers,
    existingTests,
    mockSuggestions,
    suggestedTests,
  };
}

export function findCoverageGaps(db: Database, filePath?: string, limit = 30): CoverageGap[] {
  const allSymbols = filePath ? db.getSymbolsByFile(filePath) : db.getAllSymbols();
  const gaps: CoverageGap[] = [];

  for (const sym of allSymbols) {
    if (!sym.exported) continue;
    if (sym.kind === 'type' || sym.kind === 'interface' || sym.kind === 'enum') continue;
    if (isTestFile(sym.filePath)) continue;

    const incoming = db.getIncomingLinks(sym.id);
    const hasTest = incoming.some(l => {
      const from = db.findSymbolById(l.fromId);
      return from && isTestFile(from.filePath);
    });

    if (!hasTest) {
      const upstream = db.findUpstream(sym.id, 1);
      const dependents = upstream.length;
      const risk: 'low' | 'medium' | 'high' =
        (sym.role === 'hub' || dependents > 5) ? 'high' :
        (sym.role === 'entrypoint' || dependents > 2) ? 'medium' : 'low';

      gaps.push({ symbol: sym, dependents, riskIfUntested: risk });
    }
  }

  // Sort by risk (high > medium > low) then by dependents descending
  const riskOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => riskOrder[a.riskIfUntested] - riskOrder[b.riskIfUntested] || b.dependents - a.dependents);

  return gaps.slice(0, limit);
}

export function analyzeTestImpact(db: Database, root: string, ref = 'HEAD'): TestImpactResult {
  // Validate ref
  if (!/^[a-zA-Z0-9\/._~^\-]+$/.test(ref)) {
    return { changedSymbols: [], mustRun: [], shouldRun: [], coverageGaps: [] };
  }

  let changedFiles: string[];
  try {
    const output = execFileSync('git', ['diff', '--name-only', ref], { cwd: root, encoding: 'utf-8' });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf-8' });
    changedFiles = [...new Set([
      ...output.trim().split('\n'),
      ...staged.trim().split('\n'),
    ])].filter(Boolean);
  } catch {
    return { changedSymbols: [], mustRun: [], shouldRun: [], coverageGaps: [] };
  }

  const changedSymbols: TestImpactResult['changedSymbols'] = [];
  const mustRun = new Set<string>();
  const shouldRun = new Set<string>();
  const coverageGaps: TestImpactResult['coverageGaps'] = [];

  // Cache incoming links to avoid redundant queries for shared upstream symbols
  const incomingCache = new Map<string, ReturnType<Database['getIncomingLinks']>>();
  function getCachedIncoming(symId: string) {
    let cached = incomingCache.get(symId);
    if (!cached) {
      cached = db.getIncomingLinks(symId);
      incomingCache.set(symId, cached);
    }
    return cached;
  }

  for (const file of changedFiles) {
    // If the changed file IS a test file, it must run
    if (isTestFile(file)) {
      mustRun.add(file);
      continue;
    }

    const syms = db.getSymbolsByFile(file);
    for (const sym of syms) {
      changedSymbols.push({ name: sym.name, filePath: sym.filePath });

      // Find test files that directly reference this symbol
      const incoming = getCachedIncoming(sym.id);
      let hasDirectTest = false;
      for (const link of incoming) {
        const from = db.findSymbolById(link.fromId);
        if (from && isTestFile(from.filePath)) {
          mustRun.add(from.filePath);
          hasDirectTest = true;
        }
      }

      // Find test files that reference upstream callers (indirect coverage)
      const upstream = db.findUpstream(sym.id, 2);
      for (const { symbol: upSym } of upstream) {
        const upIncoming = getCachedIncoming(upSym.id);
        for (const link of upIncoming) {
          const from = db.findSymbolById(link.fromId);
          if (from && isTestFile(from.filePath)) {
            shouldRun.add(from.filePath);
          }
        }
      }

      if (!hasDirectTest && sym.exported) {
        coverageGaps.push({ name: sym.name, filePath: sym.filePath, dependents: upstream.length });
      }
    }
  }

  // Remove mustRun from shouldRun (no duplicates)
  for (const f of mustRun) shouldRun.delete(f);

  return {
    changedSymbols,
    mustRun: [...mustRun].sort(),
    shouldRun: [...shouldRun].sort(),
    coverageGaps: coverageGaps.sort((a, b) => b.dependents - a.dependents),
  };
}
