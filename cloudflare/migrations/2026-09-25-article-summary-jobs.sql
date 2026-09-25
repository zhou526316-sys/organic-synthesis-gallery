-- Durable GPT-reviewed article-summary queue.
-- Raw article evidence and model artifacts remain private in R2; D1 stores only
-- hashes, state, lease/retry metadata, and model/prompt versions.

CREATE TABLE IF NOT EXISTS article_summary_jobs (
  doi TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL,
  evidence_packet_hash TEXT NOT NULL,
  evidence_level TEXT NOT NULL CHECK (evidence_level IN ('abstract_only', 'partial', 'complete', 'unknown')),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN (
    'queued',
    'leased',
    'draft_ready',
    'audit_running',
    'audit_passed',
    'retry_wait',
    'needs_manual_review',
    'published',
    'blocked'
  )),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  draft_model TEXT,
  audit_model TEXT,
  prompt_version TEXT,
  audit_version TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_article_summary_jobs_claim
  ON article_summary_jobs(state, next_retry_at, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_summary_jobs_lease
  ON article_summary_jobs(lease_expires_at, lease_owner);

CREATE INDEX IF NOT EXISTS idx_article_summary_jobs_source
  ON article_summary_jobs(source_hash, evidence_packet_hash);
