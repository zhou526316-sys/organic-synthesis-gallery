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

-- Canonical Primary Visual. The rank order is enforced by application code:
-- official visual > publisher Figure 1 > PDF primary > article figure/scheme > open fallback.
CREATE TABLE IF NOT EXISTS primary_visual_assets (
  doi TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (
    'official_visual',
    'figure1',
    'pdf_primary',
    'article_figure',
    'open_fallback'
  )),
  source TEXT NOT NULL,
  source_url TEXT,
  article_url TEXT,
  r2_key TEXT NOT NULL,
  content_hash TEXT,
  caption TEXT,
  confidence INTEGER NOT NULL DEFAULT 0,
  page_number INTEGER,
  bbox_json TEXT,
  retrieved_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_primary_visual_kind
  ON primary_visual_assets(kind, confidence DESC, updated_at DESC);


-- Optional display variants for a canonical Primary Visual. The master row
-- remains in primary_visual_assets; this table lets card thumbnails be small
-- while the lightbox opens the original/high-resolution asset.
CREATE TABLE IF NOT EXISTS primary_visual_variants (
  doi TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'thumbnail', 'preview')),
  r2_key TEXT NOT NULL,
  content_hash TEXT,
  width INTEGER,
  height INTEGER,
  byte_length INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doi, role)
);
CREATE INDEX IF NOT EXISTS idx_primary_visual_variants_doi
  ON primary_visual_variants(doi, role);

-- Lease-based media job queue. This is the only task truth for new resolver code.
CREATE TABLE IF NOT EXISTS media_jobs (
  doi TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'coverage' CHECK (mode IN ('coverage', 'upgrade')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
    'pending',
    'leased',
    'processing',
    'retry_wait',
    'manual_required',
    'resolved',
    'upgrade_wait',
    'audited_unresolved'
  )),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  last_failure_reason TEXT,
  visual_kind TEXT,
  visual_source TEXT,
  confidence INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_jobs_claim
  ON media_jobs(mode, state, next_retry_at, priority DESC, attempts ASC);
CREATE INDEX IF NOT EXISTS idx_media_jobs_lease
  ON media_jobs(lease_expires_at, lease_owner);
CREATE INDEX IF NOT EXISTS idx_media_jobs_publisher_state
  ON media_jobs(publisher, state, updated_at DESC);

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

-- Explicit Beijing-date of first formal Gallery inclusion. This is separate
-- from publication date and is never synthesized for historical rows.
CREATE TABLE IF NOT EXISTS literature_supplement_added_dates (
  identity TEXT PRIMARY KEY,
  added_date TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_literature_supplement_added_date
  ON literature_supplement_added_dates(added_date DESC);

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

-- Materialized public unique-reader counts. paper_readers remains the source of
-- truth for IP+DOI uniqueness; this table prevents repeated COUNT(*) scans.
CREATE TABLE IF NOT EXISTS paper_reader_counts (
  doi TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at INTEGER NOT NULL
);

-- v2 keeps the pre-IP reader total as a conservative historical floor and
-- tracks new unique-IP readers separately. Public count = max(floor, ip_count).
CREATE TABLE IF NOT EXISTS paper_reader_counts_v2 (
  doi TEXT PRIMARY KEY,
  legacy_floor INTEGER NOT NULL DEFAULT 0 CHECK (legacy_floor >= 0),
  ip_count INTEGER NOT NULL DEFAULT 0 CHECK (ip_count >= 0),
  updated_at INTEGER NOT NULL
);

-- v3 is the clean public metric: only real article-open events after this
-- migration, deduplicated permanently by DOI + hashed IP. No legacy status
-- rows or earlier IP rows are backfilled into this generation.
CREATE TABLE IF NOT EXISTS paper_open_readers_v3 (
  doi TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  first_opened_at INTEGER NOT NULL,
  PRIMARY KEY (doi, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_paper_open_readers_v3_doi
  ON paper_open_readers_v3(doi);

CREATE TABLE IF NOT EXISTS paper_open_reader_counts_v3 (
  doi TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at INTEGER NOT NULL
);


-- Site-level pageview analytics from this schema generation onward.
-- ip_hash is salted server-side from CF-Connecting-IP; raw IP addresses are never stored.
-- page_path excludes query strings; referrer_host stores only the hostname.
CREATE TABLE IF NOT EXISTS site_pageviews_v1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  page_path TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'other')),
  beijing_date TEXT NOT NULL,
  viewed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_pageviews_v1_date
  ON site_pageviews_v1(beijing_date, viewed_at);
CREATE INDEX IF NOT EXISTS idx_site_pageviews_v1_ip
  ON site_pageviews_v1(ip_hash, viewed_at);
CREATE INDEX IF NOT EXISTS idx_site_pageviews_v1_referrer
  ON site_pageviews_v1(referrer_host, viewed_at);
CREATE INDEX IF NOT EXISTS idx_site_pageviews_v1_device
  ON site_pageviews_v1(device_type, viewed_at);

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

-- General site feedback ("吐槽") is deliberately separate from per-paper
-- correction feedback. It is collected for later GPT-assisted triage and never
-- mutates literature records or site code by itself.
CREATE TABLE IF NOT EXISTS site_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'search', 'ui', 'account', 'literature', 'other')),
  message TEXT NOT NULL,
  page_path TEXT,
  language TEXT,
  context_json TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_feedback_status_created
  ON site_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_feedback_profile_created
  ON site_feedback(profile_id, created_at DESC);

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


-- Email-verification state for password accounts. Existing accounts remain valid but can be prompted to verify.
CREATE TABLE IF NOT EXISTS user_email_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_email_verifications_email
  ON user_email_verifications(email);

-- One-time six-digit email challenges for registration, password reset, and existing-account verification.
CREATE TABLE IF NOT EXISTS email_code_challenges (
  challenge_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'reset', 'verify')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  password_hash TEXT,
  salt TEXT,
  iterations INTEGER CHECK (iterations IS NULL OR iterations >= 100000),
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_sent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_code_challenges_purpose_email
  ON email_code_challenges(purpose, email);
CREATE INDEX IF NOT EXISTS idx_email_code_challenges_expiry
  ON email_code_challenges(expires_at);


-- Verified new-address challenges for authenticated local accounts changing their email.
CREATE TABLE IF NOT EXISTS email_change_challenges (
  challenge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_sent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_change_challenges_user
  ON email_change_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_challenges_expiry
  ON email_change_challenges(expires_at);
