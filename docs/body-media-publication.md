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

Each immutable envelope contains `schemaVersion:1`, a unique `batchId`, `mediaGeneration:1790082000000`, `approvedCount` matching the array, and `items`. For audit safety an individual envelope remains capped at five papers/thirty images, but one user-visible publication packet may contain multiple envelopes. The current publication target is at least twenty articles per outward release when enough eligible media exists. An item has the same verified file/source/job/role fields as the first approved `body-batch1/manifest.json`, plus:

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

Bridge 2.2.24 remains compatible with the same capture protocol 6.2.20 and server marks. Its progress panel distinguishes immediate staging from later static publication; the public ledger remains the authority for whether a specific image is actually live. Updating the Bridge does not authorize media by itself. The ledger makes review deduplication and publication accounting available to the maintenance task.

## Ongoing bounded maintenance

The user authorized continuing body publication on 2026-09-23 and later requested large outward media releases when enough backlog exists. Twenty papers is the preferred target, not a permanent hard minimum. Human-reviewed packets should normally accumulate about twenty current-corpus papers before a release when sufficient backlog exists; when fewer eligible papers remain, do not hold them indefinitely. The immutable approval files may still be split internally into five-paper/thirty-image envelopes. Prioritize recent papers and JACS among otherwise equal candidates, then waiting backlog. This media maintenance is not a replacement literature task and is not a claim that the assistant watches the desktop or repairs code continuously.

Read actual stage inventory, current public ledger/index, per-DOI immutable capture reports and previous review decisions. The public staged route is `/api/article-figures/staged` on the existing Worker; do not call POST import/promotion or reset as a read. Existing GitHub authenticated evidence workflows are the fallback when public reads fail. Reuse snapshots only when coverage and generation are clear, never infer missing rows from a truncated response. Prefer exact stored bytes, not new publisher downloads. For opaque sources, require the original task/page/candidate/upload-object provenance chain.

Review individual figure content, owning caption, source role and consistency with the paper, including cross-DOI/related-content risks. Preserve useful images even when another figure or TOC is missing. Numeric ACS asset suffixes do not necessarily equal Figure/Scheme numbers. Preserve SVG; identify mixed raster/vector and actual pixel dimensions honestly. Do not claim full article coverage merely from collector counts.

Publish approved copies through the existing pipeline; leave ambiguous records pending with reasons. Every actual publication is followed by online hash checks and a bounded browser check. The current frontend may render only the first ten figures in a strip; a larger stored count is not proof every image is shown. Do not change unrelated UI code in this maintenance task. No meaningful change means no user notification. Record successful changes and new major failures in audit/media-acceptance and synchronize the complete user reply to audit/gpt-responses.


## New marked ACS fast path — 2026-09-23 amendment

The user requested that newly captured images not wait for historical-image forensics. This media-only amendment adds a SEPARATE automated-provenance publication authority for eligible NEW ACS body images. It does not change or fake any explicit human `review.decision` used by the existing reviewed-batch builder.

The storage marker still says `pending_review` and is not sufficient by itself. The new build step independently verifies current generation, task/page/source DOI binding, exact canonical server marker, permitted full-article/CDN body-asset paths, individual Figure/Scheme label and caption, object-address identity, actual stored SHA256/size/type, duplicate identities/hashes and isolated browser image decoding. Only current-corpus ACS records passing every check may be added. TOC/Visual Abstract roles, old or unmarked captures, opaque URLs, held scope rechecks and same-ID replacements remain outside this fast path. Invalid individual records are held separately, but a new automatic outward release is not committed unless at least twenty distinct articles still pass all publication checks.

Automatic entries are labelled `automated_provenance_bytes_and_decode` and `individualSemanticReview:false`. This is not a claim of per-image semantic/visual review, maximum publisher resolution or complete article inventory. The original individually reviewed ledger remains truthful. New auto-publication records are separate from storage and are appended to the deployed ledger only after actual file validation. No image bytes are modified, upscaled, deleted, or fetched anew from a publisher.

A lightweight repository schedule checks every five minutes. It prefers a 20–25 article release when enough distinct unseen paired TOC+body records are ready. If fewer than twenty remain, the system waits while new captures are still arriving; once the newest eligible record has been quiet for 15 minutes, the smaller validated tail may be released instead of waiting forever. One build considers at most twenty-five new articles and at most 250 new body images; the current ten-thumbnail per-card limit remains enforced. Before any new body image is written into the static output, the same build must already contain a non-fallback official TOC for that DOI. The preflight check accepts either an already-public official TOC or a strongly DOI-bound current ACS official capture that will be merged earlier in that same Pages build. Because `merge-local-captures.mjs` runs before the body publication step, a freshly captured official TOC and its validated body figures can become public in the same Pages deployment. Articles still missing an official TOC remain held rather than receiving body-only publication in that batch. The unchanged `literature_authorization` job remains mandatory. Failure-report outbox delivery remains independent of this publication cadence. The repository job is not a new ChatGPT monitoring task; GitHub scheduling may still be delayed.

Each build revalidates and preserves the previous published auto snapshot and exact image bytes. Failed new downloads are recorded with bounded retry timing. An unavailable/corrupt prior published snapshot fails closed rather than silently erasing previously displayed auto files. Disabling new admission does not erase prior valid images. Old sealed media remains in its separate reviewed restoration path. Live acceptance must still establish public URLs/hashes/labels and actual cards; a successful prepublication check alone is not postdeployment verification.
