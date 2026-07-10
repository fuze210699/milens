import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AnnotationStore } from '../../store/annotations.js';
import {
  HookManager,
  defaultOnSessionStart,
  defaultOnSessionEnd,
  defaultOnPreCommit,
  defaultOnFileChange,
  defaultOnPreCompact,
  defaultOnPostCompact,
} from '../hooks.js';
import type { Deps } from './deps.js';
import { BUILD_SHA, BUILT_AT } from '../../build-info.js';

export function registerSessionTools(server: McpServer, deps: Deps): void {
  const { getDb, guard, getToolCallCount } = deps;

  server.tool(
    'annotate',
    'Record a note about a symbol for future sessions. Use after discovering bugs, patterns, or important caveats.',
    {
      symbol: z.string(),
      key: z.enum(['note', 'bug', 'security', 'architecture', 'workflow', 'test', 'dependency', 'refactor']),
      value: z.string(),
      agent: z.string().optional(),
      session_id: z.string().optional(),
      confidence: z.number().optional().default(0.5),
    },
    async ({ symbol, key, value, agent, session_id, confidence }) => {
      const { db } = getDb();
      const store = new AnnotationStore(db.connection);
      const symbolHash = store.getCurrentSymbolHash(symbol) ?? undefined;
      const ann = store.annotate(symbol, key as any, value, { agent, sessionId: session_id, confidence, symbolHash });
      return { content: [{ type: 'text' as const, text: `Annotation saved: ${ann.id}\n  symbol: ${ann.symbol}\n  key: ${ann.key}\n  confidence: ${ann.confidence}` }] };
    },
  );

  server.tool(
    'recall',
    'Retrieve annotations saved in previous sessions. Filter by symbol, key, or agent. Set history=true to include evolution log entries (previous values before overwrites).',
    {
      symbol: z.string().optional(), key: z.enum(['note', 'bug', 'security', 'architecture', 'workflow', 'test', 'dependency', 'refactor']).optional(),
      agent: z.string().optional(), limit: z.number().optional().default(50),
      history: z.boolean().optional().default(false).describe('Include evolution log entries showing previous values before overwrites'),
    },
    async ({ symbol, key, agent, limit, history }) => {
      const { db } = getDb();
      const store = new AnnotationStore(db.connection);
      const results = store.recall({ symbol, key, agent, limit });
      if (results.length === 0) return { content: [{ type: 'text' as const, text: 'No annotations found.' }] };
      const lines = [`${results.length} annotation(s):\n`];
      for (const a of results) {
        lines.push(`[${a.key}] ${a.symbol} — ${a.value.slice(0, 120)}`);
        lines.push(`  confidence: ${a.confidence.toFixed(1)} | agent: ${a.agent ?? '?'} | ${a.updatedAt}`);
        if (history) {
          const events = store.getHistory(a.id);
          if (events.length > 0) {
            lines.push(`  evolution history (${events.length} event(s)):`);
            for (const e of events) {
              const oldVal = e.oldValue ? `"${e.oldValue.slice(0, 80)}"` : '(none)';
              const newVal = e.newValue ? `"${e.newValue.slice(0, 80)}"` : '(none)';
              lines.push(`    ${e.createdAt} | ${e.event}: ${oldVal} → ${newVal}`);
            }
          }
        }
        lines.push('');
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'session_start',
    'Start a new session. Returns a session ID to use with annotate, session_end, and handoff.',
    { agent: z.string().describe('Agent name (e.g. vibe-coder, reviewer)') },
    async ({ agent }) => {
      const { db, root, dbPath } = getDb();
      const store = new AnnotationStore(db.connection);
      const sessionId = store.sessionStart(agent);

      let hookOutput = '';
      try {
        const manager = new HookManager();
        const config = manager.loadConfig(root);
        if (config.enabled && config.onSessionStart) {
          hookOutput = await defaultOnSessionStart({ agent, sessionId, rootPath: root }, dbPath);
        }
      } catch { /* hooks are best-effort */ }

      const text = `Session started: ${sessionId}\nAgent: ${agent}\nBuild: ${BUILD_SHA} (${BUILT_AT})\nUse this ID with annotate() and session_end().`;
      return { content: [{ type: 'text' as const, text: hookOutput ? `${hookOutput}\n\n${text}` : text }] };
    },
  );

  server.tool(
    'session_context',
    'Get metadata about a session: annotations, tool calls, duration.',
    { session_id: z.string() },
    async ({ session_id }) => {
      const { db, root } = getDb();
      const store = new AnnotationStore(db.connection);
      const ctx = store.sessionContext(session_id);
      if (!ctx.session) return { content: [{ type: 'text' as const, text: `Session "${session_id}" not found.` }] };
      const s = ctx.session;
      const liveCalls = getToolCallCount(root);
      const displayCalls = s.toolCallsCount > 0 ? s.toolCallsCount : liveCalls;
      const lines = [
        `Session: ${s.id}`,
        `Agent: ${s.agent} | Status: ${s.status}`,
        `Started: ${s.startedAt} | Ended: ${s.endedAt ?? 'in progress'}`,
        `Tool calls: ${displayCalls}${s.toolCallsCount === 0 ? ' (live count, resets on restart)' : ''} | Annotations: ${ctx.annotations.length}`,
      ];
      if (s.context) lines.push(`Context: ${s.context}`);
      if (ctx.annotations.length > 0) {
        lines.push(`\nAnnotations (${ctx.annotations.length}):`);
        for (const a of ctx.annotations) {
          lines.push(`  [${a.key}] ${a.symbol}: ${a.value.slice(0, 80)}`);
        }
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'session_end',
    'End a session and record its stats. Shows audit trail: which symbols were safety-checked vs total edit operations. Use at the end of every session.',
    { session_id: z.string(), status: z.enum(['completed', 'failed']).optional().default('completed') },
    async ({ session_id, status }) => {
      const { db, root, dbPath } = getDb();
      const store = new AnnotationStore(db.connection);
      const summary = store.sessionEnd(session_id, status);

      // Audit trail from SessionGuard
      const audit = guard.getAudit(session_id);
      guard.clear(session_id);

      let hookOutput = '';
      try {
        const ctx = store.sessionContext(session_id);
        const manager = new HookManager();
        const config = manager.loadConfig(root);
        if (config.enabled && config.onSessionEnd) {
          hookOutput = await defaultOnSessionEnd({ agent: ctx.session.agent, sessionId: session_id, rootPath: root }, dbPath);
        }
      } catch { /* hooks are best-effort */ }

      const lines = [
        `Session ended: ${session_id}`,
        `Status: ${status}`,
        `Annotations: ${summary.annotationCount}`,
        `───`,
        `Audit Trail:`,
        `  safety checks performed: ${audit.checked.length}`,
        audit.checked.length > 0 ? `  symbols checked: ${audit.checked.join(', ')}` : '  ⚠ no symbols were checked via guard_edit_check',
        audit.editOps > 0 ? `  edit operations reported: ${audit.editOps}` : null,
      ].filter(Boolean);
      const text = lines.join('\n');
      return { content: [{ type: 'text' as const, text: hookOutput ? `${text}\n\n${hookOutput}` : text }] };
    },
  );

  server.tool(
    'handoff',
    'Transfer context from one agent session to another. Ends the source session and creates a new one for the target agent.',
    {
      from_session: z.string(), to_agent: z.string(),
      context: z.string().describe('Summary of what was done, key decisions, and caveats for the next agent'),
    },
    async ({ from_session, to_agent, context }) => {
      const { db } = getDb();
      const store = new AnnotationStore(db.connection);
      const result = store.handoff(from_session, to_agent, context);
      return { content: [{ type: 'text' as const, text: `Handoff complete.\nNew session: ${result.newSessionId}\nAgent: ${to_agent}\nAnnotations recorded in prior session: ${result.annotationsCopied} (retrievable via recall())` }] };
    },
  );

  server.tool(
    'pre_commit_check',
    'Run pre-commit risk analysis: detect_changes + review_pr + dead code + coverage gaps. Use before committing.',
    { repo: z.string().optional().describe('Repository root path') },
    async ({ repo }) => {
      const { root } = getDb(repo);
      const report = await defaultOnPreCommit(root);
      return { content: [{ type: 'text' as const, text: report }] };
    },
  );

  server.tool(
    'hook_onFileChange',
    'Trigger the onFileChange hook. Call this when files are modified to get impact summary.',
    {
      files: z.array(z.string()).describe('List of changed file paths'),
      repo: z.string().optional(),
    },
    async ({ files, repo }) => {
      const { root } = getDb(repo);
      const report = await defaultOnFileChange(files, root);
      return { content: [{ type: 'text' as const, text: report }] };
    },
  );

  server.tool(
    'hook_preCompact',
    'Trigger pre-compaction hook. Saves a metrics snapshot before context window compaction.',
    { repo: z.string().optional() },
    async ({ repo }) => {
      const { root, dbPath } = getDb(repo);
      const report = await defaultOnPreCompact(root, dbPath);
      return { content: [{ type: 'text' as const, text: report }] };
    },
  );

  server.tool(
    'hook_postCompact',
    'Trigger post-compaction hook. Recalls annotations to restore context after compaction.',
    { repo: z.string().optional() },
    async ({ repo }) => {
      const { root } = getDb(repo);
      const report = await defaultOnPostCompact(root);
      return { content: [{ type: 'text' as const, text: report }] };
    },
  );
}
