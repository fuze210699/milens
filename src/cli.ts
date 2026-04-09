#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join, dirname, basename } from 'node:path';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAliases } from './analyzer/config.js';

const program = new Command();

const __filename = fileURLToPath(import.meta.url);
const PKG_VERSION: string = JSON.parse(readFileSync(join(dirname(__filename), '..', 'package.json'), 'utf-8')).version;

program
  .name('milens')
  .description('Code intelligence engine — analyze codebases, build knowledge graphs, serve via MCP')
  .version(PKG_VERSION);

program
  .command('analyze')
  .description('Index a codebase: parse symbols, resolve dependencies, build search index')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('-o, --output <dir>', 'Output directory for database')
  .option('-v, --verbose', 'Show detailed progress')
  .option('-f, --force', 'Force full re-index')
  .option('-s, --skills', 'Generate skill files for all supported editors')
  .option('--skills-copilot', 'Generate skill files for GitHub Copilot only')
  .option('--skills-cursor', 'Generate skill files for Cursor only')
  .option('--skills-claude', 'Generate skill files for Claude Code only')
  .option('--skills-agents', 'Generate skill files for AGENTS.md only')
  .option('--skills-windsurf', 'Generate config for Windsurf only')
  .action(async (opts) => {
    const rootPath = resolve(opts.path);
    const outDir = opts.output ?? join(rootPath, '.milens');
    mkdirSync(outDir, { recursive: true });
    const dbPath = join(outDir, 'milens.db');

    // Load project aliases (tsconfig paths, etc.)
    const aliases = loadAliases(rootPath);

    const { analyze } = await import('./analyzer/engine.js');
    const stats = await analyze({
      rootPath,
      dbPath,
      verbose: opts.verbose,
      force: opts.force,
      aliases,
    });

    // Register in global registry
    const contentHash = createHash('sha256').update(JSON.stringify(stats)).digest('hex').slice(0, 12);
    const { RepoRegistry } = await import('./store/registry.js');
    new RepoRegistry().register(rootPath, dbPath, contentHash);

    console.log(`\n✓ Indexed ${stats.symbolCount} symbols, ${stats.linkCount} links across ${stats.filesParsed} files (${stats.durationMs}ms)`);

    if (opts.skills || opts.skillsCopilot || opts.skillsCursor || opts.skillsClaude || opts.skillsAgents || opts.skillsWindsurf) {
      const editors: string[] | undefined = opts.skills
        ? undefined  // all editors
        : [
            ...(opts.skillsCopilot ? ['copilot'] : []),
            ...(opts.skillsCursor ? ['cursor'] : []),
            ...(opts.skillsClaude ? ['claude'] : []),
            ...(opts.skillsAgents ? ['agents'] : []),
            ...(opts.skillsWindsurf ? ['windsurf'] : []),
          ];
      const { Database } = await import('./store/db.js');
      const { generateSkills } = await import('./skills.js');
      const db = new Database(dbPath);
      const result = generateSkills(db, rootPath, editors);
      db.close();
      console.log(`✓ Generated ${result.count} skill files for ${editors ? editors.join(', ') : 'all editors'}:`);
      for (const d of result.dirs) console.log(`  ${d}`);
    }
  });

program
  .command('search <query>')
  .description('Search symbols by name')
  .option('-l, --limit <n>', 'Max results', '20')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (query, opts) => {
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const results = db.searchSymbols(query, parseInt(opts.limit));
    for (const s of results) {
      console.log(`${s.name} [${s.kind}] ${s.filePath}:${s.startLine}${s.exported ? ' (exported)' : ''}`);
    }
    db.close();
  });

program
  .command('inspect <symbol>')
  .description('360° view of a symbol: refs, deps, hierarchy')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (symbol, opts) => {
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const symbols = db.findSymbolByName(symbol);
    for (const sym of symbols) {
      console.log(`\n${sym.name} [${sym.kind}] ${sym.filePath}:${sym.startLine}`);
      const incoming = db.getIncomingLinks(sym.id);
      if (incoming.length) {
        console.log('  incoming:');
        for (const l of incoming) {
          const from = db.findSymbolById(l.fromId);
          console.log(`    ${l.type}: ${from?.name ?? l.fromId} (${from?.filePath ?? '?'})`);
        }
      }
      const outgoing = db.getOutgoingLinks(sym.id);
      if (outgoing.length) {
        console.log('  outgoing:');
        for (const l of outgoing) {
          const to = db.findSymbolById(l.toId);
          console.log(`    ${l.type}: ${to?.name ?? l.toId} (${to?.filePath ?? '?'})`);
        }
      }
    }
    db.close();
  });

