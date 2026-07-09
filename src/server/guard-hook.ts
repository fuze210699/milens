import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SAFETY_TOOLS = ['impact', 'context', 'overview', 'guard_edit_check', 'edit_check', 'smart_context'];

interface Marker {
  lastCheckedAt: string;
  lastCheckedTool: string;
}

interface ModeConfig {
  mode: 'warn' | 'strict';
}

export interface HookDecision {
  stdout: string;
  exitCode: number;
}

function hookStateDir(projectPath: string): string {
  return join(projectPath, '.milens', 'hook-state');
}

function configPath(projectPath: string): string {
  return join(hookStateDir(projectPath), 'config.json');
}

function markerPath(projectPath: string, sessionId: string): string {
  return join(hookStateDir(projectPath), `${sessionId}.json`);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readMode(projectPath: string): 'warn' | 'strict' {
  const cfgFile = configPath(projectPath);
  try {
    const raw = readFileSync(cfgFile, 'utf-8');
    const cfg: ModeConfig = JSON.parse(raw);
    if (cfg.mode === 'strict') return 'strict';
    return 'warn';
  } catch {
    return 'warn';
  }
}

export function writeMode(projectPath: string, mode: 'warn' | 'strict'): void {
  ensureDir(hookStateDir(projectPath));
  writeFileSync(configPath(projectPath), JSON.stringify({ mode }, null, 2), 'utf-8');
}

interface StdinFields {
  sessionId: string | null;
  toolName: string | null;
}

function parseStdinFields(input: unknown): StdinFields | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const sessionId = typeof obj.session_id === 'string' && obj.session_id.length > 0 ? obj.session_id : null;
  const toolName = typeof obj.tool_name === 'string' && obj.tool_name.length > 0 ? obj.tool_name : null;
  return { sessionId, toolName };
}

function parseStdin(raw: string): StdinFields | null {
  try {
    const parsed = JSON.parse(raw);
    return parseStdinFields(parsed);
  } catch {
    return null;
  }
}

export function markChecked(input: Record<string, unknown>, projectPath: string): void {
  const fields = parseStdinFields(input);

  if (!fields || !fields.sessionId) {
    return;
  }

  ensureDir(hookStateDir(projectPath));

  const marker: Marker = {
    lastCheckedAt: new Date().toISOString(),
    lastCheckedTool: fields.toolName || 'unknown',
  };

  writeFileSync(markerPath(projectPath, fields.sessionId), JSON.stringify(marker), 'utf-8');
}

export function checkEdit(input: Record<string, unknown>, projectPath: string): HookDecision {
  const fields = parseStdinFields(input);

  if (!fields || !fields.sessionId) {
    return { stdout: '', exitCode: 0 };
  }

  const mode = readMode(projectPath);
  const mp = markerPath(projectPath, fields.sessionId);
  const hasMarker = existsSync(mp);

  if (hasMarker) {
    try {
      unlinkSync(mp);
    } catch {
      // Ignore delete failures — stale marker is harmless and will be overwritten
    }

    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      }),
      exitCode: 0,
    };
  }

  const toolList = SAFETY_TOOLS.join('/');
  if (mode === 'strict') {
    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `No milens safety check recorded before this edit. Call one of (${toolList}) first, or switch enforcement mode in .milens/hook-state/config.json.`,
        },
      }),
      exitCode: 0,
    };
  }

  return {
    stdout: JSON.stringify({
      systemMessage: `No milens safety check (${toolList}) was run before this edit. Consider running one for safer changes.`,
    }),
    exitCode: 0,
  };
}

export function handleMarkChecked(rawStdin: string, projectPath: string): void {
  const fields = parseStdin(rawStdin);
  if (fields && fields.sessionId) {
    ensureDir(hookStateDir(projectPath));

    const marker: Marker = {
      lastCheckedAt: new Date().toISOString(),
      lastCheckedTool: fields.toolName || 'unknown',
    };

    writeFileSync(markerPath(projectPath, fields.sessionId), JSON.stringify(marker), 'utf-8');
  }
}

export function handleCheckEdit(rawStdin: string, projectPath: string): HookDecision {
  const fields = parseStdin(rawStdin);

  if (!fields || !fields.sessionId) {
    const mode = readMode(projectPath);
    if (mode === 'strict') {
      return {
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: 'No milens safety check recorded before this edit (unparseable hook input). Call a safety tool first, or switch enforcement mode in .milens/hook-state/config.json.',
          },
        }),
        exitCode: 0,
      };
    }
    return { stdout: '', exitCode: 0 };
  }

  const mode = readMode(projectPath);
  const mp = markerPath(projectPath, fields.sessionId);
  const hasMarker = existsSync(mp);

  if (hasMarker) {
    try {
      unlinkSync(mp);
    } catch {
      // Ignore delete failures
    }

    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      }),
      exitCode: 0,
    };
  }

  const toolList = SAFETY_TOOLS.join('/');
  if (mode === 'strict') {
    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `No milens safety check recorded before this edit. Call one of (${toolList}) first, or switch enforcement mode in .milens/hook-state/config.json.`,
        },
      }),
      exitCode: 0,
    };
  }

  return {
    stdout: JSON.stringify({
      systemMessage: `No milens safety check (${toolList}) was run before this edit. Consider running one for safer changes.`,
    }),
    exitCode: 0,
  };
}
