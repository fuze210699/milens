-- Milens Knowledge Graph Schema

-- Nodes
CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  name        TEXT NOT NULL,
  file_path   TEXT,
  start_line  INTEGER,
  end_line    INTEGER,
  is_exported INTEGER DEFAULT 0,
  properties  TEXT
);

-- Relationships
CREATE TABLE IF NOT EXISTS relationships (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES nodes(id),
  target_id   TEXT NOT NULL REFERENCES nodes(id),
  type        TEXT NOT NULL,
  confidence  REAL DEFAULT 1.0,
  reason      TEXT,
  properties  TEXT
);

-- Metadata
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  name, file_path, label,
  content='nodes',
  content_rowid='rowid'
);

-- FTS triggers to keep in sync
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, name, file_path, label)
  VALUES (new.rowid, new.name, new.file_path, new.label);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, file_path, label)
  VALUES ('delete', old.rowid, old.name, old.file_path, old.label);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, file_path, label)
  VALUES ('delete', old.rowid, old.name, old.file_path, old.label);
  INSERT INTO nodes_fts(rowid, name, file_path, label)
  VALUES (new.rowid, new.name, new.file_path, new.label);
END;
