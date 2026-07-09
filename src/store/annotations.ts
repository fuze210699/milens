import BetterSqlite3 from 'better-sqlite3';
import type { Annotation, AnnotationKey, Session, EvolutionEvent } from '../types.js';
import { randomUUID } from 'node:crypto';

const VALID_KEYS: readonly AnnotationKey[] = [
  'note', 'bug', 'security', 'architecture',
  'workflow', 'test', 'dependency', 'refactor',
] as const;

export class AnnotationStore {
  private db: BetterSqlite3.Database;
  private stmts: ReturnType<AnnotationStore['prepareStatements']>;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insertAnnotation: this.db.prepare(
        `INSERT OR REPLACE INTO annotations (id, symbol, key, value, agent, session_id, confidence, symbol_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      findBySymbolKey: this.db.prepare(
        'SELECT * FROM annotations WHERE symbol = ? AND key = ?'
      ),
      updateAnnotation: this.db.prepare(
        'UPDATE annotations SET value = ?, confidence = ?, agent = ?, session_id = ?, symbol_hash = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ),
      queryBySymbol: this.db.prepare(
        'SELECT * FROM annotations WHERE symbol = ? ORDER BY confidence DESC, updated_at DESC LIMIT ?'
      ),
      queryByKey: this.db.prepare(
        'SELECT * FROM annotations WHERE key = ? ORDER BY confidence DESC LIMIT ?'
      ),
      queryByAgent: this.db.prepare(
        'SELECT * FROM annotations WHERE agent = ? ORDER BY updated_at DESC LIMIT ?'
      ),
      queryAll: this.db.prepare(
        'SELECT * FROM annotations ORDER BY confidence DESC, updated_at DESC LIMIT ?'
      ),
      queryBySession: this.db.prepare(
        'SELECT * FROM annotations WHERE session_id = ? ORDER BY updated_at DESC'
      ),
      insertSession: this.db.prepare(
        'INSERT INTO sessions (id, agent, status, started_at) VALUES (?, ?, ?, datetime(\'now\'))'
      ),
      endSession: this.db.prepare(
        'UPDATE sessions SET ended_at = datetime(\'now\'), status = ?, tool_calls_count = ?, annotations_count = ? WHERE id = ?'
      ),
      getSession: this.db.prepare('SELECT * FROM sessions WHERE id = ?'),
      countSessionAnns: this.db.prepare('SELECT COUNT(*) as c FROM annotations WHERE session_id = ?'),
      countAll: this.db.prepare('SELECT COUNT(*) as c FROM annotations'),
      insertEvent: this.db.prepare(
        'INSERT INTO evolution_log (annotation_id, event, old_value, new_value) VALUES (?, ?, ?, ?)'
      ),
      getPromotable: this.db.prepare(
        "SELECT * FROM annotations WHERE confidence >= 0.8 ORDER BY confidence DESC"
      ),
      getStale: this.db.prepare(
        "SELECT * FROM annotations WHERE updated_at < datetime('now', ?) AND confidence < ? ORDER BY confidence ASC"
      ),
      archiveAnnotation: this.db.prepare(
        "UPDATE annotations SET confidence = 0, updated_at = datetime('now') WHERE id = ?"
      ),
      deleteAnnotation: this.db.prepare('DELETE FROM annotations WHERE id = ?'),
      setConfidence: this.db.prepare(
        "UPDATE annotations SET confidence = ?, updated_at = datetime('now') WHERE id = ?"
      ),

      boostRecallConfidence: this.db.prepare(
        "UPDATE annotations SET confidence = MIN(confidence + 0.05, 0.95), updated_at = datetime('now') WHERE id = ? AND confidence < 0.9"
      ),

      getEvolutionEvents: this.db.prepare(
        'SELECT * FROM evolution_log WHERE annotation_id = ? ORDER BY created_at ASC'
      ),
    };
  }

  // ── Annotation CRUD ──

  annotate(symbol: string, key: string, value: string, options?: { agent?: string; sessionId?: string; confidence?: number; symbolHash?: string }): Annotation {
    if (!VALID_KEYS.includes(key as AnnotationKey)) {
      throw new Error(`Invalid annotation key: "${key}". Valid: ${VALID_KEYS.join(', ')}`);
    }
    const annotationKey = key as AnnotationKey;

    const initialConfidence = options?.confidence !== undefined
      ? Math.max(0, Math.min(1, options.confidence))
      : 0.5;

    const existing = this.stmts.findBySymbolKey.get(symbol, annotationKey) as any;

    if (existing) {
      const updatedAgent = options?.agent ?? existing.agent;
      const updatedSessionId = options?.sessionId ?? existing.session_id;
      if (existing.value === value) {
        const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
        this.stmts.updateAnnotation.run(value, newConfidence, updatedAgent, updatedSessionId, options?.symbolHash ?? existing.symbol_hash, existing.id);
        const eventType = newConfidence >= 0.8 && existing.confidence < 0.8 ? 'promoted' : 'confidence_up';
        this.logEvolutionEvent(existing.id, eventType, existing.value, value);
        return rowToAnnotation({
          ...existing,
          agent: updatedAgent,
          session_id: updatedSessionId,
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
        });
      }

      this.stmts.updateAnnotation.run(value, initialConfidence, updatedAgent, updatedSessionId, options?.symbolHash ?? existing.symbol_hash, existing.id);
      this.logEvolutionEvent(existing.id, 'created', existing.value, value);
      return rowToAnnotation({
        ...existing,
        value,
        agent: updatedAgent,
        session_id: updatedSessionId,
        confidence: initialConfidence,
        updated_at: new Date().toISOString(),
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    this.stmts.insertAnnotation.run(
      id, symbol, annotationKey, value,
      options?.agent ?? null,
      options?.sessionId ?? null,
      initialConfidence, options?.symbolHash ?? null, now, now,
    );
    this.logEvolutionEvent(id, 'created', undefined, value);
    return {
      id, symbol, key: annotationKey, value,
      agent: options?.agent,
      sessionId: options?.sessionId,
      confidence: initialConfidence,
      symbolHash: options?.symbolHash,
      createdAt: now,
      updatedAt: now,
    };
  }

  recall(filters?: { symbol?: string; key?: AnnotationKey; agent?: string; sessionId?: string; limit?: number }): Annotation[] {
    const limit = filters?.limit ?? 50;
    let rows: any[];

    if (filters?.symbol && filters?.key) {
      rows = this.stmts.findBySymbolKey.all(filters.symbol, filters.key) as any[];
    } else if (filters?.symbol) {
      rows = this.stmts.queryBySymbol.all(filters.symbol, limit) as any[];
    } else if (filters?.key) {
      rows = this.stmts.queryByKey.all(filters.key, limit) as any[];
    } else if (filters?.agent) {
      rows = this.stmts.queryByAgent.all(filters.agent, limit) as any[];
    } else if (filters?.sessionId) {
      rows = this.stmts.queryBySession.all(filters.sessionId) as any[];
    } else {
      rows = this.stmts.queryAll.all(limit) as any[];
    }

    // Boost confidence on recall (real-time learning)
    for (const row of rows) {
      this.stmts.boostRecallConfidence.run(row.id);
    }

    return rows.map(row => {
      const ann = rowToAnnotation(row);
      if (this.isAnnotationStale(ann)) {
        ann.value = `⚠ STALE (code changed since annotation) ${ann.value}`;
      }
      return ann;
    });
  }

  // ── Session management ──

  sessionStart(agent: string): string {
    const id = randomUUID();
    this.stmts.insertSession.run(id, agent, 'active');
    return id;
  }

  sessionEnd(sessionId: string, status?: string): { sessionId: string; status: string; annotationCount: number } {
    const session = this.stmts.getSession.get(sessionId) as any;
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const annCount = (this.stmts.countSessionAnns.get(sessionId) as any).c as number;
    const finalStatus = status ?? 'completed';
    this.stmts.endSession.run(finalStatus, session.tool_calls_count ?? 0, annCount, sessionId);

    return { sessionId, status: finalStatus, annotationCount: annCount };
  }

  sessionContext(sessionId: string): { session: Session; annotations: Annotation[]; annotationCount: number; toolCallsCount: number } {
    const sessionRow = this.stmts.getSession.get(sessionId) as any;
    if (!sessionRow) throw new Error(`Session not found: ${sessionId}`);

    const annotations = this.recall({ sessionId });
    const annCount = (this.stmts.countSessionAnns.get(sessionId) as any).c as number;

    return {
      session: rowToSession(sessionRow),
      annotations,
      annotationCount: annCount,
      toolCallsCount: sessionRow.tool_calls_count ?? 0,
    };
  }

  handoff(fromSessionId: string, toAgent: string, context: string): { newSessionId: string; annotationsCopied: number } {
    const fromSession = this.stmts.getSession.get(fromSessionId) as any;
    if (!fromSession) throw new Error(`Session not found: ${fromSessionId}`);

    const fromAnnCount = (this.stmts.countSessionAnns.get(fromSessionId) as any).c as number;
    this.stmts.endSession.run('completed', fromSession.tool_calls_count ?? 0, fromAnnCount, fromSessionId);

    const newId = randomUUID();
    this.db.prepare(
      'INSERT INTO sessions (id, agent, status, started_at, context) VALUES (?, ?, ?, datetime(\'now\'), ?)'
    ).run(newId, toAgent, 'active', context);

    return { newSessionId: newId, annotationsCopied: fromAnnCount };
  }

  // ── Confidence ──

  setConfidence(id: string, confidence: number): void {
    this.stmts.setConfidence.run(confidence, id);
  }

  // ── Maintenance ──

  getPromotableAnnotations(): Annotation[] {
    const rows = this.stmts.getPromotable.all() as any[];
    return rows.map(rowToAnnotation);
  }

  getStaleAnnotations(daysOld: number, confidenceThreshold: number): Annotation[] {
    const modifier = `-${daysOld} days`;
    const rows = this.stmts.getStale.all(modifier, confidenceThreshold) as any[];
    return rows.map(rowToAnnotation);
  }

  archiveAnnotation(id: string): void {
    const row = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as any;
    if (!row) throw new Error(`Annotation not found: ${id}`);
    this.stmts.archiveAnnotation.run(id);
    this.logEvolutionEvent(id, 'archived', row.value, undefined);
  }

  // ── Evolution log ──

  logEvolutionEvent(annotationId: string, event: EvolutionEvent['event'], oldValue?: string, newValue?: string): void {
    this.stmts.insertEvent.run(annotationId, event, oldValue ?? null, newValue ?? null);
  }

  getHistory(annotationId: string): EvolutionEvent[] {
    const rows = this.stmts.getEvolutionEvents.all(annotationId) as any[];
    return rows.map(rowToEvolutionEvent);
  }

  getCurrentSymbolHash(symbolName: string): string | null {
    const row = this.db.prepare(
      'SELECT fh.hash FROM symbols s JOIN file_hashes fh ON s.file_path = fh.path WHERE s.name = ? LIMIT 1'
    ).get(symbolName) as any;
    return row?.hash ?? null;
  }

  isAnnotationStale(annotation: Annotation): boolean {
    if (!annotation.symbolHash) return false;
    const current = this.getCurrentSymbolHash(annotation.symbol);
    return current !== null && current !== annotation.symbolHash;
  }

  // ── Stats ──

  getAnnotationCount(): number {
    return (this.stmts.countAll.get() as any).c as number;
  }
}

// ── Row mappers ──

function rowToAnnotation(row: any): Annotation {
  return {
    id: row.id,
    symbol: row.symbol,
    key: row.key as AnnotationKey,
    value: row.value,
    agent: row.agent ?? undefined,
    sessionId: row.session_id ?? undefined,
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    symbolHash: row.symbol_hash ?? undefined,
  };
}

function rowToEvolutionEvent(row: any): EvolutionEvent {
  return {
    id: row.id,
    annotationId: String(row.annotation_id),
    event: row.event as EvolutionEvent['event'],
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToSession(row: any): Session {
  return {
    id: row.id,
    agent: row.agent,
    status: row.status as Session['status'],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    toolCallsCount: row.tool_calls_count ?? 0,
    annotationsCount: row.annotations_count ?? 0,
    context: row.context ?? undefined,
  };
}
