# PDF full-library owner audit — continuation code review and next acceptance gates

- Review time: 2026-10-10 16:21 Asia/Shanghai.
- Repository: `zhou526316-sys/organic-synthesis-gallery`, canonical `main`.
- Inspected main HEAD at review: `1ea4e0da42f820aa669cec0ec486dea3d58d0627` (other project work may advance `main`).
- Existing implementation: [PR #467](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/467), merged at `5d6514463067a66832e3e5fe382b7a9c4fbdbbb2`.
- Production run checked: [#38034924971](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38034924971), job `114163263981`, result `success`.

## Verified production evidence (not inferred)

The first real job log includes exactly:
```json
{"suite":"private-pdf-library-audit-v1","ok":true,"status":"finished","expected":938,"submitted":938,"batches":40,"probed":120,"storagePass":120,"storageFail":0,"error":null}
```

All 938 officially published DOI records were reconciled. A subset of 120 active R2 PDF objects passed internal header/trailer range reads. This is not a claim that the remaining 818 PDFs failed, that 938 files are READY, or that any files have been rendered end-to-end in the end-user browser. Per-DOI and status-bucket totals are private to the owner dashboard.

The code keeps these evidence classes distinct: active document READY, document identity verification, R2 prefix/trailer `pass/fail/untested`, owner-attested first two browser pages. External authenticated HTTP 206, real China campus/home/cellular availability, and full-library PDF.js rendering have not been established by this run.

## Read-only findings (risks in source, not observed production incidents)

### P1 — Source commit displayed by the dashboard can become stale on same DOI catalog

- `scripts/audit-private-pdf-library.mjs` builds `catalogId` from sorted DOI strings only, while passing a fresh `sourceCommit` to `begin`.
- `cloudflare/worker/src/private-pdf-audit.js` `beginPrivatePdfAudit` inserts a source commit only if the catalog ID is new. Existing catalog IDs are reused without updating the stored commit (roughly lines 41–56). `finishPrivatePdfAudit` only updates `completed_at` (roughly lines 138–157).
- Therefore a new successful alignment with the *same* DOI set can show a fresh completion time but the original `sourceCommit` on the owner dashboard. This is a provenance mismatch, not evidence that the 938-row membership failed.
- Suggested correction for specific approval: carry a validated pending/current run commit and update the completed source commit only as `finish` succeeds; cover the no-DOI-change case in regression tests. Do not prematurely mark an unfinished generation complete.

### P1/P2 — Successful Worker deployment retriggers an audit, not solely the first one

- `.github/workflows/private-pdf-library-audit.yml` has a daily cron **and** `workflow_run` on `Deploy Worker frontend assets` completion. The job-level guard permits every successful `main` deployment, without a one-time bootstrap condition (roughly lines 1–21).
- Consequently an unrelated successful Worker deploy can cause an additional 40-batch reconciliation plus up to 120 probes. Concurrency serializes runs; it does not suppress those extra events. Actual number of such additional runs has not been measured here.
- Suggested correction for specific approval: keep the 09:17 daily schedule; make deployment bootstrap genuinely once-only or gate it by durable schema/bootstrap state, without creating any alternative literature release job.

### P2 — In-place R2 recovery may not be reflected for up to 30 days

- `probePrivatePdfAudit` selects active READY PDFs only when `backend_probe='untested'` or `probed_at` is older than 30 days (roughly lines 188–209). A prior `fail` with unchanged document identity is not retried sooner.
- If a transient R2 read failure recovers without changing document ID/hash/length, the old failure can remain visible for almost 30 days. New/replaced documents reset to `untested` during reconciliation, so this is not all repair cases.
- Suggested correction for specific approval: introduce bounded, rate-limited earlier failure rechecks with distinct transient vs persistent failure reason and fairness to never-tested entries. Avoid repeated immediate retry storms.

### P2 — Incomplete new catalog can mutate per-DOI rows shared with the last completed catalog

- Generation membership uses `private_pdf_audit_members`, while `private_pdf_audit_rows` is keyed globally by DOI (`cloudflare/private-pdf-audit-v1.sql`).
- Ingesting a *new* catalog generation updates shared rows in place before `finish` marks the new generation complete. If a later ingest batch fails, the previous completed generation is still selected for read, but its overlapping row metadata may have been refreshed by the incomplete attempt.
- Suggested correction for specific approval: version per-DOI row evidence by generation, or use a staging/atomic-promote design. Evaluate D1 footprint and migration safety before changing the schema. This is a consistency risk, not a proved observed mismatch.

## Acceptance and operational boundaries

1. Do **not** modify the 08:00-only literature schedule, ordinary PDF permissions, 1 MiB Range chunks, PDF quality, continuous vertical scroll, or captured PDF files.
2. Keep the Tencent China ingress manual trial and its ~256 MiB/month gateway cap; its site-wide automatic failover stays disabled until independently accepted.
3. Keep `private_pdf_owner` as the sole permission to see per-DOI results. No public per-DOI CSV, user credentials, signed URLs, R2 object keys or raw PDF bytes in logs or artifacts.
4. Continue daily bounded private R2 audit at 09:17 Beijing. Do not treat queued/unverified documents as failures.
5. Prove browser/network behavior separately: authenticated external HTTP 206, first and second pages, uninterrupted vertical scroll, ordinary-reader vs unauthorized rejection, and real campus/home/cellular conditions. No requirement for a human to manually open hundreds of documents; targeted representative samples only.
6. Pending repair proposals are **not approved code changes**. This review performed no production data writes or source repairs. Maintain the project's explicit feedback approval gate.

## Read-only sources

- `.github/workflows/private-pdf-library-audit.yml`
- `scripts/audit-private-pdf-library.mjs`
- `cloudflare/worker/src/private-pdf-audit.js`
- `cloudflare/private-pdf-audit-v1.sql`
- `public/pdf-audit-dashboard.js`
- `PROJECT_RULES.md`
- The actual first job log and `audit/pdf/2026-10-10-first-live-library-audit-aggregate.md`.
