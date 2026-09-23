# Body media continuation audit — reviewed ownership handoff + contamination hold

Beijing time: 2026-09-24 03:48
Context: Gallery 正文图核验上架 / media-only continuation
Baseline at diagnosis: `main` `4ad1ffb9b461f2527afe50bd42c768421e99dd23`

## Publication state

- Existing reviewed batch `body5-20260924-0011-01`: 18 images remain `approved_waiting_deploy`.
- Existing held item: 1 (`10.1021/acs.orglett.6c03248`, Scheme 2).
- Newly published in this continuation: 0.
- No literature card/title/scope/production-literature mutation was made.
- Quarantine generation remains `1790082000000`.

## Repeated deployment blocker — exact root cause

The repeated `auto_prior_publication_changed` failure occurs after `merge-approved-body-batches.mjs` successfully reconstructs an individually reviewed image under the reviewed batch publication identity. The subsequent `merge-new-body-auto.mjs` still requires every historical auto snapshot item with the same DOI+figure id to remain owned by `new-body-auto-20260923-v1`, even when the reviewed copy has the exact same full SHA256, evidence SHA256 and label.

Confirmed exact-match examples in `body5-20260924-0011-01`:

- `10.1021/acs.joc.6c01653 | scheme-3`
  - SHA256 `3fa74b037305f196ab1c7d5002ea17226a6f73c214b87f16d1f0dfcf3781ebac`
  - evidence `279c770d43cc3644c968550cb405843dbcccfdd2c091913622ecafc5d53c1f57`
- `10.1021/acs.joc.6c01653 | scheme-6`
  - SHA256 `6fd7efaf61f3faa6ee5828d49d1e692de887b5484d91c89ea211d7a2f2c920d0`
  - evidence `0b40a14326fb58e1fb454ddc1c48472aa87fdaf499ce347e3c73634f9f8d6d53`

The approved batch builder reported `approvedItems:225`, `retainedDifferentFile:[]`, `notInCurrentCorpus:[]`, `quarantineUnchanged:true`, `stagingWrites:0`, `stagingDeletes:0`. The Worker `/api/media/batch` HTTP 500 remains in a nonfatal mirror-read step and is not the deployment blocker.

## Narrow controller fix prepared

PR #192, head `0730b94190008ee029daa1d8aaa43efc960ae1fc`, changes only `cloudflare/scripts/merge-new-body-auto.mjs` (9 additions / 5 deletions relative to the diagnosed baseline).

The proposed handoff is fail-closed. A historical auto identity can retire from the next auto snapshot only when the current non-auto published ledger entry and current media entry agree exactly on DOI, figure id, full SHA256, evidence SHA256, label and current image URL. Any mismatch continues to throw `auto_prior_publication_changed`. Exact handoffs are recorded as `supersededByReviewed`; reviewed media are not overwritten.

Existing `Adaptive paired media batching regression` run `35911224067` passed, including code checks, frozen real-image fixture extraction, actual-byte validation and prior-publication regressions.

PR #192 is **not merged** because the repository-wide Site quality gate has a pre-existing main-branch TypeScript failure unrelated to this media change: `src/card-share.ts(52,10): TS6133 'galleryDeepLink' is declared but its value is never read.` The same unused function is present on current main. This media-only task did not modify that frontend file or bypass the gate.

## New contamination hold from read-only inventory

Read-only media salvage inventory run `35901598663`, job `107318912849`, artifact `10769541329`, archive SHA256 `9b04da9af6ec76b23709b05badbada0cbc6162d8c25bb4e7cab74315c6314295` identified three latest capture reports whose requested/stored DOI disagrees with the report article/source DOI while the report says `success`:

1. requested/stored `10.1038/s41586-026-11043-z` but report article/source identity points to `10.1021/acscatal.6c06157`;
2. requested/stored `10.1038/s41467-026-77437-9` but report article/source identity points to `10.1021/jacs.6c14433`;
3. requested/stored `10.1002/anie.4947785` but report article/source identity points to `10.1002/anie.4084841`.

These three DOI subsets are held from approval/promotion. No publisher re-download, server-side direct import/repair, global cleanup, VPN/R2/quota inference, or userscript change was performed. This is classified specifically as report-chain DOI/page/source identity contamination. The inventory had `byteLevelVerified:false` because its D1 table reads included HTTP 400 responses; therefore it is evidence for the identity mismatch/hold, not a byte-level restoration authorization.

## Next safe action

Do not merge PR #192 until the existing repository-wide quality gate is green on the PR and main has been re-read for parallel changes. Once that gate is green, the narrow controller PR may be merged, the existing Pages build must pass `literature_authorization`, and `body5-20260924-0011-01` remains `approved_waiting_deploy` until post-deploy online hash/figure/card/decode/TOC verification succeeds. The three contaminated DOI subsets remain held pending clean independent evidence; no automatic recapture or full-library cleanup is authorized by this audit.
