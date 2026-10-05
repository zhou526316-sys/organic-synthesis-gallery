CREATE TABLE IF NOT EXISTS user_library_head (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL,
  global_json TEXT NOT NULL,
  papers_split INTEGER NOT NULL CHECK (papers_split IN (0,1)),
  metadata_split INTEGER NOT NULL CHECK (metadata_split IN (0,1)),
  paper_count INTEGER NOT NULL DEFAULT 0 CHECK (paper_count >= 0),
  metadata_count INTEGER NOT NULL DEFAULT 0 CHECK (metadata_count >= 0),
  source_state_hash TEXT NOT NULL,
  shadow_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_paper_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_key TEXT NOT NULL,
  doi TEXT,
  paper_present INTEGER NOT NULL CHECK (paper_present IN (0,1)),
  paper_state_json TEXT,
  metadata_present INTEGER NOT NULL CHECK (metadata_present IN (0,1)),
  metadata_json TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, paper_key)
);
CREATE INDEX IF NOT EXISTS idx_user_paper_state_user_revision
  ON user_paper_state(user_id, revision);
CREATE INDEX IF NOT EXISTS idx_user_paper_state_doi
  ON user_paper_state(doi) WHERE doi IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_library_shadow_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor_user_id TEXT,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
  scanned_users INTEGER NOT NULL DEFAULT 0,
  synced_users INTEGER NOT NULL DEFAULT 0,
  skipped_stale INTEGER NOT NULL DEFAULT 0,
  invalid_states INTEGER NOT NULL DEFAULT 0,
  failed_users INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
