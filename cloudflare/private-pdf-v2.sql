-- Private PDF v2 additive migration: capture leases only.
-- No changes to existing literature/media tables.
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
