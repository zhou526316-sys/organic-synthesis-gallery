-- Owner-controlled, account-bound private PDF read grants only.
-- Contains no email, PDF bytes, R2 object keys, secrets or signed file URLs.
-- An audit event and its permission mutation are committed as a single D1 batch.
CREATE TABLE IF NOT EXISTS private_pdf_reader_grant_audit (
  event_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('grant','revoke')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_pdf_reader_grant_audit_target_created
  ON private_pdf_reader_grant_audit(target_user_id,created_at DESC);
