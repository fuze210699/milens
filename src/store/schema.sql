-- milens code intelligence database schema

CREATE TABLE IF NOT EXISTS symbols (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  start_line  INTEGER,
  end_line    INTEGER,
  exported    INTEGER DEFAULT 0,
  parent_id   TEXT,
  signature   TEXT,
  role        TEXT,
  heat        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS links (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  type        TEXT NOT NULL,
  confidence  REAL DEFAULT 1.0,
  line_number INTEGER
);

CREATE TABLE IF NOT EXISTS file_hashes (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
  zone        TEXT
);

CREATE TABLE IF NOT EXISTS repo_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_links_from   ON links(from_id);
CREATE INDEX IF NOT EXISTS idx_links_to     ON links(to_id);
CREATE INDEX IF NOT EXISTS idx_links_type   ON links(type);

-- FTS5 full-text search on symbol names and paths
CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
  name,
  file_path,
  kind,
  content='symbols',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbol_fts(rowid, name, file_path, kind)
  VALUES (new.rowid, new.name, new.file_path, new.kind);
END;

CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbol_fts(symbol_fts, rowid, name, file_path, kind)
  VALUES ('delete', old.rowid, old.name, old.file_path, old.kind);
END;

-- Tool usage tracking for dashboard analytics
CREATE TABLE IF NOT EXISTS tool_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tool        TEXT NOT NULL,
  called_at   TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER DEFAULT 0,
  tokens_in   INTEGER DEFAULT 0,
  tokens_out  INTEGER DEFAULT 0,
  tokens_saved INTEGER DEFAULT 0,
  repo        TEXT
);

-- Agent annotations: observations about symbols stored by agents
CREATE TABLE IF NOT EXISTS annotations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol      TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  agent       TEXT,
  session_id  TEXT,
  confidence  REAL DEFAULT 0.5,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_annotations_symbol ON annotations(symbol, key);
CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id);

-- Agent sessions: multi-agent session management
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  agent             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT,
  context           TEXT,
  tool_calls_count  INTEGER DEFAULT 0,
  annotations_count INTEGER DEFAULT 0
);

-- Vector embeddings for semantic code search
CREATE TABLE IF NOT EXISTS symbol_embeddings (
  symbol_id   TEXT PRIMARY KEY,
  embedding   BLOB NOT NULL,
  model       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage(tool);
CREATE INDEX IF NOT EXISTS idx_tool_usage_at   ON tool_usage(called_at);

-- Evolution log: track pattern promotion/demotion/archive
CREATE TABLE IF NOT EXISTS evolution_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL,
  event       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evolution_annotation ON evolution_log(annotation_id);

-- Metric history: snapshots for trend tracking over time
CREATE TABLE IF NOT EXISTS metric_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT NOT NULL,
  value       REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metric_name ON metric_history(metric_name);
CREATE INDEX IF NOT EXISTS idx_metric_at ON metric_history(recorded_at);
