# Project Rules

## GPT response synchronization

Effective from 2026-09-19, this rule applies to **every GPT conversation/chat window that belongs to the ChatGPT Project “抓取有机合成文献并持续更新网页”**, not only the current conversation.

Every assistant reply in every chat of this project must be synchronized to Git before or together with the corresponding code/data changes.

Operational rules:

1. Synchronize every assistant reply from every project chat to Git before sending the final user-visible reply whenever GitHub write access is available.
2. Prefer an immutable per-response file under `audit/gpt-responses/YYYY-MM-DD/<HHMMSS>-<context>.md` to minimize cross-chat write conflicts. A daily aggregate file may be maintained as a derived index, but it must not be the only durable copy.
3. Each record must include Beijing time and a conversation/task identifier or descriptive chat context so replies from different chat windows remain distinguishable.
4. Preserve the complete user-visible reply body substantially as sent, including code blocks and commands; do not reduce it to only a summary unless a platform limit makes the full body impossible.
5. Include any related Git commit SHA when available.
6. If a reply itself changes repository code/data, commit the reply log in the same turn or immediately after the functional change.
7. Scheduled/Work tasks must treat response synchronization as a terminal step: compose the final reply body, persist that body under `audit/gpt-responses/`, commit/push it, then send the same reply. If persistence cannot be completed, the reply must explicitly report `response_sync_pending` or `response_sync_failed`; it must never silently claim synchronization.
8. This is a project-global rule covering all current and future chats under this ChatGPT Project, including literature updates, TOC capture, website work, search, feedback, user system, deployment, audits, debugging, and any other project work.
9. Do not include secrets, tokens, passwords, API keys, authentication cookies, or private credentials in the response log.
10. If GitHub is temporarily unavailable, queue the response for the next successful Git operation rather than silently dropping it.
11. A chat must not opt out of this rule merely because it is a separate conversation window; the project scope is the controlling scope.

## Feedback verification and user approval

Effective from the user's 2026-09-23 instruction: **“吐槽不要直接修，要先给我核实，我来决定。”** This rule applies to feedback handling across project chats and supersedes earlier blanket instructions to repair all feedback.

1. First read and verify the feedback. Report its ID/original request, reproduction result or evidence, affected scope, proposed change and material risks or trade-offs. Distinguish confirmed defects from preferences, test-only failures and unverified reports.
2. Present the verified items to the user for a decision. Do not choose which feedback to implement on the user's behalf.
3. Before explicit approval for the particular item or clearly enumerated batch, do not implement repair code (including in branches), merge/deploy a repair, modify production data for the complaint, or mark the feedback reviewed/resolved/dismissed. Read-only diagnosis and documenting evidence or this approval hold are allowed; production test writes are not.
4. An unqualified “继续” continues verification and reporting, not permission to start unapproved feedback repairs. Clearly approved work may proceed only within its approved scope.
5. Pending feedback-driven changes are held for the user's decision; being implemented in a branch or passing CI is not approval. At adoption, navigation PR #150 and reader-counter PR #163 remain unmerged and must not be advanced or published without explicit user approval. Do not revert already deployed features merely because this process changed.
6. Keep scope separate: this feedback approval gate does not itself disable, reschedule or alter independently authorized literature publication or media-acquisition workflows. Follow their existing contracts and permissions.
## Public-facing model-name neutrality

Effective from the user's 2026-09-25 instruction: public-facing Gallery text must not expose the name “GPT” (case-insensitive), including summary loading/pending/completed states, feedback confirmations, buttons, help text, errors, empty states, and other user-visible copy.

1. Use model-neutral product wording such as “摘要正在处理中 / summary is being prepared” and “摘要已生成 / Summary ready”.
2. Do not show “等待 GPT 审核”, “GPT reviewed”, model snapshots, or similar model/review implementation details in the public UI.
3. Internal implementation may retain actual model identifiers, API configuration, provenance, audit records, tests about backend contracts, and private operational logs where technically required; these must not be surfaced as public UI copy.
4. Future UI changes must preserve this rule across both Chinese and English copy.



## 2026-10-01+ publisher-visit acquisition bundle

Effective from the user's 2026-10-06 instruction: **for a Gallery paper whose `addedDate >= 2026-10-01`, once Tampermonkey opens the publisher article page for any genuine acquisition gap, the same authenticated visit must also attempt body figures, full-text HTML evidence, and the owner-private article PDF.**

1. `addedDate` is the authority for this cutoff. Publication date is not a substitute, and an empty `addedDate` does not qualify.
2. The visit may have been triggered by a missing TOC or a private-PDF gap. After the page is open, body figures and full-text evidence are companion acquisition layers even if they were not the original trigger.
3. Body-figure incompleteness or text incompleteness alone must not create a standalone publisher-page visit. This rule bundles work into a visit that is already justified.
4. Reuse existing trustworthy local/server receipts and content hashes. Re-scan the live article page when needed to determine completeness, but do not redownload/reupload a figure already proven for the same DOI/label.
5. For Oct-1+ papers, `abstract_only` or `partial` HTML evidence does not count as complete when an eligible publisher visit is already happening; attempt complete article text in that visit.
6. Private PDF completion is only `stored` or `already_stored`. `not_found`, `failed`, cached misses, 401/403/429, viewer HTML, or a merely discovered PDF link never count as a completed PDF.
7. A PDF failure remains independent of successfully captured TOC/body/text media and does not invalidate those receipts. The controller must continue to later DOI jobs rather than stall on one failed PDF.
8. Old in-memory controllers must fail closed after a controller-generation cutover. Stale controller final reports and private-PDF uploads must not overwrite current completion truth.

## WeChat draft editorial gate

Effective from the user's 2026-10-06 instruction: **公众号草稿不得从正在编辑的源稿直接写入微信。先生成纯文字审阅稿与纯图片审阅稿，分别审核通过后，才允许合成并写入公众号草稿。**

1. For every daily or retrospective WeChat draft, create a review package under `audit/wechat-working/` before any `sync_daily_draft` or `sync_retrospective_draft` trigger:
   - a `*-text-only.md` file containing the complete user-facing editorial text but no body images;
   - a `*-images-only.md` or equivalent image manifest containing every cover/body image, source, crop, caption, and intended placement, but no article narrative;
   - a machine-readable `*-review-gate.json` recording the exact source-file fingerprints and review status.
2. Text review and image review are independent gates. Text review checks scientific accuracy, causal strength, narrative order, duplicated claims, title/subtitle rules, terminology and unsupported assertions. Image review checks file decodability, source correctness, crop boundaries, duplicate panels, image-caption correspondence, cover ratio/crop, and that chemical structures/data are not redrawn by generative models.
3. A draft may be written to WeChat only when both `textReview` and `imageReview` are `pass`, the review gate fingerprints still match the current source manifests, and the image files required by the manifest are decodable.
4. Any edit to the reviewed source manifests, image source/crop, cover configuration, captions, or editorial text invalidates the prior gate. Regenerate the review package and review it again before writing the draft.
5. After WeChat `draft/add` or `draft/update`, perform `draft/get` readback and inspect the combined preview. The readback is a final transport/layout QA layer; it does not replace the pre-draft text/image review.
6. Publisher triggers are terminal actions only. Editorial work must not repeatedly trigger WeChat while text, figures, crops, or covers are still being revised.
7. Prefer publisher-hosted raster images or locally verified PNG/JPEG assets. A filename extension alone is not proof that an image is valid; decode the raster before publication. Avoid progressive JPEGs in the WeChat pipeline where a normalized PNG/JPEG can be used instead.

