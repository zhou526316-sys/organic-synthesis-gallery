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

-- Ordered full author lists for literature supplements. Kept in a child table so
-- existing D1 databases can adopt authors without ALTER TABLE migrations.
CREATE TABLE IF NOT EXISTS literature_supplement_authors (
  identity TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  PRIMARY KEY (identity, sort_order)
);
CREATE INDEX IF NOT EXISTS idx_literature_supplement_authors_identity
  ON literature_supplement_authors(identity, sort_order);

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

-- Unique-reader events. Browser profiles are provisional until a live account session links them.
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

-- Formal user accounts. OAuth identities remain separate until the user explicitly links them.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_states_expiry ON auth_states(expires_at);

-- OAuth/email callbacks exchange this short-lived one-time code for an opaque bearer session.
CREATE TABLE IF NOT EXISTS login_exchange_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_exchange_expiry ON login_exchange_codes(expires_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);

-- One synchronized user-library document per account. revision provides optimistic concurrency control.
CREATE TABLE IF NOT EXISTS user_library_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);

-- Associates a browser profile with a live session so reader counts can use the stable account identity.
-- The join to user_sessions makes the link automatically invalid after logout or session expiry.
CREATE TABLE IF NOT EXISTS user_profile_sessions (
  profile_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL REFERENCES user_sessions(token_hash) ON DELETE CASCADE,
  linked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_profile_sessions_user ON user_profile_sessions(user_id);

CREATE TABLE IF NOT EXISTS email_login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_login_expiry ON email_login_tokens(expires_at);

-- Support-site orders. Provider callbacks are the only path that can mark an order paid.
CREATE TABLE IF NOT EXISTS support_orders (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('wechat', 'alipay')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed', 'closed')),
  profile_id TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider_order_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_orders_status_created
  ON support_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_orders_user_created
  ON support_orders(user_id, created_at DESC);

-- Native site accounts using email + password. Passwords are PBKDF2-SHA256 hashes with per-user salts.
CREATE TABLE IF NOT EXISTS password_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL CHECK (iterations >= 100000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_credentials_email
  ON password_credentials(email);


-- Short-lived, email-verified registration requests for native password accounts.
CREATE TABLE IF NOT EXISTS password_registration_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL CHECK (iterations >= 100000),
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_registration_tokens_expiry
  ON password_registration_tokens(expires_at);
