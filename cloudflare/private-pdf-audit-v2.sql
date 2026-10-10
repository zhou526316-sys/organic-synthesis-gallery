-- Additive v2 owner-private audit snapshot, keyed by catalog generation AND DOI.
-- Legacy private_pdf_audit_rows / private_pdf_audit_members remain only for
-- backwards-compatible migration. New routes use this isolated evidence table.
-- Do not store private PDF bytes, R2 object keys, tickets, or bearer sessions.
CREATE TABLE IF NOT EXISTS private_pdf_audit_entries_v2 (
  catalog_id TEXT NOT NULL REFERENCES private_pdf_audit_generations(catalog_id),
  doi TEXT NOT NULL,
  journal TEXT NOT NULL DEFAULT '',
  added_date TEXT NOT NULL DEFAULT '',
  inventory_status TEXT NOT NULL CHECK(inventory_status IN ('ready','pending','failed','missing')),
  document_id TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  byte_length INTEGER NOT NULL DEFAULT 0,
  identity_verified INTEGER NOT NULL DEFAULT 0 CHECK(identity_verified IN (0,1)),
  pdf_pages INTEGER NOT NULL DEFAULT 0,
  backend_probe TEXT NOT NULL DEFAULT 'untested' CHECK(backend_probe IN ('untested','pass','fail')),
  probe_reason TEXT NOT NULL DEFAULT '',
  probed_at INTEGER NOT NULL DEFAULT 0,
  browser_status TEXT NOT NULL DEFAULT 'untested' CHECK(browser_status IN ('untested','owner_reported_pass')),
  browser_checked_at INTEGER NOT NULL DEFAULT 0,
  inventory_checked_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (catalog_id, doi)
);
CREATE INDEX IF NOT EXISTS idx_pdf_audit_v2_probe
  ON private_pdf_audit_entries_v2(catalog_id,inventory_status,backend_probe,probed_at,added_date);
CREATE INDEX IF NOT EXISTS idx_pdf_audit_v2_doi
  ON private_pdf_audit_entries_v2(doi,catalog_id);
-- Adopt only COMPLETE v1 generations. A partial v1 ingest never becomes
-- a visible completed v2 snapshot. Idempotent when canonical deploy reruns.
INSERT OR IGNORE INTO private_pdf_audit_entries_v2 (
  catalog_id,doi,journal,added_date,inventory_status,document_id,content_hash,
  byte_length,identity_verified,pdf_pages,backend_probe,probe_reason,probed_at,
  browser_status,browser_checked_at,inventory_checked_at
)
SELECT m.catalog_id,r.doi,r.journal,r.added_date,r.inventory_status,
       r.document_id,r.content_hash,r.byte_length,r.identity_verified,r.pdf_pages,
       r.backend_probe,r.probe_reason,r.probed_at,r.browser_status,
       r.browser_checked_at,r.inventory_checked_at
FROM private_pdf_audit_members m
JOIN private_pdf_audit_rows r ON r.doi=m.doi
JOIN private_pdf_audit_generations g ON g.catalog_id=m.catalog_id
WHERE g.completed_at>0;
