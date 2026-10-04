-- D2a shadow index for article Evidence. R2 remains the durable source of bytes.
-- The index is disabled by default in application code until explicitly enabled.
CREATE TABLE IF NOT EXISTS article_evidence_index (
  doi TEXT PRIMARY KEY,
  evidence_r2_key TEXT NOT NULL,
  evidence_packet_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  evidence_level TEXT NOT NULL DEFAULT 'unknown',
  text_processing_policy TEXT NOT NULL DEFAULT 'unknown',
  captured_at TEXT NOT NULL DEFAULT '',
  handoff_r2_key TEXT,
  handoff_ready INTEGER NOT NULL DEFAULT 0 CHECK (handoff_ready IN (0, 1)),
  handoff_key_id TEXT NOT NULL DEFAULT '',
  handoff_algorithm TEXT NOT NULL DEFAULT '',
  handoff_compression TEXT NOT NULL DEFAULT '',
  indexed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_article_evidence_index_captured
  ON article_evidence_index(captured_at DESC, doi ASC);
CREATE INDEX IF NOT EXISTS idx_article_evidence_index_policy
  ON article_evidence_index(text_processing_policy, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_evidence_index_handoff
  ON article_evidence_index(handoff_ready, captured_at DESC);

CREATE TABLE IF NOT EXISTS article_evidence_index_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  scanned_objects INTEGER NOT NULL DEFAULT 0,
  indexed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_invalid INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);


CREATE TABLE IF NOT EXISTS article_evidence_handoff_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  scanned_objects INTEGER NOT NULL DEFAULT 0,
  indexed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_invalid INTEGER NOT NULL DEFAULT 0,
  stale_rows INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
