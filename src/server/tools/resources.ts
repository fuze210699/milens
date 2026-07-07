import type { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Deps } from './deps.js';
import { ResourceTemplate as Rt } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerResources(server: McpServer, deps: Deps): void {
  const { getDb, fmtSymbol } = deps;

  server.resource(
    'symbol',
    new Rt('milens://symbol/{name}', { list: undefined }),
    { description: 'Symbol context: definition, incoming refs, outgoing deps, role/heat metadata' },
    async (uri, { name }) => {
      const { db } = getDb();
      const symbols = db.findSymbolByName(name as string);
      if (symbols.length === 0) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `"${name}" not found.` }] };
      }
      const lines: string[] = [];
      for (const sym of symbols) {
        lines.push(`${fmtSymbol(sym, 'L2')}${sym.exported ? ' (exported)' : ''}`);
        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        if (incoming.length > 0) {
          lines.push(`incoming (${incoming.length}):`);
          for (const l of incoming) {
            const from = db.findSymbolById(l.fromId);
            lines.push(`  ${l.type}: ${from ? fmtSymbol(from) : l.fromId}`);
          }
        }
        const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
        if (outgoing.length > 0) {
          lines.push(`outgoing (${outgoing.length}):`);
          for (const l of outgoing) {
            const to = db.findSymbolById(l.toId);
            lines.push(`  ${l.type}: ${to ? fmtSymbol(to) : l.toId}`);
          }
        }
        lines.push('');
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );

  server.resource(
    'file-symbols',
    new Rt('milens://file/{+path}', { list: undefined }),
    { description: 'All symbols in a file with ref/dep counts' },
    async (uri, { path }) => {
      const { db } = getDb();
      const filePath = decodeURIComponent(path as string);
      const symbols = db.getSymbolsByFile(filePath);
      if (symbols.length === 0) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `No symbols in "${filePath}".` }] };
      }
      const lines: string[] = [`${filePath}: ${symbols.length} symbols\n`];
      for (const sym of symbols) {
        const incoming = db.getIncomingLinks(sym.id).filter(l => l.type !== 'contains');
        const outgoing = db.getOutgoingLinks(sym.id).filter(l => l.type !== 'contains');
        const exp = sym.exported ? ' (exported)' : '';
        lines.push(`${fmtSymbol(sym, 'L2')}${exp} ← ${incoming.length} refs, → ${outgoing.length} deps`);
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );

  server.resource(
    'domain',
    new Rt('milens://domain/{name}', { list: undefined }),
    { description: 'Domain cluster details: files and top symbols in a domain' },
    async (uri, { name }) => {
      const { db } = getDb();
      const domainName = name as string;
      const allFiles = db.db_getFilesByZone(domainName);
      if (allFiles.length === 0) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Domain "${domainName}" not found.` }] };
      }
      const lines: string[] = [`domain: ${domainName} (${allFiles.length} files)\n`];
      let totalSymbols = 0;
      for (const file of allFiles) {
        const syms = db.getSymbolsByFile(file);
        totalSymbols += syms.length;
        const exported = syms.filter(s => s.exported);
        lines.push(`${file}: ${syms.length} symbols (${exported.length} exported)`);
      }
      lines.push(`\ntotal: ${totalSymbols} symbols in ${allFiles.length} files`);
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );

  server.resource(
    'overview',
    'milens://overview',
    { description: 'Index overview: stats, domains, unresolved, test coverage, staleness' },
    async (uri) => {
      const { db, root, lazy } = getDb();
      const stats = lazy.getCachedStats();
      const unresolved = db.getUnresolvedStats();
      const coverage = db.getTestCoverage();
      const domains = lazy.getCachedDomainStats();
      const staleFiles = db.getStaleFiles(24);

      const lines: string[] = [
        `repo: ${root}`,
        `symbols: ${stats.symbols}`,
        `links: ${stats.links}`,
        `files: ${stats.files}`,
      ];
      if (unresolved.imports > 0 || unresolved.calls > 0) {
        lines.push(`⚠ unresolved (internal): ${unresolved.imports} imports, ${unresolved.calls} calls`);
      }
      if (unresolved.externalImports > 0 || unresolved.externalCalls > 0) {
        lines.push(`external (expected): ${unresolved.externalImports} imports, ${unresolved.externalCalls} calls`);
      }
      if (coverage.testFiles > 0) {
        const pct = coverage.exportedProductionSymbols > 0
          ? Math.round(coverage.testedSymbols / coverage.exportedProductionSymbols * 100) : 0;
        lines.push(`test coverage: ${coverage.testedSymbols}/${coverage.exportedProductionSymbols} (${pct}%) from ${coverage.testFiles} test files`);
      }
      if (domains.length > 0) {
        lines.push(`\ndomains (${domains.length}):`);
        for (const d of domains) {
          lines.push(`  ${d.domain}: ${d.files} files, ${d.symbols} symbols`);
        }
      }
      if (staleFiles.length > 0) {
        lines.push(`\n⏳ ${staleFiles.length} stale files (>24h)`);
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: lines.join('\n') }] };
    },
  );
}