program
  .command('impact <symbol>')
  .description('Blast radius: what breaks if this symbol changes?')
  .option('-d, --direction <dir>', 'upstream or downstream', 'upstream')
  .option('--depth <n>', 'Max traversal depth', '3')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (symbol, opts) => {
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const symbols = db.findSymbolByName(symbol);
    const depth = parseInt(opts.depth);
    for (const sym of symbols) {
      console.log(`\nTARGET: ${sym.name} [${sym.kind}] ${sym.filePath}:${sym.startLine}`);
      const refs = opts.direction === 'upstream'
        ? db.findUpstream(sym.id, depth)
        : db.findDownstream(sym.id, depth);
      if (refs.length === 0) {
        console.log(`  No ${opts.direction} dependencies.`);
      }
      for (const { symbol: ref, depth: d, via } of refs) {
        console.log(`  [depth ${d}] ${ref.name} [${ref.kind}] ${ref.filePath}:${ref.startLine} (${via})`);
      }
    }
    db.close();
  });

program
  .command('serve')
  .description('Start MCP server')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--http', 'Use HTTP transport instead of stdio')
  .option('--port <port>', 'HTTP port', '3100')
  .action(async (opts) => {
    if (opts.http) {
      const { startHttp } = await import('./server/mcp.js');
      await startHttp(parseInt(opts.port), resolve(opts.path));
    } else {
      const { startStdio } = await import('./server/mcp.js');
      await startStdio(resolve(opts.path));
    }
  });

program
  .command('status')
  .description('Show index status')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (opts) => {
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const reg = new RepoRegistry();
    const entry = reg.findByRoot(resolve(opts.path));
    if (!entry) { console.log('Not indexed.'); return; }
    const db = new Database(entry.dbPath);
    const stats = db.getStats();
    console.log(`Repository: ${entry.rootPath}`);
    console.log(`Database:   ${entry.dbPath}`);
    console.log(`Indexed:    ${entry.analyzedAt}`);
    console.log(`Symbols:    ${stats.symbols}`);
    console.log(`Links:      ${stats.links}`);
    console.log(`Files:      ${stats.files}`);
    db.close();
  });

program
  .command('list')
  .description('List all indexed repositories')
  .action(async () => {
    const { RepoRegistry } = await import('./store/registry.js');
    const entries = new RepoRegistry().listAll();
    if (entries.length === 0) {
      console.log('No indexed repositories.');
      return;
    }
    console.log(`${entries.length} indexed repositories:\n`);
    for (const entry of entries) {
      console.log(`  ${entry.rootPath}`);
      console.log(`    DB:      ${entry.dbPath}`);
      console.log(`    Indexed: ${entry.analyzedAt}`);
      console.log('');
    }
  });

program
  .command('clean')
  .description('Remove index for a repository')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--all', 'Remove all indexes')
  .action(async (opts) => {
    const { RepoRegistry } = await import('./store/registry.js');
    const reg = new RepoRegistry();
    if (opts.all) {
      const entries = reg.listAll();
      for (const e of entries) {
        deleteIndex(e.dbPath);
        reg.remove(e.rootPath);
      }
      console.log(`Cleaned ${entries.length} repositories.`);
    } else {
      const rootPath = resolve(opts.path);
      const entry = reg.findByRoot(rootPath);
      if (!entry) {
        console.log('Not indexed.');
        return;
      }
      deleteIndex(entry.dbPath);
      reg.remove(rootPath);
      console.log(`Cleaned index for ${rootPath}`);
    }
  });

program.parse();

// ── Helpers ──

function deleteIndex(dbPath: string): void {
  const dir = dirname(dbPath);
  if (basename(dir) === '.milens') {
    rmSync(dir, { recursive: true, force: true });
  } else {
    for (const suffix of ['', '-wal', '-shm']) {
      try { rmSync(dbPath + suffix, { force: true }); } catch { /* ignore */ }
    }
  }
}
