# Approved Oct-16 throughput continuation — image & PDF transport / publisher initialization

## Real owner baseline
At 2026-10-16 11:32 Beijing, user-uploaded Bridge 2.2.89 / engine 6.2.70 log:
- Queue 226, visited 7 distinct DOI in an IN-PROGRESS run, 7 attempts, 3 partial, 4 failed, 1 controller-resolved (not 4-layer completion), 225 still unresolved.
- After 3 ACS DOI heartbeat misses the controller continued on Wiley; isolated circuit breaker is working.
- JACS figure stage only 2/8 and 1/7 in individual visits. Angew Figure 4 & 5 each stalled ~24–25 s in GM figure-stage upload.
- Three PDF downloads were deferred locally, no cloud PDF terminal receipt at that time. Additional DOI `private_pdf_upload_deadline` was observed.
- Existing body-stage index valid, 6.19 MB / 3908 rows, no inventory read errors. No evidence that longer all-purpose timeouts would improve overall throughput.

## 6.2.71 / 2.2.90 approved-scope repairs
1. `document-end` userscript injection (previously `document-idle`) for the standalone scraper and the bundled Bridge. Enables publisher script to start after document DOM is assembled instead of waiting for idle network; DOI binding, page checks and owner PDF security remain unchanged. Whether this resolves all ACS injection misses still needs an actual owner browser trace.
2. Remove `ACTIVE_JOB_KEY` gate from the Gallery-owned verified image outbox sender, previously causing complete starvation while another publisher task was active. Drain one item per sender call, using existing idempotent DOI/label/byte receipt and ownership lock.
3. On a real stage transport timeout, activate a per-DOI adaptive figure spool for later figures: persist original bytes in Tampermonkey storage and require exact readback. Skip repeated publisher download for labels already queued. These results are explicitly `deferred`, not `staged` or counted in `figuresStaged`. Preserve bounded storage and existing direct transfer fallback.
4. If the owner's PDF local transfer queue is already saturated (8 items or >=20 MiB of encoded local bytes), skip another publisher PDF download rather than filling memory and waiting on a 90-second upload failure. Preserve `deferred_capacity` PDF as unresolved; unchanged valid owner lease, SHA, DOI and HTTP 401/403/429 safeguards.
5. Upgrade release checks to 2.2.90 / embedded 6.2.71, keeping 6.2.20 capture protocol and 2.2.41 controller contract.

## Required acceptance
- CI must pass all existing owner PDF tests, publisher DOI binding/isolation, stage receipt tests and new image outbox background replay/role, storage readback and PDF backpressure fixtures. Build version/metadata must pass.
- Both canonical public install URLs must return the exact `@version 2.2.90` and `INSTALL_REVISION 6.2.71` from real served bytes.
- An authenticated owner machine must actually run a long multi-publisher missing-only pass. Compare queue total, unique visits, 4-layer receipts, body figure completeness, end-of-run stopReason, per-publisher injection start, pending local outboxes, and cloud PDF confirmation. Do not equate local deferred assets to cloud stored.
- Never schedule a separate figure-only publisher visit to bypass the October-1 bundling policy; preserve July–Sept historical TOC-only and unique daily 08:00 literature release.
- CI / deployed installers alone cannot attest a 101-DOI throughput recovery; no claims of this until a final browser log is uploaded and inspected.

Status: implementation in branch, not yet proven by production owner browser. No publisher downloading or production media changes were part of this repair submission.
