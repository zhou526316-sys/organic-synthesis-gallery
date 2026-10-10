# First live production owner-PDF library audit: aggregate evidence

- Verified Beijing date: 2026-10-10
- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/467 (merged as `5d6514463067a66832e3e5fe382b7a9c4fbdbbb2`)
- Canonical Worker deploy: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38034677492 (success)
- Canonical Pages deploy: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38034677425 (success)
- Main browser isolation CI: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38034543219 (success)
- First automatic workflow: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38034924971 (success)

## Exact observed aggregate (from first real workflow job log)

```json
{"suite":"private-pdf-library-audit-v1","ok":true,"status":"finished","expected":938,"submitted":938,"batches":40,"probed":120,"storagePass":120,"storageFail":0,"error":null}
```

- 938 = current signed/formally published DOI catalogue deduplicated and reconciled. NOT all historical planned journal backfill and NOT number of ready PDFs.
- 120/120 = private R2 head/tail probes PASS. NOT external authorized HTTP Range 206 and NOT user-facing two-page render. The balance of DOI may be ready-but-unprobed, missing, pending, or failed. Their breakdown exists only in the owner-protected API.
- No private DOI rows, R2 paths, signed PDF tickets, bearer tokens or user identifiers were emitted into aggregate workflow logs.

## Security and UI

- First-party `https://gallery.gczhouwld.com/pdf-audit.html` loads publicly as a noindex HTML shell; the per-DOI API `https://api.gczhouwld.com/api/user-ui/private-pdf/audit` returned **HTTP 401** for unauthenticated GET. Only `private_pdf_owner` live session may read results, unlike ordinary `private_pdf_read` capability.
- `https://gallery.gczhouwld.com/pdf-audit-dashboard.js` script exists after deployment.
- Browser CI checked four cases: ordinary reader denied without exposing rows; owner paging/filter labels/Tencent trial link; owner-labelled manual first/second-page attestation; local CSV metadata-only download with no token leakage.
- Future daily schedule is 09:17 Beijing after only 08:00 formal literature publication. Each bounded run submits the entire catalogue and probes up to 120 ready/stale R2 entries. It does not consume Tencent's tightly limited 256 MiB monthly gateway relay budget.

## Unverified remains unverified

- Cannot claim 938 PDFs open, 120 external 206 proof, automatic whole-PDF transfer or all devices/cellular operators success.
- Actual ready/pending/failed/missing counts require the authenticated admin dashboard. Do not bypass account permission or create public reports with private per-DOI rows.
- Site-wide Tencent failover remains `enabled:false`; owner manual canary is separate. 1 MiB Range, PDF quality and continuous scrolling are untouched.
