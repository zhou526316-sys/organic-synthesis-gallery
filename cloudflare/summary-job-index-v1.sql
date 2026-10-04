-- D2b shadow index for summary-review job metadata.
-- R2 job objects remain authoritative; this table is not a read path.
CREATE TABLE IF NOT EXISTS summary_review_job_index (
  doi TEXT PRIMARY KEY,
  job_r2_key TEXT NOT NULL,
  evidence_packet_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  evidence_level TEXT NOT NULL DEFAULT 'unknown',
  text_processing_policy TEXT NOT NULL DEFAULT 'unknown',
  captured_at TEXT NOT NULL DEFAULT '',
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summary_review_job_state
  ON summary_review_job_index(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_summary_review_job_published
  ON summary_review_job_index(published_at DESC);

CREATE TABLE IF NOT EXISTS summary_review_job_index_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  scanned_objects INTEGER NOT NULL DEFAULT 0,
  indexed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_invalid INTEGER NOT NULL DEFAULT 0,
  skipped_stale INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
