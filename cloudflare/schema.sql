PRAGMA foreign_keys = ON;

-- Canonical per-DOI TOC / graphical-abstract record. Image bytes live in R2.
CREATE TABLE IF NOT EXISTS toc_assets (
  doi TEXT PRIMARY KEY,
  article_url TEXT,
  r2_key TEXT,
  content_hash TEXT,
  reason TEXT,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
  checked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_toc_assets_hash ON toc_assets(content_hash);

-- One best retained asset for each semantic figure label per DOI.
-- This makes figure writes atomic in D1 instead of read-modify-write JSON files.
CREATE TABLE IF NOT EXISTS figure_assets (
  doi TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  label TEXT NOT NULL,
  caption TEXT,
  article_url TEXT,
  r2_key TEXT NOT NULL,
  content_hash TEXT,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doi, semantic_key)
);
CREATE INDEX IF NOT EXISTS idx_figure_assets_doi_order
  ON figure_assets(doi, sort_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_figure_assets_hash
  ON figure_assets(doi, content_hash);

-- Cloud repair state. This replaces media-repair/state.json.
CREATE TABLE IF NOT EXISTS media_repair_state (
  doi TEXT PRIMARY KEY,
  repair_version INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  last_root_cause TEXT,
  last_outcome TEXT,
  reported_priority INTEGER NOT NULL DEFAULT 0 CHECK (reported_priority IN (0, 1)),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_repair_ready
  ON media_repair_state(next_retry_at, reported_priority DESC, attempts);

-- Title-known / DOI-missing resolution cache.
CREATE TABLE IF NOT EXISTS paper_title_resolution (
  identity TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  doi TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_title_resolution_doi
  ON paper_title_resolution(doi);

-- Chinese-title cache. The normalized source title hash is the stable key.
CREATE TABLE IF NOT EXISTS title_translation_zh (
  title_hash TEXT PRIMARY KEY,
  source_title TEXT NOT NULL,
  zh_title TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Persisted literature supplement used by the Gallery in addition to static data.
CREATE TABLE IF NOT EXISTS literature_supplement_papers (
  identity TEXT PRIMARY KEY,
  doi TEXT,
  title TEXT,
  journal TEXT NOT NULL,
  first_online_date TEXT NOT NULL,
  article_url TEXT,
  synthesis_type TEXT CHECK (synthesis_type IN ('methodology', 'total', 'formal')),
  source TEXT,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_literature_supplement_doi
  ON literature_supplement_papers(doi)
  WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_literature_supplement_date
  ON literature_supplement_papers(first_online_date DESC);

CREATE TABLE IF NOT EXISTS literature_supplement_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generated_at INTEGER NOT NULL,
  verified_through TEXT,
  review_summary_json TEXT,
  updated_at INTEGER NOT NULL
);

-- Enhanced classifier cache for ingestion/audit only.
CREATE TABLE IF NOT EXISTS literature_classifier_cache (
  identity TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  classifier_version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Optional durable diagnostic attempts. High-volume transient render reports stay in KV.
CREATE TABLE IF NOT EXISTS media_attempts (
  doi TEXT PRIMARY KEY,
  source TEXT,
  stage TEXT,
  outcome TEXT,
  root_cause TEXT,
  detail_json TEXT,
  updated_at INTEGER NOT NULL
);

-- Unique-reader events. A browser profile is provisional until account auth is connected;
-- the primary key prevents the same profile from incrementing one paper more than once.
CREATE TABLE IF NOT EXISTS paper_readers (
  doi TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  first_read_at INTEGER NOT NULL,
  first_status_id TEXT,
  PRIMARY KEY (doi, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_paper_readers_doi ON paper_readers(doi);

-- User-submitted metadata/media corrections enter a review queue; they never edit literature directly.
CREATE TABLE IF NOT EXISTS paper_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doi TEXT NOT NULL,
  profile_id TEXT,
  kind TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_feedback_status_created
  ON paper_feedback(status, created_at DESC);
