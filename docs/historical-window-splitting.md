# Historical source-window splitting — pending post-first-run rollout

This is a proposed improvement for the 23:00 Beijing staging-only historical DOI collector.
Its runtime code is held in a draft pull request until the initial unmodified nightly
collector has produced a verifiable source-health/batch/checkpoint receipt.

## Rules

- On an explicit Crossref/OpenAlex **result truncation** (fixed 10-page ceiling)
  with no other errors, bisect the inclusive date range. Persist leaf windows
  under `state.activeSplit`. Never advance the root cursor until every leaf
  has successful source enumeration. For a one-day truncated range, fail closed.
- HTTP 401/403/429, transport failures, changed reported totals, malformed
  cursors and invalid JSON **never** cause a false 'complete' status or empty-paper
  conclusion; they block that unit for a later retry.
- Intermediate leaf files use `recordType=historical_discovery_segment_evidence`.
  They are not formal admission records. Once all leaves complete, the root batch
  is reconstructed with de-duplicated DOI rows and audited segment references.
- Keep 23:00 candidate-only writes confined to the independent historical staging
  branch. Protect all regular 08:00 publication inputs, existing TOCs, figures
  and PDFs. The 23:40 independent audit must read the completed **root batch**,
  not sum its intermediary leaf files a second time.
- The scheduled default remains MAX_UNITS=8 and API_REQUEST_LIMIT=80 in the
  first production baseline. Raising nightly throughput requires real Crossref
  and OpenAlex latency/rate-limit evidence, a bounded budget, and a subsequent
  explicit rollout; increasing test-only caps is not deployment.
- Staged `abstract.available` is a provenance flag, not a searchable abstract.
  Legally displayable abstract enrichment, scope review, DOI admission and
  D1 search remain separate work in Issue #498.

## Acceptance

Run `node --test scripts/test-historical-nightly-discovery.mjs` (mocked,
no publisher calls). On first real deployment, require logged source status,
exact cursor checkpoint, counts per DOI, split evidence, and unchanged protected
literature/media SHAs before increasing throughput.

Tracking: https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498
