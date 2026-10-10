# Organic Synthesis Gallery — owner-only full DOI PDF audit

## Scope and truthful evidence levels

The administrator asked for verifiable *library-wide* PDF readiness, not a promise that a few manually opened Tencent PDFs imply universal success. The canonical denominator is the deduplicated and policy-filtered union of `DATA_FILES` from `scripts/pages-release-delivery.mjs`. The signed `audit/publication-release-state.json` must match this exact DOI count before a generation is accepted. Removed/excluded DOI do not silently count toward coverage.

Four levels must never be conflated:

1. `inventory_status=ready`: selected active/ready D1 private PDF entry, distinct from missing/pending/failed.
2. `identity_verified=1`: a matching 64-char content hash, positive `private_pdf_verifications.page_count`, status verified and valid declared byte length. This proves previously accepted R2-backed PDF identity, not current transport.
3. `backend_probe=pass`: a bounded direct **private R2** HEAD and two byte-range GET operations produced expected size, metadata hash (when present), first `%PDF-` bytes and EOF marker near the last 1024 bytes. It does **not** mean public HTTP 206 or external cell-carrier reachability.
4. `browser_status=owner_reported_pass`: a live authenticated `private_pdf_owner` explicitly attested viewing at least the first two pages in the browser. Clearly label it an owner report, not independent continuous monitoring. An automated public PDF HTTP 206/full-render success remains a separate live-network acceptance requirement.

Rows not tested must remain `untested`; no assumptions of success based on 16 bytes or success for another DOI.

## Access control

The public HTML shell `/pdf-audit.html` contains no private results. The live paginated GET `/api/user-ui/private-pdf/audit` requires a current `private_pdf_owner` bearer-session capability; other active PDF readers receive 403, anonymous sessions 401. The optional user-attested POST also requires owner entitlement.

All maintenance POST routes under `/api/admin/private-pdf/audit/{begin,ingest,finish,probe}` require the existing environment-protected `BRIDGE_WRITE_TOKEN` in the Worker routing layer. Only CI receives this secret. No report contains R2 storage keys, content hashes, private PDF data, signed file URLs, user IDs, phone/email, sessions or authorization headers.

## Daily lifecycle

- Scheduler: 09:17 Asia/Shanghai / 01:17 UTC after the sole 08:00 fixed literature release, independently of publisher capture and literature writer. A successful canonical Worker deployment triggers an initial run once schema/routes are online; the workflow never triggers an 18:00 literature release.
- GitHub checkout uses current `main` and exact publication marker. The runner refuses a DOI-set/production-count mismatch rather than publishing partial catalog coverage.
- `begin -> ingest <=24 DOI/batch -> finish`: snapshot generation becomes complete only when all expected DOI memberships are present; a failed batch leaves previous completed snapshot usable.
- Each run limits to 120 R2 head/tail probes, six per Worker request, prioritizing untested and 2026-10-01+ documents. Older ready PDFs are processed progressively; stale results may be revisited after 30 days. Backend probes never use the Tencent HTTPS relay and do not consume its strict 256MiB/month reserve; they do consume bounded R2/D1 operations under existing provider quotas.
- Broken or unavailable R2 objects are recorded as `fail` and stay visible. A new PDF version/hash/size invalidates previous probe and manual read evidence. Failures never downgrade existing legitimate `private_pdf_documents` status or affect user reading permissions.
- GitHub Actions logs/artifacts contain only aggregate counts, never DOI-by-DOI private inventory or credentials. Per-DOI results are stored in the private D1 and served to owner only.

## Administrator workflow

1. Log into `https://gallery.gczhouwld.com` as `private_pdf_owner` in the same browser. Open `https://gallery.gczhouwld.com/pdf-audit.html`.
2. See the complete catalog denominator, ready/pending/failed/missing, R2 backend probe pass/fail, and separately labeled owner browser two-page confirmations. Search DOI or journal, filter failure/untested, paginate, export current filter to a local CSV.
3. For a ready DOI choose `腾讯试读` (opens the existing first-party `?pdfIngress=tencent` path). **Only after actually displaying page 1, page 2 and continuous vertical scrolling**, return to the owner report and click `记录两页实测`. This writes an explicitly owner-attested receipt; it does not grant access to another account or bypass rights.
4. Independently test a few real PDFs in Edge and Android cellular on separately entitled accounts, using `/open` and large-Range/public HTTP 206 diagnostics, and confirm that a non-entitled user receives 401/403. These remain manual network acceptance gates distinct from R2 probes.

## Operational boundaries

PDF bytes, 1MiB Range size, rendering quality, existing continuous-scroll PDF.js, Tencent relay quota, capture/Tampermonkey, the WeChat relay and formal 08:00-only literature additions remain unchanged. There is no new paid server or guaranteed offline Cloudflare access. A full-library success rate cannot be declared until the corresponding tests on those individual entries are actually complete.

### Deployed-state verification

Confirm the canonical Worker deployment applied `cloudflare/private-pdf-audit-v1.sql` and served protected audit routes. Confirm the GitHub Pages deployment actually includes `/pdf-audit.html` and `/pdf-audit-dashboard.js`; an anonymous report request must not expose any DOI inventory. Confirm the first all-DOI action finishes before quoting counts, as prior sample successes give no valid library-wide numerator.
