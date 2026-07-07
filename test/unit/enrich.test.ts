import { describe, it, expect } from 'vitest';
import { enrichMetadata } from '../../src/analyzer/enrich.js';
import type { CodeSymbol, SymbolLink } from '../../src/types.js';

function makeSym(id: string, name: string, kind: string, filePath: string, exported: boolean): CodeSymbol {
  return { id, name, kind: kind as any, filePath, startLine: 1, endLine: 10, exported };
}

function makeLink(id: string, fromId: string, toId: string, type: string = 'calls'): SymbolLink {
  return { id, fromId, toId, type: type as any, confidence: 1 };
}

describe('enrichMetadata', () => {
  describe('role assignment', () => {
    it('assigns datatype role to interfaces', () => {
      const sym = makeSym('1', 'MyInterface', 'interface', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('datatype');
    });

    it('assigns datatype role to types', () => {
      const sym = makeSym('1', 'MyType', 'type', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('datatype');
    });

    it('assigns datatype role to enums', () => {
      const sym = makeSym('1', 'MyEnum', 'enum', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('datatype');
    });

    it('assigns datatype role to structs', () => {
      const sym = makeSym('1', 'MyStruct', 'struct', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('datatype');
    });

    it('assigns datatype role even with incoming and outgoing links', () => {
      const a = makeSym('a', 'MyInterface', 'interface', 'src/a.ts', true);
      const b = makeSym('b', 'fn', 'function', 'src/b.ts', true);
      const c = makeSym('c', 'fn2', 'function', 'src/c.ts', true);
      const input = {
        symbols: [a, b, c],
        links: [
          makeLink('l1', 'b', 'a', 'calls'),
          makeLink('l2', 'a', 'c', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('datatype');
    });

    it('assigns entrypoint role: exported, 0 incoming, >0 outgoing', () => {
      const main = makeSym('main', 'main', 'function', 'src/main.ts', true);
      const lib = makeSym('lib', 'helper', 'function', 'src/lib.ts', true);
      const input = {
        symbols: [main, lib],
        links: [makeLink('l1', 'main', 'lib', 'calls')],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('entrypoint');
    });

    it('does not assign entrypoint when outDeg is 0', () => {
      const sym = makeSym('1', 'fn', 'function', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).not.toBe('entrypoint');
    });

    it('does not assign entrypoint when inDeg > 0', () => {
      const a = makeSym('a', 'caller', 'function', 'src/a.ts', true);
      const b = makeSym('b', 'callee', 'function', 'src/b.ts', true);
      const input = {
        symbols: [a, b],
        links: [makeLink('l1', 'a', 'b', 'calls')],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('entrypoint');
      expect(result.symbols[1].role).toBe('leaf');
    });

    it('assigns hub role: inDeg >= 3 and outDeg >= 3', () => {
      const hub = makeSym('hub', 'Hub', 'function', 'src/hub.ts', true);
      const a1 = makeSym('a1', 'a1', 'function', 'src/a1.ts', true);
      const a2 = makeSym('a2', 'a2', 'function', 'src/a2.ts', true);
      const a3 = makeSym('a3', 'a3', 'function', 'src/a3.ts', true);
      const b1 = makeSym('b1', 'b1', 'function', 'src/b1.ts', true);
      const b2 = makeSym('b2', 'b2', 'function', 'src/b2.ts', true);
      const b3 = makeSym('b3', 'b3', 'function', 'src/b3.ts', true);
      const input = {
        symbols: [hub, a1, a2, a3, b1, b2, b3],
        links: [
          makeLink('l1', 'a1', 'hub', 'calls'),
          makeLink('l2', 'a2', 'hub', 'calls'),
          makeLink('l3', 'a3', 'hub', 'calls'),
          makeLink('l4', 'hub', 'b1', 'calls'),
          makeLink('l5', 'hub', 'b2', 'calls'),
          makeLink('l6', 'hub', 'b3', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('hub');
    });

    it('assigns leaf role: inDeg > 0 and outDeg === 0', () => {
      const caller = makeSym('caller', 'caller', 'function', 'src/a.ts', true);
      const leaf = makeSym('leaf', 'leafFn', 'function', 'src/b.ts', true);
      const input = {
        symbols: [caller, leaf],
        links: [makeLink('l1', 'caller', 'leaf', 'calls')],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[1].role).toBe('leaf');
    });

    it('assigns utility role: exported with inDeg === 1 and outDeg > 0', () => {
      const caller = makeSym('caller', 'caller', 'function', 'src/a.ts', true);
      const util = makeSym('util', 'helper', 'function', 'src/b.ts', true);
      const callee = makeSym('callee', 'callee', 'function', 'src/c.ts', true);
      const input = {
        symbols: [caller, util, callee],
        links: [
          makeLink('l1', 'caller', 'util', 'calls'),
          makeLink('l2', 'util', 'callee', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[1].role).toBe('utility');
    });

    it('assigns utility role: exported with inDeg === 2 and outDeg > 0', () => {
      const a = makeSym('a', 'a', 'function', 'src/a.ts', true);
      const b = makeSym('b', 'b', 'function', 'src/b.ts', true);
      const util = makeSym('util', 'helper', 'function', 'src/c.ts', true);
      const callee = makeSym('callee', 'callee', 'function', 'src/d.ts', true);
      const input = {
        symbols: [a, b, util, callee],
        links: [
          makeLink('l1', 'a', 'util', 'calls'),
          makeLink('l2', 'b', 'util', 'calls'),
          makeLink('l3', 'util', 'callee', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[2].role).toBe('utility');
    });

    it('defaults to utility for exported symbols with no link match', () => {
      const sym = makeSym('1', 'fn', 'function', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('utility');
    });

    it('defaults to leaf for non-exported symbols with no link match', () => {
      const sym = makeSym('1', 'fn', 'function', 'src/a.ts', false);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('leaf');
    });

    it('class is not treated as datatype', () => {
      const sym = makeSym('1', 'MyClass', 'class', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('utility');
    });
  });

  describe('heat computation', () => {
    it('computes min heat for exported function with no links', () => {
      const sym = makeSym('1', 'fn', 'function', 'src/a.ts', true);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].heat).toBe(15);
    });

    it('returns 0 for non-exported variable with no links', () => {
      const sym = makeSym('1', 'x', 'variable', 'src/a.ts', false);
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].heat).toBe(0);
    });

    it('caps fanInScore at 50', () => {
      const hub = makeSym('hub', 'Hub', 'function', 'src/hub.ts', true);
      const callers = Array.from({ length: 5 }, (_, i) =>
        makeSym(`c${i}`, `caller${i}`, 'function', `src/c${i}.ts`, true),
      );
      const symbols = [hub, ...callers];
      const links = callers.map((c, i) => makeLink(`l${i}`, c.id, hub.id, 'calls'));
      const result = enrichMetadata({ symbols, links });
      expect(result.symbols[0].heat).toBe(65);
    });

    it('caps fanOutScore at 25', () => {
      const hub = makeSym('hub', 'Hub', 'function', 'src/hub.ts', true);
      const callees = Array.from({ length: 6 }, (_, i) =>
        makeSym(`t${i}`, `target${i}`, 'function', `src/t${i}.ts`, true),
      );
      const symbols = [hub, ...callees];
      const links = callees.map((t, i) => makeLink(`l${i}`, hub.id, t.id, 'calls'));
      const result = enrichMetadata({ symbols, links });
      expect(result.symbols[0].heat).toBe(40);
    });

    it('adds export bonus for exported symbols', () => {
      const exported = makeSym('1', 'fn', 'variable', 'src/a.ts', true);
      const notExported = makeSym('2', 'fn2', 'variable', 'src/a.ts', false);
      const input = { symbols: [exported, notExported], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].heat).toBe(10);
      expect(result.symbols[1].heat).toBe(0);
    });

    it('adds kind bonus for function, class, and method', () => {
      const fnSym = makeSym('1', 'fn', 'function', 'src/a.ts', false);
      const classSym = makeSym('2', 'Cls', 'class', 'src/b.ts', false);
      const methodSym = makeSym('3', 'm', 'method', 'src/c.ts', false);
      const varSym = makeSym('4', 'x', 'variable', 'src/d.ts', false);
      const intfSym = makeSym('5', 'I', 'interface', 'src/e.ts', false);
      const input = { symbols: [fnSym, classSym, methodSym, varSym, intfSym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].heat).toBe(5);
      expect(result.symbols[1].heat).toBe(5);
      expect(result.symbols[2].heat).toBe(5);
      expect(result.symbols[3].heat).toBe(0);
      expect(result.symbols[4].heat).toBe(0);
    });

    it('caps total heat at 100', () => {
      const sym = makeSym('1', 'big', 'function', 'src/a.ts', true);
      const callers = Array.from({ length: 10 }, (_, i) =>
        makeSym(`c${i}`, `c${i}`, 'function', `src/c${i}.ts`, true),
      );
      const callees = Array.from({ length: 10 }, (_, i) =>
        makeSym(`t${i}`, `t${i}`, 'function', `src/t${i}.ts`, true),
      );
      const symbols = [sym, ...callers, ...callees];
      const links = [
        ...callers.map((c, i) => makeLink(`li${i}`, c.id, sym.id, 'calls')),
        ...callees.map((t, i) => makeLink(`lo${i}`, sym.id, t.id, 'calls')),
      ];
      const result = enrichMetadata({ symbols, links });
      expect(result.symbols[0].heat).toBe(90);
    });

    it('computes heat for moderate fan-in and fan-out', () => {
      const hub = makeSym('hub', 'Hub', 'function', 'src/hub.ts', true);
      const callers = Array.from({ length: 3 }, (_, i) =>
        makeSym(`c${i}`, `c${i}`, 'function', `src/c${i}.ts`, true),
      );
      const callees = Array.from({ length: 3 }, (_, i) =>
        makeSym(`t${i}`, `t${i}`, 'function', `src/t${i}.ts`, true),
      );
      const symbols = [hub, ...callers, ...callees];
      const links = [
        ...callers.map((c, i) => makeLink(`li${i}`, c.id, hub.id, 'calls')),
        ...callees.map((t, i) => makeLink(`lo${i}`, hub.id, t.id, 'calls')),
      ];
      const result = enrichMetadata({ symbols, links });
      expect(result.symbols[0].heat).toBe(75);
    });
  });

  describe('domain clustering', () => {
    it('clusters files with 2+ cross-file links into the same zone', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/moduleA/fileA.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/moduleA/fileB.ts', true);
      const input = {
        symbols: [a, b],
        links: [
          makeLink('l1', 'a', 'b', 'calls'),
          makeLink('l2', 'b', 'a', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      const zoneA = result.zones.get('src/moduleA/fileA.ts');
      const zoneB = result.zones.get('src/moduleA/fileB.ts');
      expect(zoneA).toBeDefined();
      expect(zoneA).toBe(zoneB);
    });

    it('does not cluster files with only 1 cross-file link', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/modA/fileA.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/modB/fileB.ts', true);
      const input = {
        symbols: [a, b],
        links: [makeLink('l1', 'a', 'b', 'calls')],
      };
      const result = enrichMetadata(input);
      const zoneA = result.zones.get('src/modA/fileA.ts');
      const zoneB = result.zones.get('src/modB/fileB.ts');
      expect(zoneA).not.toBe(zoneB);
    });

    it('names each zone by the most common directory segment', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/analyzer/enrich.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/analyzer/resolver.ts', true);
      const input = {
        symbols: [a, b],
        links: [
          makeLink('l1', 'a', 'b', 'calls'),
          makeLink('l2', 'b', 'a', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.zones.get('src/analyzer/enrich.ts')).toBe('analyzer');
      expect(result.zones.get('src/analyzer/resolver.ts')).toBe('analyzer');
    });

    it('picks the most common segment when files span multiple dirs', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/analyzer/enrich.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/analyzer/resolver.ts', true);
      const c = makeSym('c', 'cFn', 'function', 'src/parser/parse.ts', true);
      const input = {
        symbols: [a, b, c],
        links: [
          makeLink('l1', 'a', 'b', 'calls'),
          makeLink('l2', 'b', 'a', 'calls'),
          makeLink('l3', 'a', 'c', 'calls'),
          makeLink('l4', 'c', 'a', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.zones.get('src/analyzer/enrich.ts')).toBe('analyzer');
      expect(result.zones.get('src/parser/parse.ts')).toBe('analyzer');
    });

    it('assigns an isolated file its own zone', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/utils/helper.ts', true);
      const input = { symbols: [a], links: [] };
      const result = enrichMetadata(input);
      expect(result.zones.get('src/utils/helper.ts')).toBe('utils');
    });

    it('assigns separate zones for isolated files in different directories', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/a.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/sub/b.ts', true);
      const input = { symbols: [a, b], links: [] };
      const result = enrichMetadata(input);
      expect(result.zones.size).toBe(2);
      expect(result.zones.get('src/a.ts')).not.toBe(result.zones.get('src/sub/b.ts'));
    });
  });

  describe('edge cases', () => {
    it('handles empty symbols array', () => {
      const result = enrichMetadata({ symbols: [], links: [] });
      expect(result.symbols).toEqual([]);
      expect(result.zones.size).toBe(0);
    });

    it('excludes contains links from degree counting', () => {
      const parent = makeSym('parent', 'Parent', 'class', 'src/a.ts', true);
      const child = makeSym('child', 'method', 'method', 'src/a.ts', true);
      const caller = makeSym('caller', 'caller', 'function', 'src/b.ts', true);
      const input = {
        symbols: [parent, child, caller],
        links: [
          makeLink('l1', 'parent', 'child', 'contains'),
          makeLink('l2', 'caller', 'child', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[1].role).toBe('leaf');
      expect(result.symbols[0].role).toBe('utility');
    });

    it('excludes contains links from domain clustering', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/analyzer/a.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/parser/b.ts', true);
      const input = {
        symbols: [a, b],
        links: [
          makeLink('l1', 'a', 'b', 'contains'),
          makeLink('l2', 'a', 'b', 'contains'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.zones.get('src/analyzer/a.ts')).not.toBe(result.zones.get('src/parser/b.ts'));
    });

    it('handles circular dependencies', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/a.ts', true);
      const b = makeSym('b', 'bFn', 'function', 'src/b.ts', true);
      const input = {
        symbols: [a, b],
        links: [
          makeLink('l1', 'a', 'b', 'calls'),
          makeLink('l2', 'b', 'a', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[0].heat).toBeGreaterThan(0);
      expect(result.symbols[1].heat).toBeGreaterThan(0);
      expect(result.zones.get('src/a.ts')).toBe(result.zones.get('src/b.ts'));
    });

    it('handles links to non-existent symbol IDs gracefully', () => {
      const a = makeSym('a', 'aFn', 'function', 'src/a.ts', true);
      const input = {
        symbols: [a],
        links: [
          makeLink('l1', 'a', 'nonexistent', 'calls'),
          makeLink('l2', 'nonexistent2', 'a', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.symbols[0].role).toBe('utility');
    });

    it('preserves existing symbol fields', () => {
      const sym: CodeSymbol = {
        id: '1', name: 'fn', kind: 'function', filePath: 'src/a.ts',
        startLine: 1, endLine: 10, exported: true,
        signature: '() => void', parentId: 'parent1',
      };
      const input = { symbols: [sym], links: [] };
      const result = enrichMetadata(input);
      expect(result.symbols[0].id).toBe('1');
      expect(result.symbols[0].name).toBe('fn');
      expect(result.symbols[0].signature).toBe('() => void');
      expect(result.symbols[0].parentId).toBe('parent1');
      expect(result.symbols[0].startLine).toBe(1);
      expect(result.symbols[0].endLine).toBe(10);
    });

    it('returns a zones map covering all files', () => {
      const a = makeSym('a', 'a', 'function', 'src/a.ts', true);
      const b = makeSym('b', 'b', 'function', 'src/b.ts', true);
      const input = { symbols: [a, b], links: [] };
      const result = enrichMetadata(input);
      expect(result.zones.has('src/a.ts')).toBe(true);
      expect(result.zones.has('src/b.ts')).toBe(true);
    });

    it('handles multiple symbols in the same file', () => {
      const a = makeSym('a', 'fn1', 'function', 'src/a.ts', true);
      const b = makeSym('b', 'fn2', 'function', 'src/a.ts', true);
      const c = makeSym('c', 'fn3', 'function', 'src/b.ts', true);
      const input = {
        symbols: [a, b, c],
        links: [
          makeLink('l1', 'a', 'c', 'calls'),
          makeLink('l2', 'c', 'a', 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      expect(result.zones.get('src/a.ts')).toBe(result.zones.get('src/b.ts'));
    });
  });

  describe('deduplication', () => {
    it('counts imports + calls from same caller as one signal for fan-in', () => {
      const target = makeSym('t', 'sharedLib', 'function', 'src/lib.ts', true);
      const topA = makeSym('a_top', '_top', 'module', 'src/a.ts', false);
      const callerA = makeSym('a', 'callerA', 'function', 'src/a.ts', true);
      const topB = makeSym('b_top', '_top', 'module', 'src/b.ts', false);
      const callerB = makeSym('b', 'callerB', 'function', 'src/b.ts', true);

      const input = {
        symbols: [target, topA, callerA, topB, callerB],
        links: [
          makeLink('li1', topA.id, target.id, 'imports'),
          makeLink('lc1', callerA.id, target.id, 'calls'),
          makeLink('li2', topB.id, target.id, 'imports'),
          makeLink('lc2', callerB.id, target.id, 'calls'),
        ],
      };
      const result = enrichMetadata(input);
      // imports + calls from the same file = 1 real dependent → fan-in of 2, not 4
      // With 2 incoming, out=0 → leaf role, not hub (hub requires >=3 in AND >=3 out)
      const lib = result.symbols.find(s => s.name === 'sharedLib')!;
      expect(lib.heat).toBeLessThanOrEqual(45); // 2*15=30 + 0 + 10 + 5 = 45
      expect(lib.role).toBe('leaf'); // 2 in, 0 out → leaf
    });

    it('does not count imports + calls from different callers as duplicate', () => {
      const target = makeSym('t', 'hubFn', 'function', 'src/lib.ts', true);
      const helpers: CodeSymbol[] = [];
      const links: SymbolLink[] = [];
      // 3 different files each with one call
      for (let i = 0; i < 3; i++) {
        const caller = makeSym(`c${i}`, `caller${i}`, 'function', `src/f${i}.ts`, true);
        helpers.push(caller);
        links.push(makeLink(`l${i}`, caller.id, target.id, 'calls'));
      }
      // target also calls a helper
      const helper = makeSym('h', 'helper', 'function', 'src/lib.ts', false);
      links.push(makeLink('out', target.id, helper.id, 'calls'));

      const input = {
        symbols: [target, ...helpers, helper],
        links,
      };
      const result = enrichMetadata(input);
      const hubFn = result.symbols.find(s => s.name === 'hubFn')!;
      expect(hubFn.role).not.toBe('leaf'); // 3 in, 1 out → hub
    });
  });
});
