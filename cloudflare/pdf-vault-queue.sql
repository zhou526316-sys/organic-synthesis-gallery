-- Account-scoped metadata only. A pending task or a completed task conveys no
-- PDF availability, publisher permission, file location or cross-user grant.
CREATE TABLE IF NOT EXISTS user_pdf_acquisition_queue (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doi TEXT NOT NULL CHECK (
    length(doi) BETWEEN 8 AND 512 AND doi = lower(doi)
    AND doi GLOB '10.[0-9]*/*'
    AND instr(doi, char(0)) = 0 AND instr(doi, ' ') = 0
    AND instr(doi, '?') = 0 AND instr(doi, '#') = 0
  ),
  state TEXT NOT NULL CHECK (state IN ('pending', 'cancelled', 'completed')),
  revision INTEGER NOT NULL CHECK (
    typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991
  ),
  created_at INTEGER NOT NULL CHECK (
    typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991
  ),
  updated_at INTEGER NOT NULL CHECK (
    typeof(updated_at) = 'integer' AND updated_at BETWEEN created_at AND 9007199254740991
  ),
  PRIMARY KEY (user_id, doi)
);

CREATE INDEX IF NOT EXISTS idx_user_pdf_acquisition_queue_pending
  ON user_pdf_acquisition_queue(user_id, state, doi);

-- Keep the revision and cancelled/completed rows so a delayed operation cannot
-- recreate an already processed task using expectedRevision = 0.
CREATE TRIGGER IF NOT EXISTS trg_user_pdf_acquisition_queue_identity
BEFORE UPDATE ON user_pdf_acquisition_queue
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.doi IS NOT OLD.doi
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.revision != OLD.revision + 1 OR NEW.updated_at < OLD.updated_at
BEGIN
  SELECT RAISE(ABORT, 'pdf_vault_queue_identity_or_revision_invalid');
END;
