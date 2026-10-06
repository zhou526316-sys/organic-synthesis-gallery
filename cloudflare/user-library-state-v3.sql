-- D3c V3 user-library delta foundation.
-- These tables are isolated from the active D3b row-read path. No production
-- write path is switched by applying this schema.

CREATE TABLE IF NOT EXISTS user_library_v3_head (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL DEFAULT 0,
  global_json TEXT NOT NULL DEFAULT '{}',
  global_revision INTEGER NOT NULL DEFAULT 0 CHECK (global_revision >= 0),
  paper_count INTEGER NOT NULL DEFAULT 0 CHECK (paper_count >= 0),
  metadata_count INTEGER NOT NULL DEFAULT 0 CHECK (metadata_count >= 0),
  change_floor_revision INTEGER NOT NULL DEFAULT 0 CHECK (change_floor_revision >= 0),
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_library_v3_rows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_key TEXT NOT NULL,
  doi TEXT,
  paper_present INTEGER NOT NULL CHECK (paper_present IN (0,1)),
  paper_state_json TEXT,
  metadata_present INTEGER NOT NULL CHECK (metadata_present IN (0,1)),
  metadata_json TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, paper_key),
  CHECK (deleted = 0 OR (paper_present = 0 AND metadata_present = 0))
);
CREATE INDEX IF NOT EXISTS idx_user_library_v3_rows_user_revision
  ON user_library_v3_rows(user_id, revision, paper_key);
CREATE INDEX IF NOT EXISTS idx_user_library_v3_rows_doi
  ON user_library_v3_rows(doi) WHERE doi IS NOT NULL AND deleted = 0;

CREATE TABLE IF NOT EXISTS user_library_v3_commits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, revision)
);

CREATE TABLE IF NOT EXISTS user_library_v3_changes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  seq INTEGER NOT NULL CHECK (seq >= 0),
  paper_key TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  doi TEXT,
  paper_present INTEGER NOT NULL CHECK (paper_present IN (0,1)),
  paper_state_json TEXT,
  metadata_present INTEGER NOT NULL CHECK (metadata_present IN (0,1)),
  metadata_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, revision, seq),
  FOREIGN KEY (user_id, revision)
    REFERENCES user_library_v3_commits(user_id, revision) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_library_v3_changes_user_revision
  ON user_library_v3_changes(user_id, revision, seq);


CREATE TABLE IF NOT EXISTS user_library_v3_shape (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  papers_split INTEGER NOT NULL CHECK (papers_split IN (0,1)),
  metadata_split INTEGER NOT NULL CHECK (metadata_split IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision >= 0)
);


CREATE TABLE IF NOT EXISTS user_library_v3_authority (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  authority TEXT NOT NULL DEFAULT 'v3' CHECK (authority = 'v3'),
  activated_revision INTEGER NOT NULL CHECK (activated_revision >= 1),
  activated_at INTEGER NOT NULL
);

-- Once a user has crossed the irreversible per-user V3 authority boundary,
-- even an in-flight older Worker is forbidden from reviving the monolithic write path.
CREATE TRIGGER IF NOT EXISTS trg_user_library_state_block_v3_insert
BEFORE INSERT ON user_library_state
WHEN EXISTS (
  SELECT 1 FROM user_library_v3_authority
  WHERE user_id=NEW.user_id AND authority='v3'
)
BEGIN
  SELECT RAISE(ABORT,'user_library_v3_authority_active');
END;

CREATE TRIGGER IF NOT EXISTS trg_user_library_state_block_v3_update
BEFORE UPDATE ON user_library_state
WHEN EXISTS (
  SELECT 1 FROM user_library_v3_authority
  WHERE user_id=NEW.user_id AND authority='v3'
)
BEGIN
  SELECT RAISE(ABORT,'user_library_v3_authority_active');
END;

CREATE TABLE IF NOT EXISTS user_library_v3_shadow_sync (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL DEFAULT 0 CHECK (source_revision >= 0),
  source_updated_at INTEGER NOT NULL DEFAULT 0,
  source_state_hash TEXT NOT NULL DEFAULT '',
  inflight_revision INTEGER NOT NULL DEFAULT 0 CHECK (inflight_revision >= 0),
  inflight_started_at INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_library_v3_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor_user_id TEXT,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
  scanned_users INTEGER NOT NULL DEFAULT 0,
  synced_users INTEGER NOT NULL DEFAULT 0,
  skipped_fresh INTEGER NOT NULL DEFAULT 0,
  skipped_stale INTEGER NOT NULL DEFAULT 0,
  failed_users INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
