# Organic Synthesis Gallery — Daily Scheduled Summary Contract

Status: normative production contract. Updated 2026-10-09 under the user's authorization to resume summaries for papers added on or after 2026-10-01. Prior Sep-20 first-online policy is retired for new work; all older reviewed summaries remain intact.

## 0. Current publication scope — overrides historical all-backlog instructions

Read `audit/summary-publication-policy.json` on current main before every run. Process only currently active Gallery literature DOIs whose **canonical `addedDate >= 2026-10-01` (inclusive)**. `addedDate` is the date Gallery admitted the DOI, not the publisher's first-online `date`, a PDF storage timestamp, or Evidence `capturedAt`. Entries without a valid `addedDate` must be reported as unknown and excluded from new-summary publication until verified; they must not be silently guessed or relabeled.

Preserve already-published summaries for articles added before the cutoff, but do not backfill, regenerate or spend the new-summary review budget on those older articles. The words “entire backlog”, “every Evidence item” and “all pending” below mean the entire **in-scope** set, not pre-cutoff literature.

Within that set, process newest `addedDate` first, then canonical publisher `date` and Evidence `capturedAt`. A matching approved existing summary is reused. Complete, partial and abstract_only captured **text** packets are eligible; coverage controls depth, not publication eligibility. A stored owner-private PDF does not itself establish a readable Evidence Packet or permission to publish its full text. Use verified captured article text; never turn a title-only placeholder or PDF-available flag into a completed summary.

## 1. Publication cadence and authority boundary

Publish derived literature summaries once per day at **12:00 Asia/Shanghai**. An explicit user-triggered catch-up may run immediately. Reuse the existing daily publication task; do not create competing scheduled publishers.

This is a derived-summary operation only. Do not add, remove, reclassify or edit literature cards, authoritative literature datasets, TOC demand, 08:00/18:00 release state, Tampermonkey collection logic, reader data, or paused feedback.

The production Worker does not call a language-model API. Tampermonkey and the Worker capture, normalize, hash, encrypt, store and serve evidence/status data. No Gallery model API key is required.

## 2. Private evidence and complete scoped handoff

Article Evidence Packet v2 stays private in R2. Eligible packets use gzip followed by AES-256-GCM, with the content key wrapped using RSA-OAEP SHA-256. Required keyId: `9c55e2d2ed734de9`; required algorithm: `RSA-OAEP-256+A256GCM+GZIP`. `textProcessingPolicy=no_external_ai` is excluded. Plaintext captured publisher text must never be returned by a public handoff route, committed to Git or included in public logs.

The reviewer holds the matching private key only in its private task context. Never write that key to GitHub, workflow arguments, artifacts, replies or logs. Key rotation is complete only when the deployed public key/keyId, the private review key and the live handoff metadata match. Do not fall back to retired keys or transports.

The public metadata route is `GET /api/article-summary/scheduled-handoff?manifest=1&limit=N`; this returns metadata, not ciphertext. It has a bounded limit and can include out-of-scope old papers. Repeatedly fetching the same first page is not complete enumeration. Filter by the canonical `addedDate` in the current active Gallery registry before decrypting.

The reusable `Prepare current literature summary handoff` workflow (`.github/workflows/summary-evidence-handoff.yml`) provides complete scoped enumeration when the metadata route is capped or slow. Refresh `audit/summary-handoff-request.json` on main with the current timestamp and purpose to trigger it; reuse a valid current run instead of restarting it. The workflow reads the current public registry and authenticated Evidence inventory, applies the policy cutoff, skips hash-matching approved summaries, and uses the existing per-DOI encrypted-part route for the remainder. It uploads `current-summary-encrypted-handoff`, containing a plan, public summary/registry snapshots, Evidence metadata and encrypted envelopes only. It contains no private decryption key and no plaintext captured Evidence. Download it with the GitHub connector, verify the artifact digest, and decrypt only in the private local review environment. Review the plan's missingEvidenceDois separately; do not count them as completed summaries.

Each bounded part uses `GET /api/article-summary/scheduled-handoff?doi=<DOI>&part=<N>&partSize=6000`. Preserve doi, sourceHash, evidencePacketHash, keyId, algorithm, compression, encryptedKey, IV and partCount across all parts. Reassemble every fragment before decryption. GCM AAD is `scheduled-summary-handoff-v1|9c55e2d2ed734de9|<doi>|<evidencePacketHash>`. Verify all decrypted packet identity/hash/coverage fields against current inventory and the envelope. Reject decryption/authentication, malformed or mixed-packet failures per DOI.

## 3. Review and single catch-up publication

