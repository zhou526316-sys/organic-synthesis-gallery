-- Private PDF v1 additive migration.
-- Idempotent and isolated: no data updates/deletes and no changes to existing tables.

CREATE TABLE IF NOT EXISTS user_capabilities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  granted_by TEXT NOT NULL,
  PRIMARY KEY (user_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_user_capabilities_capability
  ON user_capabilities(capability, user_id);

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

CREATE TABLE IF NOT EXISTS private_pdf_access_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES private_pdf_documents(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_pdf_access_tokens_expiry
  ON private_pdf_access_tokens(expires_at);
