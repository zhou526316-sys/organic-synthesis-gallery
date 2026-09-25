-- Atomic lease for GPT summary review. Durable review state remains in private R2;
-- this D1 table only prevents concurrent cron/manual runs from calling models
-- for the same DOI/evidence generation.

CREATE TABLE IF NOT EXISTS article_summary_review_leases (
  doi TEXT PRIMARY KEY,
  evidence_packet_hash TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_article_summary_review_leases_expiry
  ON article_summary_review_leases(lease_expires_at, updated_at);
