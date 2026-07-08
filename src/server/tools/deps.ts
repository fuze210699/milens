import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from '../../store/db.js';

export interface Deps {
  getDb: (repoPath?: string) => { db: Database; root: string; dbPath: string; lazy: any };
  fmtSymbol: (s: any, detail?: 'L0' | 'L1' | 'L2') => string;
  fmtImpact: (items: Array<{ symbol: any; depth: number; via: string }>, detail?: 'L0' | 'L1' | 'L2') => string;
  rootPath?: string;
  toolCallCounts: Map<string, number>;
  resolveRoot: (repoPath?: string) => string;
  guard: { getAudit: (sessionId: string) => { checked: string[]; editOps: number }; clear: (sessionId: string) => void };
  getToolCallCount: (root: string) => number;
}

export type RegisterTools = (server: McpServer, deps: Deps) => void;
