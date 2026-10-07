-- Prepared atomic claim for a validated PDF import. This is a reusable SQL
-- contract, not an installed API or an authorization bypass. Before execution,
-- the future service must validate the PDF, authenticate the account, and verify
-- the bound destination/device context (device_id is an identifier, not a secret);
-- publisher/institution access and hosting/share permissions remain separate.
-- Bind positional parameters in this exact order:
-- 1 trusted now_ms, 2 authenticated user_id, 3 session id, 4 normalized DOI,
-- 5 publisher, 6 destination, 7 device_id, 8 SHA-256 of the presented nonce,
-- 9 validated PDF byte_length. Never pass client-supplied now or owner identity.
-- Success is changes = 1. Failure is changes = 0; never retry without this fence.
-- A future import must atomically commit this claim and its metadata. Merely
-- putting an UPDATE and INSERT in a D1 batch is insufficient: a zero-row UPDATE
-- does not abort later statements. Every metadata mutation must depend on this
-- exact successful claim, or run in a transaction that rolls back unless the
-- claim changes exactly one row. P0 does not implement that import endpoint or
-- execute this statement against production.
UPDATE pdf_capture_sessions
SET used_at = ?1
WHERE user_id = ?2 AND id = ?3 AND doi = ?4
  AND publisher = ?5 AND destination = ?6 AND device_id = ?7
  AND nonce_hash = ?8
  AND used_at IS NULL AND revoked_at IS NULL
  AND created_at <= ?1 AND expires_at > ?1
  AND typeof(?1) = 'integer' AND typeof(?9) = 'integer'
  AND ?9 > 0 AND max_bytes >= ?9;