At 12:00, or on an explicitly authorized catch-up, read current main policy, contract, summary data, live health and in-scope registry. Require the no-API scheduled runtime to be ready. Only the relevant existing scheduled task performs semantic review; the transport runner does not manufacture scientific summaries.

Review every eligible in-scope packet, newest-`addedDate`-first. A DOI with a usable Abstract or partial text is summarized at that depth. Failed transport, integrity or explicit processing-policy cases remain pending without blocking other valid articles. Reuse existing approved summaries only when both sourceHash and evidencePacketHash still match current Evidence.

Perform two passes per DOI: first assemble the evidence-supported scientific account; then challenge all numbers, conditions, scope, selectivity, mechanism attribution, limitations and bilingual agreement against that article's captured text. Do not claim separate independent reviewers or reviews that did not happen.

Accumulate the completed records and perform **one merged summary-data update and one publication operation for the full eligible current catch-up set**. Do not deploy intermediate 8–12-paper micro-batches. Re-read the latest target blob SHA immediately before writing; preserve all unrelated current records and concurrent changes. A normal run should finish the entire in-scope set; honestly report any genuine incomplete work rather than silently dropping DOI.

Only modify `public/scheduled-article-summaries.json` for summary content, together with directly necessary scoped publication/audit records. Use an atomic latest-SHA merge. Do not replace the full store with only the new delta.

## 4. Evidence constraints and required content

`abstract_only`: explicitly state “基于 Abstract / Abstract-based” in both languages; summarize only the captured abstract/frontmatter. Do not reconstruct missing reaction conditions, substrate scope, yields, selectivity or mechanistic experiments from general knowledge.

`partial`: disclose incomplete captured coverage and describe only the supported material. `complete`: a full Evidence-bounded account is possible, but all claims still need support.

When present in the packet, cover the core transformation and synthetic strategy, key conditions, substrate scope and selectivity, mechanistic experiments, the authors' proposed mechanism, limitations and concrete synthetic significance. Separate experimental observations from author proposals and reviewer inference. Do not publish reviewer-only mechanistic inference as established fact.

Never fabricate missing conditions, yields, selectivities, substrate failures or evidence. Omit unsupported details instead of blocking an otherwise useful narrower summary. The Chinese and English versions must contain the same material scientific facts. No fixed length limit is required, but avoid padding and generic unrelated explanations.

## 5. Published data contract

`public/scheduled-article-summaries.json` retains version 1, schemaVersion `scheduled-reviewed-summary-v1`, publicationMode `daily_1200_asia_shanghai`, a current generatedAt timestamp and DOI-keyed items.

Every approved item contains schemaVersion, doi, status=`approved`, sourceHash, evidencePacketHash, evidenceLevel, zh, en, generatedAt, reviewedAt, promptVersion=`gallery-daily-summary-v1`, auditVersion=`gallery-daily-summary-audit-v1`.

The Worker serves a scheduled summary only when both hashes match the current Evidence Packet. A later capture change can make an old summary ineligible even if its static record remains present. Check live availability after publication; a record count alone does not establish readability.

## 6. Failure and completion reporting

Block individual records for decryption/authentication failure, mixed or mismatching current hashes, explicit no_external_ai, malformed output or material bilingual disagreement that cannot be corrected from the evidence. Incomplete full text or missing individual facts is not itself a publication blocker.

Report separately: in-scope Oct-1+ added article count, valid reused summaries, newly published summaries, captured-but-unpublished items, no-captured-text items, missing-`addedDate` items, and ignored pre-cutoff articles. Count only currently active DOI. Retain the actual failure reasons and no invented completion counts.

## 7. Deployment and public display

Publish to the existing production Gallery and Worker, preserving their established authorization gates. Confirm the summary-data commit, actual successful deployment and live per-DOI endpoint results for the published set: available=true, state=published, source=`scheduled_reviewed_evidence_v2`, matching sourceHash/evidencePacketHash and nonempty bilingual content. A stale static timestamp, configuration string or successful no-op is not successful publication. If all records cannot be checked, state the exact sample coverage.

All public text must remain model-name neutral under PROJECT_RULES.md. Do not expose model names, model snapshots, internal review implementation, waiting-for-model wording or private metadata as reader-facing text. Use neutral ready/processing/next-release copy as applicable.

## 8. Retired paths and audit

Do not restore Evidence-import-triggered model review, minute-level model cron, Gallery model-API-key dependency, or automatic model calls from `/api/admin/article-summary/review-run`. Historical implementation can remain only outside the production execution path.

Before the final user-visible reply, synchronize the complete report under `audit/gpt-responses/` with Beijing time, real commit/run references and the exact outcome. Never include keys, encrypted payload fragments, complete captured publisher text or other credentials in that report.
