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
