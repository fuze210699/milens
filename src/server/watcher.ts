import { watch, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import type { FSWatcher } from 'node:fs';

interface WatcherOptions {
  /** Repository root path to watch */
  rootPath: string;
  /** Path to the milens database */
  dbPath: string;
  /** Debounce time in ms before triggering re-index (default: 2000) */
  debounceMs?: number;
  /** Additional glob patterns to ignore */
  extraIgnores?: string[];
  /** 
   * Custom logger for MCP transport. When provided, watcher messages are
   * sent through this callback instead of console.error (stderr).
   * For MCP stdio transport, use server.sendLoggingMessage to send
   * proper JSON-RPC notifications instead of raw stderr text.
   */
  logger?: (level: 'info' | 'warning' | 'error', message: string) => void;
}

const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  '.milens',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'coverage',
  '.cache',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.vue', '.html', '.css', '.md', '.mdx',
  '.yaml', '.yml', '.json', '.sql', '.sh',
]);

/**
 * FileWatcher — watches the repo root for file changes
 * and auto-triggers incremental re-index when source files change.
 *
 * Respects hook config: if onFileChange is disabled in hooks.json,
 * the watcher will stop itself.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private changedFiles = new Set<string>();
  private debounceMs: number;
  private rootPath: string;
  private dbPath: string;
  private ignores: string[];
  private running = false;
  private reindexing = false;
  private log: (level: 'info' | 'warning' | 'error', message: string) => void;

  constructor(opts: WatcherOptions) {
    this.rootPath = resolve(opts.rootPath);
    this.dbPath = opts.dbPath;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.ignores = [...DEFAULT_IGNORES, ...(opts.extraIgnores ?? [])];
    this.log = opts.logger ?? ((_level, msg) => process.stderr.write(msg + '\n'));
  }

  /** Start watching the repo root */
  start(): void {
    if (this.running) return;

    if (!existsSync(this.dbPath)) {
      this.log('error', '[milens:watcher] No index found. Run `milens analyze` first.');
      return;
    }

    try {
      this.watcher = watch(
        this.rootPath,
        { recursive: true },
        (_eventType: string, filename: string | null) => {
          if (!filename) return;
          this.onFileChanged(filename);
        },
      );

      this.watcher.on('error', (err: Error) => {
        this.log('error', `[milens:watcher] Error: ${err.message}`);
      });

      this.running = true;
      this.log('info', `[milens:watcher] Watching ${this.rootPath} for changes (debounce: ${this.debounceMs}ms)`);
    } catch {
      this.log('error', '[milens:watcher] File watching not available on this platform. Use `milens analyze --force` manually.');
    }
  }

  /** Stop watching and clean up */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.running = false;
    this.changedFiles.clear();
    this.log('info', '[milens:watcher] Stopped.');
  }

  /** Check if watcher is currently running */
  isRunning(): boolean {
    return this.running;
  }

  private onFileChanged(filename: string): void {
    // Check if file should be ignored
    const normalized = filename.replace(/\\/g, '/');
    if (this.ignores.some(i => normalized.startsWith(i) || normalized.includes(`/${i}/`))) {
      return;
    }

    // Only watch source files
    const ext = normalized.split('.').pop();
    if (!ext || !SOURCE_EXTENSIONS.has(`.${ext}`)) {
      return;
    }

    this.changedFiles.add(filename);

    // Debounce: reset timer on each change
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.triggerReindex(), this.debounceMs);
  }

  private async triggerReindex(): Promise<void> {
    if (this.changedFiles.size === 0 || this.reindexing) return;

    const files = [...this.changedFiles];
    this.changedFiles.clear();
    this.reindexing = true;

    const displayFiles = files.length <= 5
      ? files.map(f => relative(this.rootPath, join(this.rootPath, f))).join(', ')
      : `${files.length} files`;

    this.log('info', `[milens:watcher] Re-indexing ${displayFiles}...`);

    try {
      const { analyze } = await import('../analyzer/engine.js');
      const { RepoRegistry } = await import('../store/registry.js');
      const config = new RepoRegistry().findByRoot(this.rootPath);

      await analyze({
        rootPath: this.rootPath,
        dbPath: config?.dbPath ?? this.dbPath,
        force: true,
        files,
        verbose: false,
      });

      this.log('info', `[milens:watcher] Index updated (${files.length} file(s))`);
    } catch (err: any) {
      this.log('error', `[milens:watcher] Re-index failed: ${err.message}`);
    } finally {
      this.reindexing = false;
    }
  }
}
