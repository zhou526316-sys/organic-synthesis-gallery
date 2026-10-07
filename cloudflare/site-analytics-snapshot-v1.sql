-- D4c bounded public analytics snapshot.
-- Heavy visitor-state aggregation is generated outside the public request path.
CREATE TABLE IF NOT EXISTS site_analytics_public_snapshot_v1 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  snapshot_json TEXT NOT NULL,
  source_raw_max_event_id INTEGER NOT NULL DEFAULT 0,
  source_materialized_max_event_id INTEGER NOT NULL DEFAULT 0,
  source_global_pv INTEGER NOT NULL DEFAULT 0,
  source_reader_rows INTEGER NOT NULL DEFAULT 0,
  source_reader_max_opened_at INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
