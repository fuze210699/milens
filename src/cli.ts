#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join, dirname, basename } from 'node:path';
import { mkdirSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAliases } from './analyzer/config.js';
import { generateDashboardHtml } from './cli-dashboard.js';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 20) {
  process.stderr.write(`milens requires Node.js >= 20.0.0 (current: ${process.version})\n`);
  process.exit(1);
}

const program = new Command();

const __filename = fileURLToPath(import.meta.url);
const PKG_VERSION: string = process.env.MILENS_VERSION ?? JSON.parse(readFileSync(join(dirname(__filename), '..', 'package.json'), 'utf-8')).version;

// Files each harness adapter contributes, relative to adapters/<harness>/ (src) and
// the project root (dest). Copying never overwrites a file that already exists at dest.
const HARNESS_ADAPTER_FILES: Record<string, Array<{ src: string; dest: string }>> = {
  'claude-code': [
    { src: '.claude/mcp.json', dest: '.claude/mcp.json' },
    { src: 'CLAUDE.md', dest: 'CLAUDE.md' },
  ],
  'opencode': [
    { src: '.opencode/config.json', dest: '.opencode/config.json' },
    { src: 'AGENTS.md', dest: 'AGENTS.md' },
  ],
  'codex': [
    { src: '.codex/config.toml', dest: '.codex/config.toml' },
    { src: '.codex/codex.md', dest: '.codex/codex.md' },
  ],
  'cursor': [
    { src: '.cursor/mcp.json', dest: '.cursor/mcp.json' },
    { src: '.cursorrules', dest: '.cursorrules' },
  ],
  'copilot': [
    { src: '.vscode/mcp.json', dest: '.vscode/mcp.json' },
    { src: '.github/copilot-instructions.md', dest: '.github/copilot-instructions.md' },
  ],
  'gemini': [
    { src: '.gemini/settings.json', dest: '.gemini/settings.json' },
    { src: '.gemini/context.md', dest: '.gemini/context.md' },
  ],
  'zed': [
    { src: '.zed/settings.json', dest: '.zed/settings.json' },
  ],
};

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
  .option('-q, --quiet', 'Suppress progress output')
  .option('-f, --force', 'Force full re-index')
  .option('--files <paths...>', 'Only re-index specific files (relative to root)')
  .option('-s, --skills', 'Generate skill files for all supported editors')
  .option('--skills-copilot', 'Generate skill files for GitHub Copilot only')
  .option('--skills-cursor', 'Generate skill files for Cursor only')
  .option('--skills-claude', 'Generate skill files for Claude Code only')
  .option('--skills-agents', 'Generate skill files for AGENTS.md only')
  .option('--skills-windsurf', 'Generate config for Windsurf only')
  .option('--embeddings', 'Generate vector embeddings for semantic search')
  .action(async (opts) => {
    const rootPath = resolve(opts.path);
    const outDir = opts.output ?? join(rootPath, '.milens');
    mkdirSync(outDir, { recursive: true });
    const dbPath = join(outDir, 'milens.db');

    // Load project aliases (tsconfig paths, etc.)
    const aliases = loadAliases(rootPath);

    const { analyze } = await import('./analyzer/engine.js');
    const { createProgressReporter } = await import('./ui/progress.js');
    const reporter = opts.quiet ? undefined : createProgressReporter();

    // Restore cursor on Ctrl+C
    const onSigint = () => { reporter?.finalize(); process.exit(1); };
    process.on('SIGINT', onSigint);

    try {
      const stats = await analyze({
        rootPath,
        dbPath,
        verbose: opts.verbose,
        force: opts.force,
        aliases,
        embeddings: opts.embeddings,
        files: opts.files,
        onProgress: reporter,
      });

      const contentHash = createHash('sha256').update(JSON.stringify(stats)).digest('hex').slice(0, 12);
      const { RepoRegistry } = await import('./store/registry.js');
      new RepoRegistry().register(rootPath, dbPath, contentHash);

      if (reporter) {
        // finalize was called in analyze, just print skills if needed
      } else {
        console.log(`\n✓ Indexed ${stats.symbolCount} symbols, ${stats.linkCount} links across ${stats.filesParsed} files (${stats.durationMs}ms)`);
      }
    } finally {
      process.off('SIGINT', onSigint);
      reporter?.finalize();
    }

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
    if (results.length === 0) {
      console.log(`No symbols matching "${query}". Try \`milens search\` with a broader term, or \`milens analyze --force\` if the index is stale.`);
    }
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
    if (symbols.length === 0) {
      console.error(`Symbol not found: "${symbol}". Run \`milens search ${symbol}\` to find the right name.`);
      db.close();
      process.exit(1);
    }
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
    if (opts.direction !== 'upstream' && opts.direction !== 'downstream') {
      console.error(`Invalid --direction "${opts.direction}". Valid: upstream, downstream`);
      process.exit(2);
    }
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const symbols = db.findSymbolByName(symbol);
    if (symbols.length === 0) {
      console.error(`Symbol not found: "${symbol}". Run \`milens search ${symbol}\` to find the right name.`);
      db.close();
      process.exit(1);
    }
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
  .option('-p, --path <path>', 'Repository root path (defaults to $CLAUDE_PROJECT_DIR, then cwd)')
  .option('--http', 'Use HTTP transport instead of stdio')
  .option('--port <port>', 'HTTP port', '3100')
  .option('--profile <profile>', 'Tool profile: minimal|standard|full (overrides MILENS_PROFILE)')
  .action(async (opts) => {
    if (opts.profile !== undefined) {
      if (!['minimal', 'standard', 'full'].includes(opts.profile)) {
        console.error(`Invalid --profile "${opts.profile}". Valid: minimal, standard, full`);
        process.exit(2);
      }
      process.env.MILENS_PROFILE = opts.profile;
    }
    // Project-scoped .mcp.json always passes -p explicitly (highest priority, unchanged
    // behavior). Claude Code plugin-scoped MCP servers omit -p and rely on
    // CLAUDE_PROJECT_DIR, which Claude Code injects into the subprocess env — unlike
    // ${CLAUDE_PLUGIN_ROOT}, which resolves to the plugin's own install dir, not the
    // user's project (see adapters/claude-code/README notes).
    const repoPath = opts.path ?? process.env.CLAUDE_PROJECT_DIR ?? '.';
    if (opts.http) {
      const { startHttp } = await import('./server/mcp.js');
      await startHttp(parseInt(opts.port), resolve(repoPath));
    } else {
      const { startStdio } = await import('./server/mcp.js');
      await startStdio(resolve(repoPath));
    }
  });

program
  .command('status')
  .description('Show index status')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (opts) => {
    const { existsSync } = await import('node:fs');
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const reg = new RepoRegistry();
    const entry = reg.findByRoot(resolve(opts.path));
    if (!entry) { console.log('Not indexed.'); return; }
    if (!existsSync(entry.dbPath)) { console.log(`Not indexed. Run \`milens analyze\` first.\n(Registry entry stale — directory may have been deleted: ${entry.rootPath})`); return; }
    let db: InstanceType<typeof Database>;
    let stats: ReturnType<InstanceType<typeof Database>['getStats']>;
    try {
      db = new Database(entry.dbPath);
      stats = db.getStats();
    } catch (e: any) {
      if (e?.code === 'SQLITE_NOTADB' || String(e?.message || '').includes('not a database')) {
        console.error(`✗ Index database is corrupt: ${entry.dbPath}`);
        console.error('  → Run `milens clean` then `milens analyze -p . --force` to rebuild.');
      } else {
        console.error(`✗ Could not open index: ${e?.message || e}`);
        console.error('  → Try `milens analyze -p . --force` to rebuild.');
      }
      process.exit(1);
    }
    console.log(`Repository: ${entry.rootPath}`);
    console.log(`Database:   ${entry.dbPath}`);
    console.log(`Indexed:    ${entry.analyzedAt}`);
    console.log(`Symbols:    ${stats.symbols}`);
    console.log(`Links:      ${stats.links}`);
    console.log(`Files:      ${stats.files}`);
    const parseErrs = parseInt(db.getMeta('parse_error_files') ?? '0', 10);
    if (parseErrs > 0) {
      console.log(`Parse errors: ${parseErrs} file(s) had syntax errors — their symbols may be incomplete. Re-run \`milens analyze --force --verbose\` to see which.`);
    }
    db.close();
  });

program
  .command('list')
  .description('List all indexed repositories')
  .option('-p, --path <path>', 'Repository root path (filter by path prefix)')
  .action(async (opts) => {
    const { RepoRegistry } = await import('./store/registry.js');
    const entries = new RepoRegistry().listAll();
    const filtered = opts.path
      ? entries.filter((e: any) => e.rootPath.startsWith(resolve(opts.path)))
      : entries;
    if (filtered.length === 0) {
      console.log('No indexed repositories.');
      return;
    }
    console.log(`${filtered.length} indexed repositories:\n`);
    for (const entry of filtered) {
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

program
  .command('uninstall')
  .description('Remove all milens traces from a project: injected blocks, generated files, hooks, cron, database')
  .option('-p, --path <path>', 'Project root path', '.')
  .option('--dry-run', 'Only scan and report, do not remove anything', false)
  .option('--purge', 'Remove all ~/.milens/ global data', false)
  .option('-y, --yes', 'Auto-confirm all interactive prompts', false)
  .option('--keep-agents', 'Do not remove milens block from AGENTS.md')
  .option('--keep-configs', 'Skip MCP config cleanup prompts')
  .option('--scan-only', 'Only scan and report, no interactive mode')
  .action(async (opts) => {
    const rootPath = resolve(opts.path);
    const { uninstall, removeMcpEntry, removePackageDep, removeEnvVars, formatUninstallOutput } = await import('./uninstall.js');

    if (opts.dryRun || opts.scanOnly) {
      const result = uninstall({
        rootPath,
        dryRun: !!opts.dryRun,
        purge: !!opts.purge,
        skipConfirm: true,
        keepAgents: !!opts.keepAgents,
        keepConfigs: !!opts.keepConfigs,
        scanOnly: !!opts.scanOnly,
      });
      console.log(formatUninstallOutput(result, !!opts.dryRun, !!opts.scanOnly));
      return;
    }

    // ── Step 1: Scan ──
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Milens Uninstall                       ║');
    console.log('║  Step 1/4: Scanning project...          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log();

    const initialScan = uninstall({
      rootPath,
      dryRun: false,
      purge: !!opts.purge,
      skipConfirm: true,
      keepAgents: !!opts.keepAgents,
      keepConfigs: !!opts.keepConfigs,
      scanOnly: true,
    });

    const allScanned: string[] = [];
    for (const item of initialScan.autoRemoved) {
      allScanned.push(`${item.file} (${item.action})`);
    }
    for (const item of initialScan.interactiveItems) {
      allScanned.push(`${item.file} (${item.detail})`);
    }
    for (const item of initialScan.manualReview) {
      allScanned.push(`${item.file}:${item.line} (mentions milens)`);
    }

    if (allScanned.length === 0) {
      console.log('  No milens traces found. Nothing to uninstall.');
      return;
    }

    console.log(`  Found ${allScanned.length} milens traces in:`);
    for (const s of allScanned) {
      console.log(`    ${s}`);
    }
    console.log();

    // ── Step 2: Auto-remove ──
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Step 2/4: Auto-removing...             ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log();

    const autoResult = uninstall({
      rootPath,
      dryRun: false,
      purge: !!opts.purge,
      skipConfirm: true,
      keepAgents: !!opts.keepAgents,
      keepConfigs: !!opts.keepConfigs,
      scanOnly: false,
    });

    for (const item of autoResult.autoRemoved) {
      console.log(`  ✓ ${item.file} — ${item.action}`);
    }
    console.log();

    // ── Step 3: Interactive ──
    if (!opts.yes && !opts.scanOnly) {
      const interactiveItems = initialScan.interactiveItems;
      if (interactiveItems.length > 0) {
        console.log('╔══════════════════════════════════════════╗');
        console.log('║  Step 3/4: Interactive cleanup          ║');
        console.log('╚══════════════════════════════════════════╝');
        console.log();

        const { createInterface } = await import('node:readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));

        for (const item of interactiveItems) {
          switch (item.type) {
            case 'mcp-config': {
              if (opts.keepConfigs) {
                console.log(`  ⊝ ${item.file} — skipped (--keep-configs)`);
                break;
              }
              const editorInfo = item.editor ? ` (${item.editor})` : '';
              console.log(`  ⚠ ${item.file}${editorInfo} contains milens entry:`);
              console.log(`     ${item.detail}`);
              const answer = await ask('     Remove this entry? [Y/n]: ');
              if (answer.trim().toLowerCase() !== 'n') {
                const removed = removeMcpEntry(rootPath, item.file);
                console.log(`  ✓ ${item.file} — ${removed ? 'entry removed' : 'could not remove'}`);
              } else {
                console.log(`  ⊝ ${item.file} — kept`);
              }
              break;
            }
            case 'dependency': {
              console.log(`  ⚠ ${item.file} — ${item.detail}`);
              const answer = await ask('     Run `npm uninstall milens`? [Y/n]: ');
              if (answer.trim().toLowerCase() !== 'n') {
                const result = removePackageDep(rootPath);
                console.log(`  ✓ ${result || 'done'}`);
              } else {
                console.log(`  ⊝ ${item.file} — kept dependency`);
              }
              break;
            }
            case 'env-var': {
              const envFile = item.file;
              console.log(`  ⚠ ${envFile} — ${item.detail}`);
              const answer = await ask('     Remove these env vars? [Y/n]: ');
              if (answer.trim().toLowerCase() !== 'n') {
                const result = removeEnvVars(rootPath, envFile);
                console.log(`  ✓ ${result || 'done'}`);
              } else {
                console.log(`  ⊝ ${envFile} — kept`);
              }
              break;
            }
          }
          console.log();
        }

        rl.close();
      }
    }

    // ── Step 4: Report ──
    const finalScan = uninstall({
      rootPath,
      dryRun: true,
      purge: false,
      skipConfirm: true,
      keepAgents: !!opts.keepAgents,
      keepConfigs: false,
      scanOnly: true,
    });

    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Step 4/4: Manual review report         ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log();

    if (finalScan.manualReview.length > 0) {
      console.log('  These files mention "milens" — please review manually:');
      console.log();
      for (const ref of finalScan.manualReview.slice(0, 20)) {
        console.log(`  ${ref.file}:${ref.line}`);
        console.log(`    | ${ref.match}`);
        console.log(`    |`);
      }
      if (finalScan.manualReview.length > 20) {
        console.log(`  ... and ${finalScan.manualReview.length - 20} more references`);
      }
    } else {
      console.log('  No manual references remaining.');
    }

    console.log();
    console.log(`  Tip: Run \`grep -rn "milens" . --exclude-dir={node_modules,.git,dist}\``);
    console.log(`       to find any remaining traces.`);
    console.log();

    // ── Summary ──
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                  Uninstall Complete                     ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Auto-removed:  ${String(autoResult.autoRemoved.length).padEnd(3)} items${' '.repeat(33)}║`);
    console.log(`║  Manual review: ${String(finalScan.manualReview.length).padEnd(3)} files remaining${' '.repeat(26)}║`);
    console.log('║                                                         ║');
    console.log(`║  💡 npm uninstall -g milens     ← remove global install ║`);
    console.log(`║  💡 milens uninstall --purge    ← purge ~/.milens/ data ║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
  });

program
  .command('upgrade')
  .description('Upgrade milens: clear npx cache, rebuild index while keeping annotations/sessions/evolution data')
  .option('-p, --path <path>', 'Repository root path (default: current directory)', '.')
  .option('--all', 'Upgrade all indexed repositories')
  .option('--no-clear-cache', 'Skip npx cache clearing')
  .action(async (opts) => {
    const { homedir: getHomedir } = await import('node:os');
    const { existsSync: fsExists, rmSync } = await import('node:fs');
    const { join: joinPath } = await import('node:path');

    // 1. Clear npx cache
    if (opts.clearCache !== false) {
      const npxCache = joinPath(getHomedir(), '.npm', '_npx');
      if (fsExists(npxCache)) {
        try {
          rmSync(npxCache, { recursive: true, force: true });
          console.log('✓ Cleared npx cache');
        } catch {
          console.log('⚠ Could not clear npx cache (may be in use)');
        }
      }
    }

    // 2. Get repos to upgrade
    const { RepoRegistry } = await import('./store/registry.js');
    const reg = new RepoRegistry();

    let entries: Array<{ rootPath: string; dbPath: string; analyzedAt?: string }> = [];
    if (opts.all) {
      entries = reg.listAll();
    } else {
      const entry = reg.findByRoot(resolve(opts.path));
      if (entry) entries = [entry];
    }

    if (entries.length === 0) {
      console.log('No indexed repositories found. Run `milens analyze` first.');
      return;
    }

    // 3. For each repo, clear index tables (keep learning tables)
    for (const entry of entries) {
      const dbPath = entry.dbPath;
      if (!fsExists(dbPath)) {
        console.log(`⚠ No database at ${dbPath}, skipping ${entry.rootPath}`);
        continue;
      }

      const { Database } = await import('./store/db.js');
      const db = new Database(dbPath);

      console.log(`\nUpgrading ${entry.rootPath}...`);

      // Clear INDEX tables (rebuild fresh)
      const indexTables = ['symbols', 'links', 'file_hashes', 'symbol_fts', 'symbol_embeddings', 'repo_meta'];
      for (const table of indexTables) {
        try {
          db.connection.exec(`DELETE FROM ${table}`);
        } catch {
          // Table may not exist yet (e.g. symbol_embeddings)
        }
      }
      console.log('  ✓ Cleared index tables');

      // LEARNING tables preserved: annotations, sessions, evolution_log, tool_usage, metric_history
      const keepTables = ['annotations', 'sessions', 'evolution_log', 'tool_usage', 'metric_history'];
      for (const table of keepTables) {
        try {
          const row = db.connection.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as any;
          if (row && row.cnt > 0) {
            console.log(`  ✓ Kept ${table}: ${row.cnt} row(s)`);
          }
        } catch {
          // Table may not exist
        }
      }

      db.close();

      // 4. Re-analyze
      console.log('  Re-analyzing...');
      const { analyze } = await import('./analyzer/engine.js');
      await analyze({
        rootPath: entry.rootPath,
        dbPath: entry.dbPath,
        force: true,
        verbose: false,
      });
      console.log(`  ✓ Re-indexed ${entry.rootPath}`);
    }

    console.log('\n✓ Upgrade complete! Reload MCP server in VS Code: Cmd+Shift+P → MCP: Restart All Servers');
  });

program
  .command('dashboard')
  .description('Open usage analytics dashboard in your browser')
  .option('--port <port>', 'Port for the dashboard server', '3200')
  .option('-p, --path <path>', 'Repository root path for annotation data')
  .action(async (opts) => {
    const { join: joinPath } = await import('node:path');
    const { homedir: getHomedir } = await import('node:os');
    const { existsSync } = await import('node:fs');
    const { createServer: createHttpServer } = await import('node:http');

    const trackDbPath = joinPath(getHomedir(), '.milens', 'tracking.db');
    if (!existsSync(trackDbPath)) {
      console.log('No usage data yet. Use milens MCP tools first, then check back.');
      return;
    }

    const { Database } = await import('./store/db.js');
    const db = new Database(trackDbPath);
    
    let repoFilter: string | undefined;
    if (opts.path) {
      repoFilter = resolve(opts.path);
    }
    
    const stats = db.getToolUsageStats(repoFilter);
    db.close();

    if (stats.totalCalls === 0) {
      if (repoFilter) {
        console.log(`No usage data for ${repoFilter}. Use milens MCP tools with this repo first.`);
        console.log(`Tip: run 'milens dashboard' without --path to see all repos.`);
      } else {
        console.log('No usage data yet. Use milens MCP tools first, then check back.');
      }
      return;
    }

    let annotationStats: { total: number; confidenceBands: number[]; recent: { symbol: string; key: string; confidence: number; createdAt: string }[] } | undefined;
    if (opts.path) {
      try {
        const { RepoRegistry } = await import('./store/registry.js');
        const projDbPath = new RepoRegistry().findDbPath(resolve(opts.path));
        if (projDbPath) {
          const projDb = new Database(projDbPath);
          const { AnnotationStore } = await import('./store/annotations.js');
          const aStore = new AnnotationStore(projDb.connection);
          const allAnn = aStore.recall({ limit: 10000 });
          const bands = [0, 0, 0, 0];
          for (const a of allAnn) {
            if (a.confidence < 0.4) bands[0]++;
            else if (a.confidence < 0.7) bands[1]++;
            else if (a.confidence < 0.9) bands[2]++;
            else bands[3]++;
          }
          annotationStats = {
            total: allAnn.length,
            confidenceBands: bands,
            recent: allAnn.slice(-10).reverse().map(a => ({ symbol: a.symbol, key: a.key, confidence: a.confidence, createdAt: a.createdAt })),
          };
          projDb.close();
        }
      } catch { /* annotation data is optional */ }
    }

    const html = generateDashboardHtml(stats, annotationStats, repoFilter);
    const port = parseInt(opts.port);

    const server = createHttpServer((req, res) => {
      if (req.url === '/' || req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else if (req.url === '/api/stats') {
        // Live refresh endpoint — re-read DB with repo filter
        try {
          const liveDb = new Database(trackDbPath);
          const liveStats = liveDb.getToolUsageStats(repoFilter);
          liveDb.close();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(liveStats));
        } catch {
          res.writeHead(500);
          res.end('Error reading stats');
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`\n📊 milens Dashboard → ${url}\n`);
      console.log(`  Total tool calls:    ${stats.totalCalls}`);
      console.log(`  Tokens returned:     ${stats.totalTokensOut.toLocaleString()}`);
      console.log(`  Tokens saved:        ${stats.totalTokensSaved.toLocaleString()}`);
      console.log(`  Response time (avg): ${stats.totalCalls > 0 ? Math.round(stats.totalDurationMs / stats.totalCalls) : 0}ms`);
      console.log(`\nPress Ctrl+C to stop.\n`);

      // Try to open browser (use execFileSync to avoid shell injection)
      try {
        const { execFileSync: execFile } = require('node:child_process');
        if (process.platform === 'win32') execFile('cmd', ['/c', 'start', url], { stdio: 'ignore' });
        else if (process.platform === 'darwin') execFile('open', [url], { stdio: 'ignore' });
        else execFile('xdg-open', [url], { stdio: 'ignore' });
      } catch { /* browser open is best-effort */ }
    });
  });

program
  .command('evolve')
  .description('Promote high-confidence annotations to rules/skills, flag stale patterns')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('-s, --schedule <action>', 'daily|weekly|install|uninstall|status')
  .action(async (opts) => {
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const { AnnotationStore } = await import('./store/annotations.js');
    const { runDecayPass } = await import('./store/confidence.js');
    const { join: pathJoin } = await import('node:path');
    const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');

    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const store = new AnnotationStore(db.connection);

    // Handle scheduled evolve
    if (opts.schedule) {
      const { execSync } = await import('node:child_process');
      const { homedir } = await import('node:os');
      const { join, dirname } = await import('node:path');
      const milensBin = process.argv[1] || 'milens';

      switch (opts.schedule) {
        case 'install': {
          const scheduleType = opts.scheduleType || 'weekly';
          const cmd = `node ${process.argv[1]} evolve -p "${resolve(opts.path)}"`;

          if (process.platform === 'win32') {
            // Windows Scheduled Task
            const taskName = 'MilensEvolve';
            const scriptPath = join(homedir(), '.milens', 'evolve.bat');
            try {
              mkdirSync(dirname(scriptPath), { recursive: true });
              writeFileSync(scriptPath, `@echo off\ncd /d "${resolve(opts.path)}"\n${cmd}\n`);
              const interval = scheduleType === 'daily' ? 'DAILY' : 'WEEKLY';
              execSync(`schtasks /Create /SC ${interval} /TN "${taskName}" /TR "${scriptPath}" /F`, { stdio: 'pipe' });
              console.log(`✓ Scheduled task "${taskName}" created (${scheduleType})`);
            } catch (e: any) {
              console.error(`✗ Failed to create scheduled task: ${e.message}`);
              console.log('  You can manually run: milens evolve');
            }
          } else {
            // Linux/macOS cron
            const cronSchedule = scheduleType === 'daily' ? '0 6 * * *' : '0 6 * * 1';
            const cronEntry = `${cronSchedule} cd "${resolve(opts.path)}" && ${cmd} >> ~/.milens/evolve.log 2>&1`;
            try {
              const current = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
              const newCron = current ? `${current}\n${cronEntry}` : cronEntry;
              const tmpFile = join(homedir(), '.milens', 'crontab.tmp');
              mkdirSync(dirname(tmpFile), { recursive: true });
              writeFileSync(tmpFile, newCron + '\n');
              execSync(`crontab "${tmpFile}"`, { stdio: 'pipe' });
              console.log(`✓ Cron job installed (${scheduleType})`);
            } catch (e: any) {
              console.error(`✗ Failed to install cron job: ${e.message}`);
              console.log('  Add this to your crontab:');
              console.log(`  ${cronEntry}`);
            }
          }
          break;
        }
        case 'uninstall': {
          if (process.platform === 'win32') {
            try {
              execSync('schtasks /Delete /TN "MilensEvolve" /F', { stdio: 'pipe' });
              console.log('✓ Scheduled task "MilensEvolve" removed');
            } catch {
              console.log('No scheduled task found.');
            }
          } else {
            try {
              const current = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
              const filtered = current.split('\n').filter(line => !line.includes('milens evolve')).join('\n');
              const tmpFile = join(homedir(), '.milens', 'crontab.tmp');
              writeFileSync(tmpFile, filtered);
              execSync(`crontab "${tmpFile}"`, { stdio: 'pipe' });
              console.log('✓ Milens cron job removed');
            } catch {
              console.log('No cron job found.');
            }
          }
          break;
        }
        case 'status': {
          if (process.platform === 'win32') {
            try {
              const result = execSync('schtasks /Query /TN "MilensEvolve"', { encoding: 'utf-8' });
              console.log('Scheduled task: ACTIVE');
              console.log(result.split('\n').slice(2).join('\n'));
            } catch {
              console.log('No scheduled task configured.');
              console.log('Run: milens evolve --schedule install');
            }
          } else {
            try {
              const cron = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
              const milensLines = cron.split('\n').filter(l => l.includes('milens evolve'));
              if (milensLines.length > 0) {
                console.log('Scheduled cron jobs:');
                milensLines.forEach(l => console.log(`  ${l}`));
              } else {
                console.log('No cron job configured.');
                console.log('Run: milens evolve --schedule install');
              }
            } catch {
              console.log('No cron job configured.');
            }
          }
          break;
        }
        default:
          console.log(`Unknown schedule action: ${opts.schedule}`);
          console.log('Use: install, uninstall, status');
      }

      // Don't run evolve after schedule management
      db.close();
      return;
    }

    // 1. Run decay pass
    const { decayed, archived } = runDecayPass(store);
    if (decayed > 0 || archived > 0) {
      console.log(`Decayed: ${decayed} | Archived: ${archived}`);
    }

    // 2. Find promotable annotations (confidence >= 0.8)
    const promotable = store.getPromotableAnnotations();
    if (promotable.length === 0) {
      console.log('No annotations ready for promotion.');
      db.close();
      return;
    }

    // 3. Group by key
    const groups = new Map<string, typeof promotable>();
    for (const ann of promotable) {
      const arr = groups.get(ann.key) ?? [];
      arr.push(ann);
      groups.set(ann.key, arr);
    }

    // 4. Generate rule/skill files
    let promoted = 0;
    for (const [key, anns] of groups) {
      const lines = [
        `# Milens Evolved ${key.toUpperCase()} Rules`,
        `# Auto-generated from ${anns.length} high-confidence annotations`,
        '',
        '## Discovered Knowledge',
        '',
      ];
      for (const a of anns) {
        lines.push(`- **\`${a.symbol}\`**: ${a.value}`);
      }
      lines.push('');
      lines.push('## Using This Knowledge');
      lines.push('Before editing any symbol mentioned above:');
      lines.push('1. `mcp_milens_impact({target: "<symbol>", repo: "<workspaceRoot>"})` — check blast radius');
      lines.push('2. `mcp_milens_context({name: "<symbol>", repo: "<workspaceRoot>"})` — see callers/callees');
      lines.push('3. If depth-1 dependents > 5 → **STOP and warn** before proceeding');
      lines.push('');
      lines.push('> See `milens/SKILL.md` for full mandatory workflows and tool reference.');

      // Write to .agents/skills/milens-evolved-{key}.md (avoid collision with domain skills)
      const skillDir = pathJoin(resolve(opts.path), '.agents', 'skills', `milens-evolved-${key}`);
      if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });
      writeFileSync(pathJoin(skillDir, 'SKILL.md'), lines.join('\n'));

      // Log promotion
      for (const a of anns) {
        store.logEvolutionEvent(a.id, 'promoted', '', skillDir);
      }
      promoted += anns.length;
    }

    // 5. Find stale annotations (old + low confidence)
    const stale = store.getStaleAnnotations(30, 0.5);
    if (stale.length > 0) {
      console.log(`Flagged stale: ${stale.length} annotations (30+ days, low confidence)`);
    }

    console.log(`\nMilens Evolution Report:`);
    console.log(`  Promoted to rules:  ${promoted} patterns (from ${groups.size} categories)`);
    console.log(`  Flagged stale:      ${stale.length} annotations`);
    console.log(`  Archived (decayed): ${archived} annotations`);

    db.close();
  });

program
  .command('metrics')
  .description('Compute code quality and efficiency metrics')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (opts) => {
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const { computeMetrics, formatMetricsReport } = await import('./metrics.js');

    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const metrics = computeMetrics(db);
    console.log(formatMetricsReport(metrics));
    db.close();
  });

program
  .command('workflow <name>')
  .description('Run a predefined milens workflow')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--format <format>', 'Output format: table|json|markdown', 'table')
  .action(async (name: string, opts) => {
    if (!['table', 'json', 'markdown'].includes(opts.format)) {
      console.error(`Invalid --format "${opts.format}". Valid: table, json, markdown`);
      process.exit(2);
    }
    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');
    const { AnnotationStore } = await import('./store/annotations.js');

    const dbPath = new RepoRegistry().findDbPath(resolve(opts.path));
    if (!dbPath) { console.error('Not indexed. Run `milens analyze` first.'); process.exit(1); }
    const db = new Database(dbPath);
    const root = resolve(opts.path);

    switch (name) {
      case 'tdd': {
        const coverage = db.getTestCoverage();
        const coveragePct = Math.round(coverage.testedSymbols / Math.max(1, coverage.exportedProductionSymbols) * 100);
        console.log('╔══════════════════════════════════╗');
        console.log('║     TDD Workflow — Coverage     ║');
        console.log('╠══════════════════════════════════╣');
        console.log(`║ Exported: ${String(coverage.exportedProductionSymbols).padEnd(5)} | Tested: ${String(coverage.testedSymbols).padEnd(5)}  ║`);
        console.log(`║ Coverage:  ${String(coveragePct).padStart(3)}%${''.padEnd(20)}║`);
        console.log('╚══════════════════════════════════╝');

        const gaps = db.getTestCoverageGaps(15);
        if (gaps.length > 0) {
          console.log(`\n🧪 Top ${gaps.length} Untested Symbols (by risk):`);
          for (let i = 0; i < gaps.length; i++) {
            const s = gaps[i];
            const incoming = db.getIncomingLinks(s.id).filter((l: any) => l.type !== 'contains');
            const risk = s.heat && s.heat > 80 ? '🔴 CRITICAL' : s.heat && s.heat > 50 ? '🟠 HIGH' : s.heat && s.heat > 30 ? '🟡 MEDIUM' : '🟢 LOW';
            console.log(`  ${i + 1}. ${s.name} [${s.kind}] ${s.filePath}:${s.startLine} — heat:${s.heat ?? 0}, deps:${incoming.length} → ${risk}`);
          }
        } else {
          console.log(`\n✅ All exported symbols have test coverage.`);
        }

        const testFiles = coverage.testFiles > 0
          ? `  Test files found: ${coverage.testFiles}`
          : `  ⚠ No test files detected in index.`;
        console.log(`\n${testFiles}`);
        console.log(`\n📋 Next steps:`);
        console.log(`  1. Run \`milens workflow tdd\` after each change to track gaps`);
        console.log(`  2. Use \`milens serve\` + MCP \`tests({mode: "plan", name: "symbol"})\` for per-symbol test strategy`);
        console.log(`  3. Use MCP \`tests({mode: "generate", symbol: "symbol"})\` to auto-generate test file`);
        break;
      }
      case 'review': {
        console.log('PR Review Report:');
        try {
          const { execSync } = await import('node:child_process');
          const diff = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf-8' }).trim();
          const changedFiles = diff ? diff.split('\n').filter(Boolean) : [];
          if (changedFiles.length === 0) {
            console.log('  No changed files detected.');
          } else {
            console.log(`  ${changedFiles.length} changed files`);
            for (const file of changedFiles.slice(0, 15)) {
              const syms = db.getSymbolsByFile(file);
              if (syms.length > 0) {
                for (const sym of syms.slice(0, 5)) {
                  const incoming = db.getIncomingLinks(sym.id).filter((l: any) => l.type !== 'contains');
                  const depsCount = incoming.length;
                  const heat = sym.heat ?? 0;
                  const hasTest = db.getSymbolTestCoverage(sym.id);
                  const score = Math.round((heat / 100) * 40 + Math.min(depsCount / 10, 1) * 35 + (hasTest ? 0 : 25));
                  let level = 'LOW';
                  if (score > 75) level = 'CRITICAL';
                  else if (score > 50) level = 'HIGH';
                  else if (score > 25) level = 'MEDIUM';
                  console.log(`    ${sym.name} [${sym.kind}] ${file} — heat:${heat} deps:${depsCount} → ${level}(${score})`);
                }
              }
            }
          }
        } catch {
          console.log('  review_pr requires MCP server. Use milens serve and call via MCP.');
        }
        break;
      }
      case 'plan': {
        const summary = db.getCodebaseSummary();
        console.log(`Codebase Summary: ${summary.symbols} symbols, ${summary.links} links, ${summary.files} files`);
        if (summary.domains.length > 0) {
          console.log(`Domains: ${summary.domains.map((d: any) => `${d.domain}(${d.symbols}s)`).join(', ')}`);
        }
        if (summary.topHubs.length > 0) {
          console.log(`Top hubs: ${summary.topHubs.map((h: any) => `${h.name}(${h.kind},heat:${h.heat})`).join(', ')}`);
        }
        break;
      }
      case 'onboard': {
        const summary = db.getCodebaseSummary();
        const coverage = db.getTestCoverage();
        console.log('╔══════════════════════════════════╗');
        console.log('║   Milens Onboarding Report      ║');
        console.log('╚══════════════════════════════════╝\n');

        console.log(`📊 Codebase: ${summary.symbols} symbols, ${summary.links} links, ${summary.files} files`);
        console.log(`🧪 Test coverage: ${summary.coveragePct}% (${summary.testedSymbols}/${summary.exportedSymbols} exported)\n`);

        if (summary.domains.length > 0) {
          console.log('🗂️  Domain clusters:');
          for (const d of summary.domains.slice(0, 8)) {
            const pct = summary.symbols > 0 ? Math.round(d.symbols / summary.symbols * 100) : 0;
            console.log(`  ${d.domain}: ${d.files}f, ${d.symbols}s (${pct}%)`);
          }
          console.log();
        }

        if (summary.topHubs.length > 0) {
          console.log('⭐ Key entry points:');
          for (const h of summary.topHubs.slice(0, 8)) {
            const incoming = db.getIncomingLinks(h.id).filter((l: any) => l.type !== 'contains');
            console.log(`  ${h.name} [${h.kind}] ${h.filePath}:${h.startLine} — heat:${h.heat ?? 0}, deps:${incoming.length}`);
          }
          console.log();
        }

        const deadCode = db.findDeadCode(undefined, 5);
        if (deadCode.length > 0) {
          console.log(`⚠ Dead code candidates: ${deadCode.length}`);
          for (const s of deadCode.slice(0, 3)) {
            console.log(`  ${s.name} [${s.kind}] ${s.filePath}:${s.startLine}`);
          }
          console.log();
        }

        console.log('📋 Getting started:');
        console.log('  1. Run `milens workflow tdd` to see coverage gaps');
        console.log('  2. Run `milens workflow review` before committing changes');
        console.log('  3. Run `milens serve` for MCP integration with your AI agent');
        break;
      }
      case 'security-scan': {
        console.log('╔══════════════════════════════════╗');
        console.log('║   Security Scan Workflow        ║');
        console.log('╚══════════════════════════════════╝\n');

        try {
          const { loadRules } = await import('./security/rules.js');
          const { readFileSync, readdirSync, statSync } = await import('node:fs');
          const { join: pathJoin, relative: pathRel } = await import('node:path');

          const rules = loadRules().filter(r => r.enabled);
          console.log(`Loaded ${rules.length} active security rules\n`);

          const findings: Array<{ severity: string; rule: string; file: string; line: number; match: string; category: string; fix?: string }> = [];
          const MAX_FILE_SIZE = 200 * 1024; // skip files >200KB to avoid regex timeout

          function scanDir(dir: string): void {
            try {
              for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const fullPath = pathJoin(dir, entry.name);
                if (entry.isDirectory()) {
                  if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'vendor', 'coverage'].includes(entry.name)) continue;
                  scanDir(fullPath);
                } else if (entry.isFile()) {
                  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
                  if (!['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'rb', 'php', 'sql', 'sh', 'yaml', 'yml', 'json', 'html', 'css', 'vue'].includes(ext)) continue;
                  try {
                    const stat = statSync(fullPath);
                    if (stat.size > MAX_FILE_SIZE) return;
                    const content = readFileSync(fullPath, 'utf-8');
                    for (const rule of rules) {
                      for (const pattern of rule.patterns) {
                        pattern.lastIndex = 0;
                        let match;
                        while ((match = pattern.exec(content)) !== null) {
                          const lineNum = content.substring(0, match.index).split('\n').length;
                          findings.push({
                            severity: rule.severity,
                            rule: rule.id,
                            file: pathRel(root, fullPath).replace(/\\/g, '/'),
                            line: lineNum,
                            match: match[0].length > 80 ? match[0].slice(0, 77) + '...' : match[0],
                            category: rule.category,
                            fix: rule.fix,
                          });
                        }
                      }
                    }
                  } catch { /* skip unreadable */ }
                }
              }
            } catch { /* skip unreadable dir */ }
          }

          scanDir(root);

          const bySeverity: Record<string, number> = {};
          const byCategory: Record<string, number> = {};
          for (const f of findings) {
            bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
            byCategory[f.category] = (byCategory[f.category] || 0) + 1;
          }

          console.log(`📊 Summary: ${findings.length} findings`);
          if (findings.length > 0) {
            for (const s of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
              if (bySeverity[s]) console.log(`  ${s}: ${bySeverity[s]}`);
            }
            console.log();
            const sorted = [...findings].sort((a, b) => {
              const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
              return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
            });
            for (const f of sorted.slice(0, 20)) {
              const sevIcon = f.severity === 'CRITICAL' ? '🔴' : f.severity === 'HIGH' ? '🟠' : f.severity === 'MEDIUM' ? '🟡' : '🟢';
              console.log(`${sevIcon} [${f.severity}] ${f.rule} — ${f.file}:${f.line}`);
              console.log(`   ${f.match.slice(0, 100)}`);
              if (f.fix) console.log(`   💡 Fix: ${f.fix}`);
            }
            if (findings.length > 20) {
              console.log(`\n... and ${findings.length - 20} more (limit to 20). Run \`milens security scan\` for full output.`);
            }
          } else {
            console.log('✅ No security issues found.');
          }
        } catch (e: any) {
          console.error(`Security scan failed: ${e.message || e}`);
        }
        break;
      }
      case 'refactor': {
        const deadCode = db.findDeadCode(undefined, 20);
        console.log('Refactor Workflow — Dead Code Candidates:');
        if (deadCode.length === 0) {
          console.log('  No dead code found.');
        } else {
          for (const s of deadCode) {
            console.log(`  ${s.name} [${s.kind}] ${s.filePath}:${s.startLine}`);
          }
        }
        console.log(`\nRun 'milens analyze --force' to refresh the index before refactoring.`);
        break;
      }
      case 'handoff': {
        const store = new AnnotationStore(db.connection);
        console.log('╔══════════════════════════════════╗');
        console.log('║    Handoff Workflow             ║');
        console.log('╚══════════════════════════════════╝\n');

        // Show recent sessions
        const recentAnns = store.recall({ limit: 30 });
        const sessions = new Set<string>();
        for (const a of recentAnns) { if (a.sessionId) sessions.add(a.sessionId); }

        console.log(`📋 Indexed annotations: ${store.getAnnotationCount()}`);
        console.log(`📂 Recent sessions: ${sessions.size}`);

        try {
          const allAnnotations = store.recall({ limit: 100 });
          // Group by key for summary
          const byKey = new Map<string, { count: number; symbols: string[]; topConfidence: number }>();
          for (const a of allAnnotations) {
            const group = byKey.get(a.key) || { count: 0, symbols: [], topConfidence: 0 };
            group.count++;
            if (group.symbols.length < 5) group.symbols.push(a.symbol);
            if (a.confidence > group.topConfidence) group.topConfidence = a.confidence;
            byKey.set(a.key, group);
          }

          if (byKey.size > 0) {
            console.log(`\n🗂️  Knowledge by category:`);
            for (const [key, group] of byKey) {
              const pct = Math.round(group.topConfidence * 100);
              const bar = '█'.repeat(Math.round(group.topConfidence * 10));
              console.log(`  [${key}] ${group.count} annotations, top confidence: ${bar} ${pct}%`);
              if (group.symbols.length > 0) {
                console.log(`    Symbols: ${group.symbols.join(', ')}`);
              }
            }
          }

          // Promotable annotations (high confidence)
          const promotable = allAnnotations.filter(a => a.confidence >= 0.8);
          if (promotable.length > 0) {
            console.log(`\n⭐ ${promotable.length} high-confidence annotations ready for promotion:`);
            for (const a of promotable.slice(0, 5)) {
              console.log(`  [${a.key}] ${a.symbol}: ${a.value.slice(0, 80)}`);
            }
            console.log(`\n  Run \`milens evolve -p "${root}"\` to promote these to rules/skills.`);
          }
        } catch { /* annotations may not be available */ }

        console.log(`\n📋 CLI handoff commands:`);
        console.log(`  1. milens workflow onboard --path <path>  → fresh agent onboarding`);
        console.log(`  2. milens workflow review --path <path>    → pre-handoff review`);
        console.log(`  3. milens evolve -p <path>                 → promote knowledge to rules`);
        console.log(`\n💡 Tip: Use \`milens serve\` + MCP for full session_start() → annotate() → handoff() flow.`);
        break;
      }
      default:
        console.error(`Unknown workflow: ${name}`);
        console.error(`Available: tdd, review, plan, onboard, security-scan, refactor, handoff`);
        db.close();
        process.exit(2);
    }
    db.close();
  });

program
  .command('init')
  .description('Bootstrap milens for a project: index + AGENTS.md + skills + hooks')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--profile <profile>', 'minimal|standard|full', 'standard')
  .option('--with <modules>', 'Comma-separated extra modules (security,ci,hooks)')
  .option('--target <harnesses>', `Comma-separated harnesses to install adapters for (${Object.keys(HARNESS_ADAPTER_FILES).join(',')},all)`)
  .option('--interactive', 'Interactive install mode')
  .action(async (opts) => {
    const root = resolve(opts.path);

    const VALID_PROFILES = ['minimal', 'standard', 'full'];
    if (!VALID_PROFILES.includes(opts.profile)) {
      console.error(`Invalid profile "${opts.profile}". Valid: ${VALID_PROFILES.join(', ')}`);
      process.exit(2);
    }

    // Interactive install mode
    if (opts.interactive) {
      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));

      console.log('\n╔══════════════════════════════════════╗');
      console.log('║   Milens Interactive Installer       ║');
      console.log('╚══════════════════════════════════════╝\n');

      // Profile selection
      console.log('Choose a profile:');
      console.log('  1. minimal  — Core tools only (10 tools, ~500 token overhead)');
      console.log('  2. standard — Full vibe coding toolkit (25 tools) [Recommended]');
      console.log('  3. full     — Everything including experimental features (43 tools)');
      const profileChoice = await ask('\nProfile [2]: ');
      const profileMap: Record<string, string> = { '1': 'minimal', '2': 'standard', '3': 'full', '': 'standard' };
      opts.profile = profileMap[profileChoice.trim()] || 'standard';

      // Security rules
      const securityChoice = await ask('Include security scanning rules? [Y/n]: ');
      opts.with = opts.with || '';
      if (securityChoice.trim().toLowerCase() !== 'n') {
        opts.with += (opts.with ? ',' : '') + 'security';
      }

      // CI/CD templates
      const ciChoice = await ask('Include CI/CD templates (GitHub Actions)? [Y/n]: ');
      if (ciChoice.trim().toLowerCase() !== 'n') {
        opts.with += (opts.with ? ',' : '') + 'ci';
      }

      // Git hooks
      const hooksChoice = await ask('Install pre-commit hooks? [Y/n]: ');
      if (hooksChoice.trim().toLowerCase() !== 'n') {
        opts.with += (opts.with ? ',' : '') + 'hooks';
      }

      // Harness adapters
      console.log('\nTarget harnesses (comma-separated):');
      console.log('  claude-code, opencode, codex, cursor, copilot, gemini, zed, all');
      const harnessChoice = await ask('Harnesses [all]: ');
      const harnesses = harnessChoice.trim() || 'all';

      opts.target = harnesses;

      // Generate command
      const withFlags = opts.with ? `--with ${opts.with}` : '';
      const harnessFlag = harnesses === 'all' ? '' : `--target ${harnesses}`;
      console.log(`\nGenerated install command:`);
      console.log(`  npx milens init --profile ${opts.profile} ${withFlags} ${harnessFlag}`.trim());

      const confirm = await ask('\nProceed with install? [Y/n]: ');
      if (confirm.trim().toLowerCase() === 'n') {
        console.log('Install cancelled. Run the command above when ready.');
        rl.close();
        process.exit(0);
      }

      rl.close();
      console.log();
      // Continue with normal init flow...
    }

    const { Database } = await import('./store/db.js');
    const { RepoRegistry } = await import('./store/registry.js');

    console.log(`Milens init — bootstrapping ${opts.profile} profile for ${root}`);

    const { execFileSync } = await import('node:child_process');
    console.log('Step 1/4: Analyzing codebase...');
    try {
      const analyzeArgs = ['analyze', '-p', root, '--force'];
      if (process.argv[0].includes('node') && process.argv[1]) {
        execFileSync(process.execPath, [process.argv[1], ...analyzeArgs], { stdio: 'pipe', cwd: root });
      } else {
        execFileSync('npx', ['milens', ...analyzeArgs], { stdio: 'pipe', cwd: root });
      }
    } catch (e: any) {
      console.error('✗ init failed — could not index the codebase.');
      console.error(`  ${e.message || e}`);
      console.error('  Fix the error above, then re-run `milens init` (or `milens analyze -p . --force` directly).');
      process.exit(1);
    }

    console.log('Step 2/4: Generating AGENTS.md...');
    let db: any = null;
    try {
      const dbPath = new RepoRegistry().findDbPath(root);
      if (dbPath) {
        db = new Database(dbPath);
        const { generateAgentsMd } = await import('./agents-md.js');
        const agentsMd = generateAgentsMd(db, root);
        const { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } = await import('node:fs');
        if (!existsSync(root)) mkdirSync(root, { recursive: true });
        const agentsPath = resolve(root, 'AGENTS.md');
        const BEGIN = '<!-- BEGIN MILENS -->';
        const END = '<!-- END MILENS -->';
        const block = `${BEGIN}\n${agentsMd}\n${END}`;
        if (existsSync(agentsPath)) {
          const existing = readFileSync(agentsPath, 'utf-8');
          if (existing.includes(BEGIN) && existing.includes(END)) {
            writeFileSync(agentsPath, existing.replace(new RegExp(`${BEGIN}[\\s\\S]*${END}`), block));
            console.log('  ✓ AGENTS.md updated (milens block)');
          } else {
            copyFileSync(agentsPath, agentsPath + '.bak');
            writeFileSync(agentsPath, `${existing.trimEnd()}\n\n${block}\n`);
            console.log('  ✓ AGENTS.md preserved (backup: AGENTS.md.bak; milens block appended)');
          }
        } else {
          writeFileSync(agentsPath, `${block}\n`);
          console.log('  ✓ AGENTS.md created');
        }
      }
    } catch (e: any) {
      console.log(`  ⚠ AGENTS.md generation skipped: ${e.message}`);
    }

    if (opts.profile !== 'minimal') {
      console.log('Step 3/4: Installing skill files...');
      try {
        if (db) {
          const { generateSkills } = await import('./skills.js');
          const result = generateSkills(db, root, ['agents']);
          console.log(`  ✓ Generated ${result.count} skill files`);
          for (const d of result.dirs) console.log(`    ${d}`);
        } else {
          console.log('  ⚠ Skills skipped: no database available (run analyze first)');
        }
      } catch (e: any) {
        console.log(`  ⚠ Skill install skipped: ${e.message}`);
      }
    }

    if (db) db.close();

    if (opts.profile === 'full' || (opts.with && opts.with.includes('hooks'))) {
      console.log('Step 4/4: Installing git hooks...');
      try {
        const { writeFileSync, existsSync, mkdirSync, chmodSync, readFileSync } = await import('node:fs');
        const hooksDir = resolve(root, '.git', 'hooks');
        if (!existsSync(hooksDir)) {
          mkdirSync(hooksDir, { recursive: true });
        }

        const hookPath = resolve(hooksDir, 'pre-commit');
        let installHook = true;
        if (existsSync(hookPath)) {
          const existing = readFileSync(hookPath, 'utf-8');
          if (!existing.includes('milens') && !existing.includes('Auto-installed by milens')) {
            const isHusky = existing.includes('husky') || existing.includes('.husky');
            console.log(isHusky
              ? '  ⚠ Skipped pre-commit hook — Husky hook already present (.husky/). Install manually with "milens hooks install".'
              : '  ⚠ Skipped pre-commit hook — existing hook found. Install manually with "milens hooks install".');
            installHook = false;
          }
        }

        if (installHook) {
        const preCommitContent = `#!/bin/bash
# Auto-installed by milens init
echo "Milens: Pre-commit check..."

OUTPUT=$(npx milens workflow review --path . 2>&1)
echo "$OUTPUT"

# Block commit if CRITICAL risk detected
if echo "$OUTPUT" | grep -q "CRITICAL"; then
  echo ""
  echo "❌ COMMIT BLOCKED: Critical risk detected."
  echo "   Run 'milens workflow review' to see details."
  echo "   To override: git commit --no-verify"
  exit 1
fi

# Warn if HIGH risk but don't block
if echo "$OUTPUT" | grep -q "HIGH"; then
  echo ""
  echo "⚠️  WARNING: High risk changes detected. Consider adding tests."
fi

echo "Milens: Done."
`;
        writeFileSync(resolve(hooksDir, 'pre-commit'), preCommitContent);
        try { chmodSync(resolve(hooksDir, 'pre-commit'), 0o755); } catch {}
        console.log('  ✓ Pre-commit hook installed');
        }
      } catch (e: any) {
        console.log(`  ⚠ Hook install skipped: ${e.message}`);
      }
    }

    if (opts.target) {
      console.log('Installing harness adapters...');
      const targetTokens: string[] = opts.target.split(',').map((h: string) => h.trim()).filter(Boolean);
      const requested: string[] = targetTokens.includes('all')
        ? Object.keys(HARNESS_ADAPTER_FILES)
        : targetTokens;

      const adaptersRoot = join(dirname(__filename), '..', 'adapters');
      for (const harness of requested) {
        const files = HARNESS_ADAPTER_FILES[harness];
        if (!files) {
          console.log(`  ⚠ Unknown harness "${harness}" — skipped. Valid: ${Object.keys(HARNESS_ADAPTER_FILES).join(', ')}, all`);
          continue;
        }
        for (const { src, dest } of files) {
          const srcPath = join(adaptersRoot, harness, src);
          const destPath = resolve(root, dest);
          if (!existsSync(srcPath)) {
            console.log(`  ⚠ ${harness}: template not found (${src}) — run from an npm install of milens`);
            continue;
          }
          if (existsSync(destPath)) {
            console.log(`  - ${dest} already exists — skipped (not overwritten)`);
            continue;
          }
          mkdirSync(dirname(destPath), { recursive: true });
          cpSync(srcPath, destPath);
          console.log(`  ✓ ${dest} (${harness})`);
        }
      }
    }

    // Ensure .milens/ is gitignored
    try {
      const { existsSync, readFileSync, appendFileSync, writeFileSync } = await import('node:fs');
      const gitignorePath = resolve(root, '.gitignore');
      const entry = '\n# milens code intelligence index (local, machine-specific)\n.milens/\n';
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, 'utf-8');
        if (!content.includes('.milens')) {
          appendFileSync(gitignorePath, entry);
        }
      } else {
        writeFileSync(gitignorePath, entry.trimStart());
      }
    } catch { /* best-effort */ }

    console.log(`\n✓ Milens ${opts.profile} profile bootstrapped for ${root}`);
    console.log('Next steps:');
    console.log('  1. Open project in your AI coding agent (Claude Code, OpenCode, etc.)');
    console.log('  2. AGENTS.md auto-loads with codebase context');
    console.log('  3. Start a session: session_start({agent: "your-agent-name"})');
  });

