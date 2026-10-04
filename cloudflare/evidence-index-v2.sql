-- D2a.2 historical encrypted-handoff metadata backfill state.
-- R2 remains authoritative for handoff bytes; this table stores only cursor/progress.
CREATE TABLE IF NOT EXISTS article_evidence_handoff_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  scanned_objects INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER NOT NULL DEFAULT 0,
  skipped_invalid INTEGER NOT NULL DEFAULT 0,
  skipped_stale INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
