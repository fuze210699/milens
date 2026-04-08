import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface RepoEntry {
  rootPath: string;
  dbPath: string;
  indexedAt: string;
  fileCount: number;
  nodeCount: number;
}

const MILENS_HOME = join(homedir(), '.milens');
const REGISTRY_PATH = join(MILENS_HOME, 'registry.json');

export class RepoManager {
  private registry: Record<string, RepoEntry> = {};

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const data = readFileSync(REGISTRY_PATH, 'utf-8');
      this.registry = JSON.parse(data);
    } catch {
      this.registry = {};
    }
  }

  private save(): void {
    mkdirSync(MILENS_HOME, { recursive: true });
    writeFileSync(REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  register(entry: RepoEntry): void {
    this.registry[entry.rootPath] = entry;
    this.save();
  }

  get(rootPath: string): RepoEntry | undefined {
    return this.registry[rootPath];
  }

  list(): RepoEntry[] {
    return Object.values(this.registry);
  }

  remove(rootPath: string): void {
    delete this.registry[rootPath];
    this.save();
  }

  findDbPath(rootPath: string): string | undefined {
    // Check local .milens/db.sqlite first
    const localDb = join(rootPath, '.milens', 'db.sqlite');
    if (existsSync(localDb)) return localDb;

    // Check registry
    const entry = this.registry[rootPath];
    return entry?.dbPath;
  }
}