program
  .command('hooks <action>')
  .description('Manage milens hook system')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--repo <path>', 'Repository root path (alias for --path)')
  .option('--agent <name>', 'Agent name (for session-start/session-end)')
  .option('--hook <hook>', 'Hook name (sessionStart, sessionEnd, preCommit, fileChange, preCompact, postCompact)')
  .option('--mode <mode>', 'Enforcement mode (warn | strict) for guard-set-mode')
  .action(async (action: string, opts) => {
    const { HookManager, defaultOnSessionStart, defaultOnSessionEnd, defaultOnPreCompact, defaultOnPostCompact } = await import('./server/hooks.js');
    const manager = new HookManager();
    const projectPath = resolve(opts.repo || opts.path);

    switch (action) {
      case 'session-start': {
        const agent = opts.agent || 'cli';
        const rootPath = projectPath;
        const dbPath = join(rootPath, '.milens', 'milens.db');
        const sessionId = randomUUID();
        const ctx = { agent, sessionId, rootPath };
        try {
          const output = await defaultOnSessionStart(ctx, dbPath);
          console.log(output);
        } catch (e: any) {
          console.error(`Session start hook failed: ${e.message || e}`);
          process.exit(1);
        }
        break;
      }
      case 'session-end': {
        const agent = opts.agent || 'cli';
        const rootPath = projectPath;
        const dbPath = join(rootPath, '.milens', 'milens.db');
        const sessionId = randomUUID();
        const ctx = { agent, sessionId, rootPath };
        try {
          const output = await defaultOnSessionEnd(ctx, dbPath);
          console.log(output);
        } catch (e: any) {
          console.error(`Session end hook failed: ${e.message || e}`);
          process.exit(1);
        }
        break;
      }
      case 'pre-compact': {
        const rootPath = projectPath;
        const dbPath = join(rootPath, '.milens', 'milens.db');
        try {
          const output = await defaultOnPreCompact(rootPath, dbPath);
          console.log(output);
        } catch (e: any) {
          console.error(`Pre-compact hook failed: ${e.message || e}`);
          process.exit(1);
        }
        break;
      }
      case 'post-compact': {
        const rootPath = projectPath;
        try {
          const output = await defaultOnPostCompact(rootPath);
          console.log(output);
        } catch (e: any) {
          console.error(`Post-compact hook failed: ${e.message || e}`);
          process.exit(1);
        }
        break;
      }
      case 'enable': {
        if (opts.hook) {
          manager.enableHook(opts.hook, projectPath);
          console.log(`Hook "${opts.hook}" enabled for ${projectPath}`);
        } else {
          const cfg = manager.loadConfig(projectPath);
          cfg.enabled = true;
          manager.saveConfig(cfg, projectPath);
          console.log(`All hooks enabled for ${projectPath}`);
        }
        break;
      }
      case 'disable': {
        if (opts.hook) {
          manager.disableHook(opts.hook, projectPath);
          console.log(`Hook "${opts.hook}" disabled for ${projectPath}`);
        } else {
          const cfg = manager.loadConfig(projectPath);
          cfg.enabled = false;
          manager.saveConfig(cfg, projectPath);
          console.log(`All hooks disabled for ${projectPath}`);
        }
        break;
      }
      case 'list': {
        const cfg = manager.loadConfig(projectPath);
        console.log(`Hook configuration for ${projectPath}:`);
        console.log(`  enabled: ${cfg.enabled}`);
        console.log(`  onSessionStart: ${cfg.onSessionStart}`);
        console.log(`  onSessionEnd: ${cfg.onSessionEnd}`);
        console.log(`  onFileChange: ${cfg.onFileChange}`);
        console.log(`  onPreCommit: ${cfg.onPreCommit}`);
        console.log(`  onPreCompact: ${cfg.onPreCompact}`);
        console.log(`  onPostCompact: ${cfg.onPostCompact}`);
        break;
      }
      case 'profile': {
        const profileName = opts.hook || 'standard';
        const cfg = manager.loadConfig(projectPath);
        cfg.enabled = true;
        if (profileName === 'minimal') {
          cfg.onSessionStart = false; cfg.onSessionEnd = false;
          cfg.onFileChange = false; cfg.onPreCommit = true;
          cfg.onPreCompact = false; cfg.onPostCompact = false;
        } else if (profileName === 'strict') {
          cfg.onSessionStart = true; cfg.onSessionEnd = true;
          cfg.onFileChange = true; cfg.onPreCommit = true;
          cfg.onPreCompact = true; cfg.onPostCompact = true;
        } else {
          cfg.onSessionStart = true; cfg.onSessionEnd = true;
          cfg.onFileChange = false; cfg.onPreCommit = true;
          cfg.onPreCompact = false; cfg.onPostCompact = false;
        }
        manager.saveConfig(cfg, projectPath);
        console.log(`Hook profile set to "${profileName}" for ${projectPath}`);
        break;
      }
      case 'guard-mark-checked': {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawStdin = Buffer.concat(chunks).toString();
        const { handleMarkChecked } = await import('./server/guard-hook.js');
        handleMarkChecked(rawStdin, projectPath);
        break;
      }
      case 'guard-check-edit': {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawStdin = Buffer.concat(chunks).toString();
        const { handleCheckEdit } = await import('./server/guard-hook.js');
        const result = handleCheckEdit(rawStdin, projectPath);
        process.stdout.write(result.stdout + '\n');
        if (result.exitCode !== 0) process.exit(result.exitCode);
        break;
      }
      case 'guard-set-mode': {
        const mode = opts.mode;
        if (mode !== 'warn' && mode !== 'strict') {
          console.error(`Invalid mode "${mode}". Use "warn" or "strict".`);
          process.exit(1);
        }
        const { writeMode } = await import('./server/guard-hook.js');
        writeMode(projectPath, mode as 'warn' | 'strict');
        console.log(`Guard enforcement mode set to "${mode}" for ${projectPath}`);
        break;
      }
      default:
        console.log(`Unknown action: ${action}. Use: enable, disable, list, profile, session-start, session-end, pre-compact, post-compact, guard-mark-checked, guard-check-edit, guard-set-mode`);
    }
  });

