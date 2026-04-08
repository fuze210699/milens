import { execSync } from 'node:child_process';
import { SqliteAdapter } from '../../storage/sqlite-adapter.js';
import type { GraphNode, ChangedSymbol, DetectChangesResult } from '../../types/graph.js';

/**
 * Parse git diff output to get changed files and their line ranges.
 */
function getChangedFiles(
  rootPath: string,
  scope: 'staged' | 'unstaged' | 'all',
): Array<{ path: string; status: string; lines?: number[] }> {
  const results: Array<{ path: string; status: string; lines?: number[] }> = [];

  try {
    let diffCmd: string;
    switch (scope) {
      case 'staged':
        diffCmd = 'git diff --cached --name-status';
        break;
      case 'unstaged':
        diffCmd = 'git diff --name-status';
        break;
      case 'all':
      default:
        diffCmd = 'git diff HEAD --name-status';
        break;
    }

    const output = execSync(diffCmd, { cwd: rootPath, encoding: 'utf-8' }).trim();
    if (!output) return results;

    for (const line of output.split('\n')) {
      const match = line.match(/^([AMDRC])\t(.+)$/);
      if (match) {
        const [, status, path] = match;
        results.push({ path, status: status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'modified' });
      }
    }

    // Get changed line numbers for modified files
    for (const entry of results) {
      if (entry.status !== 'modified') continue;
      try {
        let lineCmd: string;
        switch (scope) {
          case 'staged':
            lineCmd = `git diff --cached -U0 -- "${entry.path}"`;
            break;
          case 'unstaged':
            lineCmd = `git diff -U0 -- "${entry.path}"`;
            break;
          default:
            lineCmd = `git diff HEAD -U0 -- "${entry.path}"`;
            break;
        }
        const diffOutput = execSync(lineCmd, { cwd: rootPath, encoding: 'utf-8' });
        const changedLines: number[] = [];
        // Parse @@ -a,b +c,d @@ to get changed line numbers
        for (const hunk of diffOutput.matchAll(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g)) {
          const start = parseInt(hunk[1], 10);
          const count = parseInt(hunk[2] ?? '1', 10);
          for (let i = start; i < start + count; i++) {
            changedLines.push(i);
          }
        }
        entry.lines = changedLines;
      } catch { /* ignore */ }
    }
  } catch {
    // Not a git repo or git not available
  }

  return results;
}

/**
 * Detect which symbols are affected by uncommitted changes.
 */
export function detectChanges(
  rootPath: string,
  db: SqliteAdapter,
  scope: 'staged' | 'unstaged' | 'all' = 'all',
): DetectChangesResult {
  const changedFiles = getChangedFiles(rootPath, scope);
  const changedPaths = changedFiles.map(f => f.path);
  const changedSymbols: ChangedSymbol[] = [];
  const affectedNodeIds = new Set<string>();

  for (const file of changedFiles) {
    const fileNodes = db.getNodesByFile(file.path);

    if (file.status === 'added') {
      // All symbols in this file are new
      for (const node of fileNodes) {
        changedSymbols.push({
          node,
          changeType: 'added',
          filePath: file.path,
        });
      }
      continue;
    }

    if (file.status === 'deleted') {
      for (const node of fileNodes) {
        changedSymbols.push({
          node,
          changeType: 'deleted',
          filePath: file.path,
        });
        // Everything that depends on these symbols is affected
        const incoming = db.getIncoming(node.id);
        for (const rel of incoming) {
          affectedNodeIds.add(rel.sourceId);
        }
      }
      continue;
    }

    // Modified: check which symbols overlap with changed lines
    if (file.lines && file.lines.length > 0) {
      const lineSet = new Set(file.lines);
      for (const node of fileNodes) {
        if (node.label === 'File' || node.label === 'Folder') continue;
        const start = node.startLine ?? 0;
        const end = node.endLine ?? start;
        let overlaps = false;
        for (let l = start; l <= end; l++) {
          if (lineSet.has(l)) { overlaps = true; break; }
        }
        if (overlaps) {
          changedSymbols.push({
            node,
            changeType: 'modified',
            filePath: file.path,
          });
          // Everything that depends on this symbol is affected
          const incoming = db.getIncoming(node.id);
          for (const rel of incoming) {
            affectedNodeIds.add(rel.sourceId);
          }
        }
      }
    } else {
      // Could not get line info — mark all symbols in file as modified
      for (const node of fileNodes) {
        if (node.label === 'File' || node.label === 'Folder') continue;
        changedSymbols.push({
          node,
          changeType: 'modified',
          filePath: file.path,
        });
      }
    }
  }

  // Get the actual affected nodes (excluding the changed ones themselves)
  const changedNodeIds = new Set(changedSymbols.map(s => s.node.id));
  const affectedSymbols: GraphNode[] = [];
  for (const nodeId of affectedNodeIds) {
    if (changedNodeIds.has(nodeId)) continue;
    const node = db.getNode(nodeId);
    if (node) affectedSymbols.push(node);
  }

  return {
    changedFiles: changedPaths,
    changedSymbols,
    affectedSymbols,
  };
}
