-- Private PDF v3: owner-readable identity verification evidence.
-- Raw PDF bytes remain in PDF_PRIVATE R2. This table stores only bounded
-- verification summaries; no extracted full text, PDF bytes or R2 keys.

CREATE TABLE IF NOT EXISTS private_pdf_verifications (
  document_id TEXT PRIMARY KEY REFERENCES private_pdf_documents(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL CHECK (length(content_hash)=64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN ('verified','failed')),
  processor_revision TEXT NOT NULL CHECK (length(processor_revision) BETWEEN 1 AND 128),
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 0 AND 100000),
  text_chars INTEGER NOT NULL CHECK (text_chars BETWEEN 0 AND 1000000),
  doi_match INTEGER NOT NULL CHECK (doi_match IN (0,1)),
  title_score_milli INTEGER NOT NULL CHECK (title_score_milli BETWEEN 0 AND 1000),
  metadata_title_score_milli INTEGER NOT NULL CHECK (metadata_title_score_milli BETWEEN 0 AND 1000),
  author_matches INTEGER NOT NULL CHECK (author_matches BETWEEN 0 AND 100),
  supplement_marker INTEGER NOT NULL CHECK (supplement_marker IN (0,1)),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 160),
  checked_at INTEGER NOT NULL CHECK (checked_at >= 0)
);
CREATE INDEX IF NOT EXISTS idx_private_pdf_verifications_status
  ON private_pdf_verifications(status, checked_at DESC);

-- Readable Identity v2 narrows SI detection and adds publisher-source evidence.
-- Retry only rows rejected by v1; a v2 failure will not be reset on later deploys.
UPDATE private_pdf_documents
SET processing_state = 'raw'
WHERE active = 0
  AND processing_state = 'failed'
  AND id IN (
    SELECT document_id FROM private_pdf_verifications
    WHERE processor_revision = 'private-pdf-readable-v1'
  );
