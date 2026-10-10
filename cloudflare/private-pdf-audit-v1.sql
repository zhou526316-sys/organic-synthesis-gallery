-- Per-DOI owner-only PDF readability evidence (no PDF bytes, tickets or R2 keys).
-- Separate immutable catalog membership from the changing most-recent audit row.
CREATE TABLE IF NOT EXISTS private_pdf_audit_generations (
  catalog_id TEXT PRIMARY KEY CHECK(length(catalog_id)=64),
  source_commit TEXT NOT NULL CHECK(length(source_commit)=40),
  expected_count INTEGER NOT NULL CHECK(expected_count BETWEEN 1 AND 200000),
  created_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS private_pdf_audit_rows (
  doi TEXT PRIMARY KEY,
  journal TEXT NOT NULL DEFAULT '',
  added_date TEXT NOT NULL DEFAULT '',
  inventory_status TEXT NOT NULL CHECK(inventory_status IN ('ready','pending','failed','missing')),
  document_id TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  byte_length INTEGER NOT NULL DEFAULT 0,
  identity_verified INTEGER NOT NULL DEFAULT 0 CHECK(identity_verified IN (0,1)),
  pdf_pages INTEGER NOT NULL DEFAULT 0,
  backend_probe TEXT NOT NULL DEFAULT 'untested'
    CHECK(backend_probe IN ('untested','pass','fail')),
  probe_reason TEXT NOT NULL DEFAULT '',
  probed_at INTEGER NOT NULL DEFAULT 0,
  browser_status TEXT NOT NULL DEFAULT 'untested'
    CHECK(browser_status IN ('untested','owner_reported_pass')),
  browser_checked_at INTEGER NOT NULL DEFAULT 0,
  inventory_checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS private_pdf_audit_members (
  catalog_id TEXT NOT NULL REFERENCES private_pdf_audit_generations(catalog_id),
  doi TEXT NOT NULL REFERENCES private_pdf_audit_rows(doi),
  PRIMARY KEY (catalog_id, doi)
);
CREATE INDEX IF NOT EXISTS idx_pdf_audit_members_doi
  ON private_pdf_audit_members(doi,catalog_id);
CREATE INDEX IF NOT EXISTS idx_pdf_audit_rows_probe
  ON private_pdf_audit_rows(inventory_status,backend_probe,probed_at,added_date);
