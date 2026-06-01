import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { analyze } from '../../src/analyzer/engine.js';
import { Database } from '../../src/store/db.js';
import { loadAliases } from '../../src/analyzer/config.js';

interface ExpectedLink {
  fromFile: string;
  toFile: string;
  type: string;
  fromName: string;
  toName: string;
}

interface ExpectedSpec {
  minPrecision: number;
  minRecall: number;
  links: ExpectedLink[];
}

interface LinkResult {
  fromFile: string;
  toFile: string;
  fromName: string;
  toName: string;
  type: string;
  confidence: number;
}

const ACCURACY = join(import.meta.dirname, '..', 'fixtures', 'accuracy');

const projects = ['ts-project', 'py-project', 'go-project', 'rust-project'] as const;

function linkMatches(expected: ExpectedLink, actual: LinkResult): boolean {
  return actual.fromFile.includes(expected.fromFile) &&
    actual.toFile.includes(expected.toFile) &&
    actual.type === expected.type &&
    actual.fromName === expected.fromName &&
    actual.toName === expected.toName;
}

describe('Accuracy Validation', () => {
  const dbPaths: string[] = [];

  afterAll(() => {
    for (const p of dbPaths) {
      if (existsSync(p)) {
        try { unlinkSync(p); } catch { /* ignore EBUSY */ }
      }
    }
  });

  for (const project of projects) {
    it(`${project}: meets precision/recall thresholds`, async () => {
      const rootPath = join(ACCURACY, project);
      const milensDir = join(rootPath, '.milens');
      const dbPath = join(milensDir, 'accuracy.db');
      const expectedPath = join(rootPath, 'expected.json');

      mkdirSync(milensDir, { recursive: true });
      if (existsSync(dbPath)) {
        try { unlinkSync(dbPath); } catch { /* ignore */ }
      }
      dbPaths.push(dbPath);

      const expected: ExpectedSpec = JSON.parse(readFileSync(expectedPath, 'utf-8'));

      const aliases = loadAliases(rootPath);
      const stats = await analyze({ rootPath, dbPath, force: true, aliases });

      expect(stats.symbolCount).toBeGreaterThan(0);
      expect(stats.linkCount).toBeGreaterThan(0);

      const db = new Database(dbPath);
      const allSymbols = db.getAllSymbols();
      const allLinks = db.getAllLinks();

      // Build actual links list with symbol info
      const symbolById = new Map<string, { name: string; filePath: string; kind: string }>();
      for (const sym of allSymbols) {
        symbolById.set(sym.id, { name: sym.name, filePath: sym.filePath, kind: sym.kind });
      }

      const actualLinks: LinkResult[] = [];
      for (const link of allLinks) {
        const from = symbolById.get(link.fromId);
        const to = symbolById.get(link.toId);
        if (from && to) {
          actualLinks.push({
            fromFile: from.filePath,
            toFile: to.filePath,
            fromName: from.name,
            toName: to.name,
            type: link.type,
            confidence: link.confidence,
          });
        }
      }

      // Debug: print actual links for verification (comment out in CI)
      // console.log(`[${project}] Actual links:`, JSON.stringify(actualLinks, null, 2));

      // Compute precision/recall on expected links
      let expectedFound = 0;
      const totalActual = actualLinks.length;

      for (const el of expected.links) {
        const match = actualLinks.find(al => linkMatches(el, al));
        if (match) expectedFound++;
      }

      // Precision: what fraction of actual links match expected?
      // Recall: what fraction of expected links were found?
      const precision = totalActual > 0 ? expectedFound / totalActual : 0;
      const recall = expected.links.length > 0 ? expectedFound / expected.links.length : 1;

      // Track cross-file call links as a baseline sanity check
      const crossFileCalls = actualLinks.filter(al =>
        al.type === 'calls' && al.fromFile !== al.toFile
      );
      expect(crossFileCalls.length, `${project}: should have cross-file calls`).toBeGreaterThanOrEqual(1);

      // Verify thresholds
      expect(precision, `${project}: precision`).toBeGreaterThanOrEqual(expected.minPrecision);
      if (expected.links.length > 0) {
        expect(recall, `${project}: recall`).toBeGreaterThanOrEqual(expected.minRecall);
      }

      db.close();
    }, 30000);
  }
});
