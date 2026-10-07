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

-- Atomic mutex for GPT summary review. R2 remains durable review state/storage;
-- this D1 row only prevents cron/manual races from issuing duplicate model calls.
CREATE TABLE IF NOT EXISTS summary_review_mutex (
  doi TEXT PRIMARY KEY,
  evidence_packet_hash TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summary_review_mutex_lease
  ON summary_review_mutex(lease_expires_at, lease_owner);

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
-- siteAnalyticsStats correlates pageview IP hashes with article-open IP hashes.
-- The (doi, ip_hash) primary key cannot efficiently serve an ip_hash-only lookup,
-- so keep a dedicated index to avoid repeated reader-table scans.
CREATE INDEX IF NOT EXISTS idx_paper_open_readers_v3_ip_hash
  ON paper_open_readers_v3(ip_hash);

CREATE TABLE IF NOT EXISTS paper_open_reader_counts_v3 (
  doi TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at INTEGER NOT NULL
);

-- Recover only historical rows that were already produced by genuine card-open
-- events under hashed-IP semantics. Reading-status/profile rows are excluded.
INSERT OR IGNORE INTO paper_open_readers_v3 (doi, ip_hash, first_opened_at)
SELECT
  doi,
  substr(profile_id, 4),
  first_read_at
FROM paper_readers
WHERE profile_id LIKE 'ip:%'
  AND first_status_id = 'card-open'
  AND length(profile_id) > 3;

-- Rebuild the compact v3 counters from the deduplicated source-of-truth rows.
INSERT INTO paper_open_reader_counts_v3 (doi, count, updated_at)
SELECT
  doi,
  COUNT(*) AS count,
  MAX(first_opened_at) AS updated_at
FROM paper_open_readers_v3
GROUP BY doi
ON CONFLICT(doi) DO UPDATE SET
  count = excluded.count,
  updated_at = excluded.updated_at;


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


-- Account capabilities are server-authoritative. Public frontend code must not
-- infer privileged behavior from an email address or local-only flag.
CREATE TABLE IF NOT EXISTS user_capabilities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  granted_by TEXT NOT NULL,
  PRIMARY KEY (user_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_user_capabilities_capability
  ON user_capabilities(capability, user_id);

-- Private PDF metadata. Bytes live only in the dedicated PDF_PRIVATE R2 bucket
-- and are never referenced from public media manifests.
CREATE TABLE IF NOT EXISTS private_pdf_documents (
  id TEXT PRIMARY KEY,
  doi TEXT NOT NULL,
  publisher TEXT NOT NULL,
  article_url TEXT,
  source_url TEXT,
  version_kind TEXT NOT NULL DEFAULT 'unknown'
    CHECK (version_kind IN ('version_of_record','accepted_manuscript','preprint','unknown')),
  content_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  captured_at INTEGER NOT NULL,
  processing_state TEXT NOT NULL DEFAULT 'raw'
    CHECK (processing_state IN ('raw','queued','processing','ready','failed')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (doi, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_private_pdf_documents_doi_active
  ON private_pdf_documents(doi, active, captured_at DESC);

-- Short-lived opaque browser-view tokens. The raw token is never stored.
CREATE TABLE IF NOT EXISTS private_pdf_access_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES private_pdf_documents(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_pdf_access_tokens_expiry
  ON private_pdf_access_tokens(expires_at);


CREATE TABLE IF NOT EXISTS private_pdf_capture_leases (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  label TEXT
);
CREATE INDEX IF NOT EXISTS idx_private_pdf_capture_leases_user
  ON private_pdf_capture_leases(user_id, expires_at);


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


-- D2b1 shadow index for summary-review job metadata.
-- R2 remains the durable job source until candidate parity is proven.
CREATE TABLE IF NOT EXISTS summary_review_job_index (
  doi TEXT PRIMARY KEY,
  job_r2_key TEXT NOT NULL,
  evidence_packet_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  evidence_level TEXT NOT NULL DEFAULT 'unknown',
  text_processing_policy TEXT NOT NULL DEFAULT 'unknown',
  captured_at TEXT NOT NULL DEFAULT '',
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summary_review_job_state
  ON summary_review_job_index(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_summary_review_job_published
  ON summary_review_job_index(published_at DESC, doi ASC);
CREATE INDEX IF NOT EXISTS idx_summary_review_job_retry
  ON summary_review_job_index(state, next_retry_at, lease_expires_at);

CREATE TABLE IF NOT EXISTS summary_review_job_index_backfill (
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

-- Row-oriented shadow for future account-state scaling. Legacy user_library_state remains authoritative in D3a.
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

-- D3c isolated row/delta foundation. D3b remains authoritative until a separate activation gate.
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

-- Materialized site analytics shadow. Raw site_pageviews_v1 remains authoritative in D4a.
CREATE TABLE IF NOT EXISTS site_global_stats_v2 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pv INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  uv INTEGER NOT NULL DEFAULT 0 CHECK (uv >= 0),
  first_viewed_at INTEGER,
  last_viewed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_daily_stats_v2 (
  beijing_date TEXT PRIMARY KEY,
  pv INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  uv INTEGER NOT NULL DEFAULT 0 CHECK (uv >= 0),
  first_viewed_at INTEGER,
  last_viewed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_dimension_daily_stats_v2 (
  dimension_type TEXT NOT NULL CHECK (dimension_type IN ('referrer','device')),
  beijing_date TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  pv INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  uv INTEGER NOT NULL DEFAULT 0 CHECK (uv >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dimension_type, beijing_date, dimension_value)
);
CREATE INDEX IF NOT EXISTS idx_site_dimension_daily_stats_v2_date
  ON site_dimension_daily_stats_v2(dimension_type, beijing_date);

CREATE TABLE IF NOT EXISTS site_analytics_visitors_v2 (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global','day','referrer','device','referrer_day','device_day')),
  scope_key TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  first_event_id INTEGER NOT NULL,
  first_viewed_at INTEGER NOT NULL,
  last_viewed_at INTEGER NOT NULL,
  last_seen_date TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 1 CHECK (pageviews >= 1),
  paper_open INTEGER NOT NULL DEFAULT 0 CHECK (paper_open IN (0,1)),
  PRIMARY KEY (scope_type, scope_key, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_site_analytics_visitors_v2_recent
  ON site_analytics_visitors_v2(scope_type, last_seen_date, scope_key);

CREATE TABLE IF NOT EXISTS site_analytics_materialized_events_v2 (
  event_id INTEGER PRIMARY KEY,
  materialized_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_analytics_v2_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_event_id INTEGER NOT NULL DEFAULT 0,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
  scanned_events INTEGER NOT NULL DEFAULT 0,
  materialized_events INTEGER NOT NULL DEFAULT 0,
  duplicate_events INTEGER NOT NULL DEFAULT 0,
  failed_events INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);

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
