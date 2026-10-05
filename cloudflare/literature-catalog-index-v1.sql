-- Dormant all-time Gallery literature search index foundation.
-- Production frontend reads do not use these tables until a later verified cutover.

CREATE TABLE IF NOT EXISTS literature_catalog_generations (
  catalog_id TEXT PRIMARY KEY,
  doi_set_hash TEXT NOT NULL,
  publication_slot TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  marker_blob_sha TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS literature_catalog_index (
  catalog_id TEXT NOT NULL,
  doi TEXT NOT NULL,
  revision TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  title_zh TEXT NOT NULL DEFAULT '',
  authors_text TEXT NOT NULL DEFAULT '',
  authors_json TEXT NOT NULL DEFAULT '[]',
  journal TEXT NOT NULL DEFAULT '',
  first_online_date TEXT,
  date_precision TEXT NOT NULL DEFAULT 'unknown',
  added_date TEXT,
  synthesis_type TEXT,
  searchable_text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (catalog_id, doi)
);

CREATE INDEX IF NOT EXISTS idx_literature_catalog_date
  ON literature_catalog_index(catalog_id, first_online_date DESC, doi ASC);
CREATE INDEX IF NOT EXISTS idx_literature_catalog_journal_date
  ON literature_catalog_index(catalog_id, journal, first_online_date DESC, doi ASC);
CREATE INDEX IF NOT EXISTS idx_literature_catalog_added_date
  ON literature_catalog_index(catalog_id, added_date DESC, doi ASC);

CREATE VIRTUAL TABLE IF NOT EXISTS literature_catalog_fts USING fts5(
  catalog_id UNINDEXED,
  doi UNINDEXED,
  searchable_text,
  tokenize='trigram'
);