const securityCmd = program
  .command('security')
  .description('Security scanning and dependency audit');

securityCmd
  .command('scan')
  .description('Scan project for security vulnerabilities')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--scope <scope>', 'all|secrets|injection|unicode|dangerous|config|data-leak|crypto|auth|file-access', 'all')
  .option('--severity <severity>', 'CRITICAL|HIGH|MEDIUM|LOW')
  .option('--limit <limit>', 'Max findings to report', '30')
  .option('--format <format>', 'table|json|markdown', 'table')
  .action(async (opts) => {
    const root = resolve(opts.path);
    const maxFindings = parseInt(opts.limit) || 30;
    const MAX_FILE_SIZE = 200 * 1024; // skip files >200KB to avoid regex timeout
    const { loadRules } = await import('./security/rules.js');
    const { readFileSync, existsSync, readdirSync, statSync } = await import('node:fs');
    const { join: pathJoin, relative: pathRelative } = await import('node:path');

    const rules = loadRules();
    const filtered = rules.filter(r => {
      if (opts.scope !== 'all' && r.category !== opts.scope) return false;
      if (opts.severity) {
        const sevOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        if ((sevOrder[r.severity] || 0) < (sevOrder[opts.severity] || 0)) return false;
      }
      return r.enabled;
    });

    console.log(`Security Scan — ${filtered.length} active rules, scope: ${opts.scope}\n`);

    const findings: any[] = [];
    const walkDir = (dir: string) => {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = pathJoin(dir, entry.name);
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) continue;
            walkDir(fullPath);
          } else if (entry.isFile()) {
            const ext = entry.name.split('.').pop() || '';
            if (!['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'rb', 'php', 'sql', 'sh', 'yaml', 'yml', 'json', 'html', 'css'].includes(ext)) continue;
            try {
              const stat = statSync(fullPath);
              if (stat.size > MAX_FILE_SIZE) {
                if (opts.format === 'table') console.log(`  Skipping large file: ${pathRelative(root, fullPath)} (${(stat.size / 1024).toFixed(0)}KB)`);
                return;
              }
              const content = readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              for (const rule of filtered) {
                for (const pattern of rule.patterns) {
                  pattern.lastIndex = 0;
                  let match;
                  while ((match = pattern.exec(content)) !== null) {
                    const lineNum = content.substring(0, match.index).split('\n').length;
                    findings.push({
                      rule: rule.id,
                      severity: rule.severity,
                      category: rule.category,
                      owasp: rule.owasp,
                      file: pathRelative(root, fullPath),
                      line: lineNum,
                      match: match[0].length > 80 ? match[0].slice(0, 77) + '...' : match[0],
                      fix: rule.fix,
                    });
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    };
    walkDir(root);

    const bySev: Record<string, number> = {};
    for (const f of findings) { bySev[f.severity] = (bySev[f.severity] || 0) + 1; }

    console.log(`Total findings: ${findings.length}`);
    for (const [s, c] of Object.entries(bySev)) {
      console.log(`  ${s}: ${c}`);
    }
    console.log();

    for (const f of findings.slice(0, maxFindings)) {
      console.log(`[${f.severity}] ${f.rule} ${f.file}:${f.line} — ${f.match}`);
    }
  });

securityCmd
  .command('deps')
  .description('Audit dependencies for known vulnerabilities')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (opts) => {
    const root = resolve(opts.path);
    const { auditDependencies } = await import('./security/deps.js');
    const result = auditDependencies(root);

    console.log(`Dependency Audit — ${result.ecosystem}`);
    console.log(`  Total: ${result.totalDependencies} | Vulnerable: ${result.vulnerableDependencies}\n`);

    for (const v of result.findings.slice(0, 20)) {
      console.log(`[${v.severity}] ${v.package} — ${v.id}${v.cve ? ` (${v.cve})` : ''}`);
      console.log(`  Affected: ${v.affectedVersions} | Fixed: ${v.fixedVersion || 'N/A'}`);
      console.log(`  ${v.description}`);
      console.log();
    }
  });

program
  .command('watch')
  .description('Watch files for changes and auto re-index')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--debounce <ms>', 'Debounce time in ms', '1000')
  .option('--ignore <glob>', 'Files to ignore (comma-separated)')
  .action(async (opts) => {
    const root = resolve(opts.path);
    const { watch, existsSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');

    console.log(`Watching ${root} for changes... (Ctrl+C to stop)`);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const changedFiles = new Set<string>();
    const debounceMs = parseInt(opts.debounce) || 1000;
    const ignoreList = opts.ignore ? opts.ignore.split(',') : ['node_modules', '.git', 'dist'];

    const triggerRebuild = async () => {
      if (changedFiles.size === 0) return;
      const files = [...changedFiles];
      changedFiles.clear();
      console.log(`\nRe-indexing ${files.length} changed file(s)...`);
      const { execFileSync } = await import('node:child_process');
      try {
        const analyzeArgs = ['analyze', '-p', root];
        if (process.argv[1]) {
          execFileSync(process.execPath, [process.argv[1], ...analyzeArgs], { stdio: 'inherit', cwd: root });
        } else {
          execFileSync('npx', ['milens', ...analyzeArgs], { stdio: 'inherit', cwd: root });
        }
        console.log(`✓ Index updated`);
      } catch {
        console.log(`⚠ Re-index failed — run manually: milens analyze -p . --force`);
      }
    };

    try {
      const watcher = watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (ignoreList.some((i: string) => filename!.includes(i))) return;
        changedFiles.add(filename);
        if (timer) clearTimeout(timer);
        timer = setTimeout(triggerRebuild, debounceMs);
      });

      process.on('SIGINT', () => {
        console.log('\nWatch stopped.');
        watcher.close();
        process.exit(0);
      });
    } catch {
      console.error('File watching failed. Use `milens analyze -p . --force` to manually re-index.');
    }
  });

program
  .command('orchestrate')
  .description('Run full review cycle: detect changes → risk → coverage gaps → dead code')
  .option('-p, --path <path>', 'Repository root path', '.')
  .option('--emoji', 'Use emoji in output')
  .action(async (opts) => {
    const root = resolve(opts.path);
    const dbPath = join(root, '.milens', 'milens.db');

    if (!existsSync(dbPath)) {
      console.error(`No milens database found. Run \`milens analyze\` first.`);
      process.exit(1);
    }

    const { Orchestrator } = await import('./orchestrator/orchestrator.js');
    const orchestrator = new Orchestrator({ rootPath: root, dbPath, useEmoji: opts.emoji });

    // Mark changed files from git diff
    try {
      const { execFileSync } = await import('node:child_process');
      const diffOut = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf-8' });
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf-8' });
      const changed = [...new Set([...diffOut.trim().split('\n'), ...staged.trim().split('\n')])].filter(Boolean);
      for (const f of changed) orchestrator.subscribe(f);
    } catch {
      console.error('Not a git repository or git not available.');
      process.exit(1);
    }

    const report = await orchestrator.runAndFormat();
    console.log(report);
  });

if (process.argv.slice(2).length === 0 && process.stdout.isTTY) {
  await showRootSummary();
} else {
  program.parse();
}

async function showRootSummary(): Promise<void> {
  try {
    const { RepoRegistry } = await import('./store/registry.js');
    const { Database } = await import('./store/db.js');
    const { existsSync } = await import('node:fs');
    const reg = new RepoRegistry();
    const entry = reg.findByRoot(resolve('.'));
    if (!entry || !existsSync(entry.dbPath)) {
      console.log('milens — no index for this directory yet.');
      console.log('Next: run `milens analyze -p . --force` to index, or `milens init` to set up an agent.');
      return;
    }
    const db = new Database(entry.dbPath);
    const stats = db.getStats();
    db.close();
    console.log(`milens — ${stats.symbols} symbols · ${stats.links} links · ${stats.files} files (indexed ${entry.analyzedAt})`);
    console.log('Try:');
    console.log('  milens status              — index health');
    console.log('  milens search <name>       — find a symbol');
    console.log('  milens impact <symbol>     — blast radius before editing');
    console.log('  milens --help              — all commands');
  } catch {
    program.parse();
  }
}

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
