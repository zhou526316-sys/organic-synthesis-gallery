-- China-first PDF Vault P0: independent user-scoped control-plane metadata.
-- Install separately when the first real Vault service is enabled. This file
-- does not migrate, grant access to, or reference the owner private_pdf tables.
-- All timestamps are integer Unix milliseconds; no PDF bytes, local paths,
-- handles, credentials, cookies, signed URLs, or extracted text belong here.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_documents (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doi TEXT NOT NULL CHECK (
    typeof(doi) = 'text' AND length(doi) BETWEEN 6 AND 512 AND doi = lower(trim(doi))
    AND doi LIKE '10.%/%' AND instr(doi, ' ') = 0
    AND instr(doi, char(9)) = 0 AND instr(doi, char(10)) = 0
    AND instr(doi, char(13)) = 0
  ),
  preferred_content_hash TEXT CHECK (
    preferred_content_hash IS NULL OR
    (typeof(preferred_content_hash) = 'text' AND length(preferred_content_hash) = 64 AND preferred_content_hash NOT GLOB '*[^0-9a-f]*')
  ),
  preferred_version_kind TEXT CHECK (
    preferred_version_kind IS NULL OR preferred_version_kind IN
      ('publisher', 'accepted_manuscript', 'preprint', 'unknown')
  ),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer' AND updated_at BETWEEN created_at AND 9007199254740991),
  PRIMARY KEY (user_id, doi),
  CHECK ((preferred_content_hash IS NULL) = (preferred_version_kind IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_user_documents_updated
  ON user_documents(user_id, updated_at, doi);

CREATE TRIGGER IF NOT EXISTS trg_user_document_identity
BEFORE UPDATE ON user_documents
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.doi IS NOT OLD.doi
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'pdf_vault_document_identity_immutable');
END;

-- The copy id and device id are opaque identifiers within this account.
-- No global content-hash uniqueness, DOI lookup, shared object entitlement,
-- or link to an owner's private PDF is created by this model.
CREATE TABLE IF NOT EXISTS user_document_copies (
  id TEXT NOT NULL CHECK (typeof(id) = 'text' AND length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  user_id TEXT NOT NULL,
  doi TEXT NOT NULL,
  content_hash TEXT CHECK (
    content_hash IS NULL OR (typeof(content_hash) = 'text' AND length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*')
  ),
  storage_kind TEXT NOT NULL CHECK (storage_kind IN
    ('local_folder', 'opfs', 'personal_cloud', 'gallery_cloud', 'public_oa')),
  device_id TEXT CHECK (device_id IS NULL OR
    (typeof(device_id) = 'text' AND length(device_id) BETWEEN 1 AND 128 AND device_id NOT GLOB '*[^A-Za-z0-9_-]*')),
  provider TEXT CHECK (provider IS NULL OR
    (typeof(provider) = 'text' AND length(provider) BETWEEN 1 AND 128 AND provider NOT GLOB '*[^A-Za-z0-9_-]*')),
  provider_ref TEXT CHECK (provider_ref IS NULL OR
    (typeof(provider_ref) = 'text' AND length(provider_ref) BETWEEN 1 AND 128 AND provider_ref NOT GLOB '*[^A-Za-z0-9_-]*')),
  byte_length INTEGER CHECK (byte_length IS NULL OR
    (typeof(byte_length) = 'integer' AND byte_length BETWEEN 1 AND 9007199254740991)),
  version_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (version_kind IN
    ('publisher', 'accepted_manuscript', 'preprint', 'unknown')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN
    ('pending', 'available', 'missing', 'revoked', 'deleted')),
  acquired_at INTEGER CHECK (acquired_at IS NULL OR
    (typeof(acquired_at) = 'integer' AND acquired_at BETWEEN 0 AND 9007199254740991)),
  last_verified_at INTEGER CHECK (last_verified_at IS NULL OR
    (typeof(last_verified_at) = 'integer' AND last_verified_at BETWEEN 0 AND 9007199254740991)),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer' AND updated_at BETWEEN created_at AND 9007199254740991),
  PRIMARY KEY (user_id, doi, id),
  FOREIGN KEY (user_id, doi) REFERENCES user_documents(user_id, doi) ON DELETE CASCADE,
  CHECK (
    (storage_kind IN ('local_folder', 'opfs') AND device_id IS NOT NULL
      AND provider IS NULL AND provider_ref IS NULL)
    OR
    (storage_kind IN ('personal_cloud', 'gallery_cloud', 'public_oa') AND device_id IS NULL
      AND provider IS NOT NULL AND provider_ref IS NOT NULL)
  ),
  CHECK (state != 'available' OR
    (content_hash IS NOT NULL AND byte_length IS NOT NULL
      AND acquired_at IS NOT NULL AND last_verified_at IS NOT NULL)),
  CHECK (last_verified_at IS NULL OR acquired_at IS NULL OR last_verified_at >= acquired_at)
);
CREATE INDEX IF NOT EXISTS idx_user_document_copies_device
  ON user_document_copies(user_id, device_id, state, doi);
CREATE INDEX IF NOT EXISTS idx_user_document_copies_hash
  ON user_document_copies(user_id, content_hash, doi);

-- A copy keeps its owner, location identity and version. A pending import may
-- fill its hash/size once; replacing bytes or version requires another copy id.
CREATE TRIGGER IF NOT EXISTS trg_user_document_copy_identity
BEFORE UPDATE ON user_document_copies
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.doi IS NOT OLD.doi OR NEW.id IS NOT OLD.id
  OR NEW.storage_kind IS NOT OLD.storage_kind OR NEW.device_id IS NOT OLD.device_id
  OR NEW.provider IS NOT OLD.provider OR NEW.provider_ref IS NOT OLD.provider_ref
  OR NEW.version_kind IS NOT OLD.version_kind OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.content_hash IS NOT NULL AND NEW.content_hash IS NOT OLD.content_hash)
  OR (OLD.byte_length IS NOT NULL AND NEW.byte_length IS NOT OLD.byte_length)
  OR (OLD.state IN ('revoked', 'deleted') AND NEW.state IS NOT OLD.state)
BEGIN
  SELECT RAISE(ABORT, 'pdf_vault_copy_identity_immutable');
END;

-- Reserved cloud/OA copy metadata above does not grant permission to read.
-- P0 capture only targets a selected local device; provider capture is deferred.
CREATE TABLE IF NOT EXISTS pdf_capture_sessions (
  id TEXT NOT NULL CHECK (typeof(id) = 'text' AND length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  user_id TEXT NOT NULL,
  doi TEXT NOT NULL,
  publisher TEXT NOT NULL CHECK (
    typeof(publisher) = 'text' AND length(publisher) BETWEEN 1 AND 128 AND publisher NOT GLOB '*[^a-z0-9_-]*'
  ),
  destination TEXT NOT NULL CHECK (destination IN ('local_folder', 'opfs')),
  device_id TEXT NOT NULL CHECK (
    typeof(device_id) = 'text' AND length(device_id) BETWEEN 1 AND 128 AND device_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  nonce_hash TEXT NOT NULL UNIQUE CHECK (
    typeof(nonce_hash) = 'text' AND length(nonce_hash) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'
  ),
  max_bytes INTEGER NOT NULL CHECK (
    typeof(max_bytes) = 'integer' AND max_bytes BETWEEN 1 AND 9007199254740991
  ),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991),
  expires_at INTEGER NOT NULL CHECK (
    typeof(expires_at) = 'integer' AND expires_at <= 9007199254740991
    AND expires_at - created_at BETWEEN 600000 AND 900000
  ),
  used_at INTEGER CHECK (used_at IS NULL OR
    (typeof(used_at) = 'integer' AND used_at >= created_at AND used_at < expires_at)),
  revoked_at INTEGER CHECK (revoked_at IS NULL OR
    (typeof(revoked_at) = 'integer' AND revoked_at BETWEEN created_at AND 9007199254740991)),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, doi) REFERENCES user_documents(user_id, doi) ON DELETE CASCADE,
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_pdf_capture_sessions_user_doi
  ON pdf_capture_sessions(user_id, doi, expires_at);
CREATE INDEX IF NOT EXISTS idx_pdf_capture_sessions_expiry
  ON pdf_capture_sessions(expires_at);

CREATE TRIGGER IF NOT EXISTS trg_pdf_capture_session_binding
BEFORE UPDATE ON pdf_capture_sessions
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.id IS NOT OLD.id OR NEW.doi IS NOT OLD.doi
  OR NEW.publisher IS NOT OLD.publisher OR NEW.destination IS NOT OLD.destination
  OR NEW.device_id IS NOT OLD.device_id OR NEW.nonce_hash IS NOT OLD.nonce_hash
  OR NEW.max_bytes IS NOT OLD.max_bytes OR NEW.created_at IS NOT OLD.created_at
  OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.used_at IS NOT NULL AND NEW.used_at IS NOT OLD.used_at)
  OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN
  SELECT RAISE(ABORT, 'pdf_vault_capture_binding_immutable');
END;
