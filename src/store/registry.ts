import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type { RepoEntry } from '../types.js';

/** Resolved lazily (not at module load) so MILENS_HOME can be overridden — e.g. by tests wanting an isolated registry instead of the real user's ~/.milens. */
function getMilensHome(): string {
  return process.env.MILENS_HOME || join(homedir(), '.milens');
}

function getRegistryFile(): string {
  return join(getMilensHome(), 'registry.json');
}

/** Normalize path: resolve to absolute + uppercase drive letter on Windows. */
function normalizePath(p: string): string {
  const abs = resolve(p);
  if (process.platform === 'win32') {
    return abs.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ':');
  }
  return abs;
}

export class RepoRegistry {
  private entries: RepoEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const registryFile = getRegistryFile();
      if (existsSync(registryFile)) {
        const data = JSON.parse(readFileSync(registryFile, 'utf-8'));
        this.entries = Array.isArray(data) ? data : [];
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    mkdirSync(getMilensHome(), { recursive: true });
    writeFileSync(getRegistryFile(), JSON.stringify(this.entries, null, 2));
  }

  register(rootPath: string, dbPath: string, hash: string): void {
    const absolute = normalizePath(rootPath);
    const idx = this.entries.findIndex(e => e.rootPath === absolute);
    const entry: RepoEntry = {
      rootPath: absolute,
      dbPath: normalizePath(dbPath),
      analyzedAt: new Date().toISOString(),
      hash,
    };
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
    this.save();
  }

  private reloadIfStale(): void {
    this.load();
  }

  findByRoot(rootPath: string): RepoEntry | undefined {
    this.reloadIfStale();
    const absolute = normalizePath(rootPath);
    return this.entries.find(e => e.rootPath === absolute);
  }

  findDbPath(rootPath: string): string | null {
    const entry = this.findByRoot(rootPath);
    if (!entry) return null;
    if (!existsSync(entry.dbPath)) return null;
    return entry.dbPath;
  }

  listAll(): RepoEntry[] {
    this.reloadIfStale();
    return [...this.entries];
  }

  remove(rootPath: string): boolean {
    const absolute = normalizePath(rootPath);
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.rootPath !== absolute);
    if (this.entries.length < before) {
      this.save();
      return true;
    }
    return false;
  }
}
