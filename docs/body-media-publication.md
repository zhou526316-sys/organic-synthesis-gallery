# Body-image capture markers and incremental publication

This is a media-only process for the current Gallery corpus. It does not change the 08:00/18:00 literature release slots, source literature files, scope decisions or titles. Keep main as the baseline and all existing literature_authorization checks. The fixed media generation remains 1790082000000. Do not re-enable direct publisher import/repair, delete staging objects, rewrite capture dates or use the pre-incident media wholesale.

## Storage marks are not publication approval

The Worker adds `sha256` and `reviewMarker` to new confirmed staged body records and their receipts. It computes them from the accepted image bytes and sanitized stored metadata, not a client `approved` flag. No extra R2 write is required: the mark is part of the existing conditional stage-index write. A retained object is rehashed and receives a truthful derived receipt without updating its old timestamp or rewriting the index merely to add a mark.

`assetKey = DOI | figure ID | full SHA256` identifies exact bytes. `evidenceSha256` also binds the role, label, caption, article URL, source URL, page DOI, capture protocol, generation, content type, dimensions, byte length and order. A new job or timestamp alone does not invalidate the same evidence; changed bytes, source or caption does. The canonical implementation is `shared/body-media-evidence.js`.

Storage-side states:
- `pending_review`: the structural evidence fields are present and internally consistent. Semantic/visual review is still required.
- `needs_evidence`: e.g. opaque source URL or incomplete caption/dimensions. Preserve the object and identify missing evidence; do not blindly recapture or delete it.
- A failed upload has no positive confirmed-staging receipt. Continue using the detailed client diagnostic report to distinguish acquisition, transport, object-write and index-write failures. Absence of a JSON Worker error code does not prove a particular backend cause.

`semanticReview=not_reviewed` and `published=false` remain in storage markers. Publication is a separate authority. No marker, script success count or matching DOI alone permits an image to go live. An explicit future failure/held decision belongs in the audit log, not a forged stored-image success.

## Reusable approvals; no new merge code for every batch

Use `audit/media-recovery/body-batches/<unique-batch-id>.json` for immutable approved subsets, with preserved image bytes at `audit/media-recovery/body-batches/assets/<full-sha256>.<svg|png|webp>`.

Each envelope contains `schemaVersion:1`, a unique `batchId`, `mediaGeneration:1790082000000`, `approvedCount` matching the array, and `items`. Each batch is at most five papers and thirty images. An item has the same verified file/source/job/role fields as the first approved `body-batch1/manifest.json`, plus:

```
review: {
  decision: "approved",
  reviewedAt: "actual ISO timestamp",
  evidenceSha256: "SHA256 of canonicalBodyEvidence(item, item.sha256)",
  note: "Article- and figure-specific evidence actually inspected."
}
```

The `approved` flag must also be true. `verifyApprovedBodyItem()` rechecks exact source/DOI/label, actual byte hash, image safety, content-addressed R2 identity and the approval's evidence fingerprint. A changed caption or source cannot inherit a byte-only approval. The build intersects the current corpus; removed DOI cannot return from an old image approval. Existing usable images and all TOCs are preserved; a different same-ID image is held rather than overwritten. Replacement/upscaling is a separate review.

The existing Pages merge calls `mergeApprovedBodyBatches()` after the first body recovery. Future approved batches are data-only changes; include a unique media-only `PAGES_REFRESH` nonce in the reviewed PR when necessary because the current Pages trigger does not watch arbitrary audit paths. Do not assume a bot push starts another Actions run. Check the actual run. Before merge, reread main and affected SHAs, preserve parallel changes, and leave all PR/production authorization gates enabled.

No new approved body images are bundled with the initial marker-infrastructure release. The first thirty new figures and two preserved Figure 1 images remain the previously accepted body batch, not new additions attributable to markers.

## Public ledger and truthful status

Every media build emits `public/body-publication-ledger.json`, containing exact approved image keys, evidence fingerprints and public URLs included in that build. Only matching files actually present in the final media index enter the ledger; their bytes are rehashed. Read the ledger from the deployed GitHub Pages origin together with its matching media-index, not from a feature branch, to establish a public state.

The ledger covers exact individually approved records. It is not a count of all historical Figure 1 fallbacks or all staged files. A different higher-resolution or older retained file may remain displayed and not match a newly staged candidate's assetKey. Do not subtract ledger count from stage count to invent an unpublished total. An image can remain in staging after an approved static copy is published.

Stages for maintenance are `stored/pending_review`, `needs_evidence`, `approved_waiting_deploy`, `published_verified`, and `held`. Promote the last state only after deployment and live URL/hash/label checks plus real-card visibility/image decoding. A first deployment artifact saying published is not itself a completed browser acceptance.

Bridge 2.2.23 remains compatible and does not need reinstalling for server marks. Its existing progress panel still describes staging and does not yet consume this publication ledger per image. Do not claim a new client UI or a new userscript version. The ledger makes review deduplication and publication accounting available to the maintenance task now.

## Ongoing bounded maintenance

The user authorized continuing body publication on 2026-09-23. A separate hourly ChatGPT task checks for changes and reviews at most five papers/thirty images, prioritizing recent papers and JACS among otherwise equal candidates, then waiting backlog. It is not a replacement literature task and is not a claim that the assistant watches the desktop or repairs code continuously.

Read actual stage inventory, current public ledger/index, per-DOI immutable capture reports and previous review decisions. The public staged route is `/api/article-figures/staged` on the existing Worker; do not call POST import/promotion or reset as a read. Existing GitHub authenticated evidence workflows are the fallback when public reads fail. Reuse snapshots only when coverage and generation are clear, never infer missing rows from a truncated response. Prefer exact stored bytes, not new publisher downloads. For opaque sources, require the original task/page/candidate/upload-object provenance chain.

Review individual figure content, owning caption, source role and consistency with the paper, including cross-DOI/related-content risks. Preserve useful images even when another figure or TOC is missing. Numeric ACS asset suffixes do not necessarily equal Figure/Scheme numbers. Preserve SVG; identify mixed raster/vector and actual pixel dimensions honestly. Do not claim full article coverage merely from collector counts.

Publish approved copies through the existing pipeline; leave ambiguous records pending with reasons. Every actual publication is followed by online hash checks and a bounded browser check. The current frontend may render only the first ten figures in a strip; a larger stored count is not proof every image is shown. Do not change unrelated UI code in this maintenance task. No meaningful change means no user notification. Record successful changes and new major failures in audit/media-acceptance and synchronize the complete user reply to audit/gpt-responses.
