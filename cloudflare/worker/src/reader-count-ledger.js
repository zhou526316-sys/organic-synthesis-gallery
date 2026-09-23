/** Persist a genuine article-open event and its materialized total together.
 * D1 batch executes these statements sequentially as one transaction; a failed
 * statement rolls the batch back. Recount only the indexed DOI, never all papers.
 * Repeated IP opens also reconcile an older partially written counter without
 * inventing readers or importing legacy status/pageview records.
 */
export async function recordReaderOpen(db, doi, ipHash, now) {
  if (typeof db?.batch !== 'function') throw new Error('reader_atomic_batch_unavailable');
  const results = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO paper_open_readers_v3 (doi, ip_hash, first_opened_at)
       VALUES (?, ?, ?)`
    ).bind(doi, ipHash, now),
    db.prepare(
      `INSERT INTO paper_open_reader_counts_v3 (doi, count, updated_at)
       SELECT ?, COUNT(*), ? FROM paper_open_readers_v3 WHERE doi = ?
       ON CONFLICT(doi) DO UPDATE SET
         count = excluded.count,
         updated_at = excluded.updated_at`
    ).bind(doi, now, doi),
    db.prepare('SELECT count FROM paper_open_reader_counts_v3 WHERE doi = ?').bind(doi),
  ]);
  if (!Array.isArray(results) || results.length !== 3 || results.some(result => result?.success === false)) {
    throw new Error('reader_atomic_batch_failed');
  }
  const count = results[2]?.results?.[0]?.count;
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('reader_count_invalid');
  return { unique: Number(results[0]?.meta?.changes || 0) > 0, count };
}
