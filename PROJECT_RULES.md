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

## 2026-10-10 historical backfill vs Oct-1 media-capture exception

User-approved historical literature policy is an explicit **exception** to the
Oct-1+ `addedDate` publisher-visit bundle above, not an amendment to normal
new-paper capture or the sole 08:00 publication slot.

1. Nightly 23:00 Asia/Shanghai historical discovery/review is **staging only**.
   It does not publish new DOI records, alter prospective journal `activeFrom`
   rules, bypass DOI scope review or trigger another Pages release. Production
   admission remains limited to the authorized single 08:00 slot.
2. Admit retrospective literature only after source identity and review
   validation using `ingestionChannel: historical_backfill` (not inferred
   from `addedDate`). All such records are excluded from Hot/Today, daily-new
   tags/counts, WeChat daily-new content, and 08:00 *new-paper* metrics;
   they remain visible to all-time Archive/DOI search.
3. For **papers first published 2026-07-01 through 2026-09-30**, including
   late additions after 2026-10-01, **only TOC/official graphical abstract may
   be newly acquired**. Do not enqueue or opportunistically capture new body
   figures, full text, SI or PDF for those old-date capture jobs, regardless of
   `addedDate`. Explicit historical source records use `mediaPolicy: toc_only`.
   Actual source media acquisition remains under Tampermonkey. Preserve all
   existing verified TOC/body/PDF bytes and prior owner access; do not erase
   existing assets or repeat fully verified acquisitions.
4. Historical papers published before 2026-07-01 use
   `mediaPolicy: metadata_only`: verified title, authors, DOI (if one exists),
   bibliography, legally displayable abstract, and citation data, without
   TOC/figure/PDF acquisition or placeholder UI.
5. Publisher-verified missing original English titles in July–September
   get a separate DOI-specific repair proof. Differentiate truly missing
   English title from missing Chinese translation; never replace a known valid
   title using an inferred/guess title. A preliminary set of 83 static
   unresolved English titles is an audit input, **not** a verified live count.
6. Before activating an all-history publication path, test that its metadata
   survives catalog/source/queue/build normalization and that historic papers
   cannot reappear in the Today's result set or in owner-PDF capture, even
   when indexed with an October `addedDate`. The normal Oct-1+ published
   papers keep their existing full-media acquisition obligations.

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



## Long-task timeout preflight

Effective from the user's 2026-10-06 instruction: **before starting any long-running task, first assess whether the planned tool/workflow path is likely to trigger a chat, connector, browser, CI-log, or remote-call timeout.**

1. Perform a timeout-risk preflight before long tasks. Consider call count, payload size, remote latency, full-log/artifact downloads, polling duration, and whether multiple remote operations are chained into one request.
2. If timeout risk is material, do not start the task in that form. First redesign it into bounded short calls, smaller artifacts, narrow file reads, one-job/one-status queries, staged commits, resumable checkpoints, or another approach that preserves progress if a connection drops.
3. Avoid full workflow/job log downloads when a step status, small artifact, targeted file read, or narrow regression can locate the failure. Never bundle multiple slow remote reads only for convenience.
4. Persist meaningful progress to Git after each bounded repair or milestone whenever repository writes are part of the task, so an interrupted chat does not lose completed work.
5. Only use a direct long-running path when the preflight indicates timeout risk is acceptably low or when no safer equivalent exists. If the safer path changes execution semantics, preserve correctness over speed.
6. This rule applies project-wide to GitHub, Tampermonkey/media capture, deployments, literature audits, website architecture, WeChat workflows, and other multi-step remote work.

## WeChat editorial production defaults

Effective from the user's 2026-10-07 instruction to consolidate repeated editorial lessons, every current and future project chat that constructs a WeChat article must use the canonical operational playbook:

`docs/wechat-editorial-production-playbook.md`

Mandatory defaults:

1. Before prose generation, build a paper-specific internal editorial plan containing the core question, 30-second result, actual bottleneck, design logic, evidence matrix, figure map, failure boundary and background-necessity gate.
2. The default audience is research-level organic chemistry. Textbook background such as generic oxidative/reductive quenching cycles or basic SET definitions is excluded unless it is specifically required to understand this paper's evidence or mechanistic distinction.
3. Material main-text figures have priority. Adjacent prose must explicitly identify the relevant Fig./Table/SI number. Except for one documented opening lead-image exception, the stable order is explanation first, then figure, then caption.
4. Claims must remain within their evidence level; author models, compatible observations and computations are never silently upgraded to direct proof.
5. Editorial changes are batched in one source revision. Do not repeatedly write partial revisions to WeChat; perform one terminal draft update after text/image review passes, then verify the returned `draft/get` result.

These defaults supplement, and do not weaken, the existing WeChat editorial contract and draft editorial gate.

## WeChat cover background treatment

Effective from the user's 2026-10-07 cover instructions:

1. Daily-feature covers still prefer the paper's authentic TOC/graphical abstract, but large white/near-white background regions may be removed and replaced with a calm low-saturation dark background when this makes the chemistry larger and keeps native white titles readable.
2. Only background may change. Chemical structures, bonds, arrows, labels, orbital surfaces, coloured blocks, plots, axes, legends and numerical data are immutable foreground.
3. Dark backgrounds must be comfortable and research-appropriate, adapting to the artwork palette. Avoid pure black, highly saturated blue/purple, glare-inducing contrast and visually oppressive fields.
4. If background segmentation could damage or visually swallow any coloured/dark foreground, keep the original light background on a light plate/panel or leave the image untouched.
5. Title bars are optional and must be minimal. If safe compositing still does not produce a clean result, scaling the original artwork down is explicitly preferred over damaging chemistry or making the cover uncomfortable.
6. Cover QA must therefore check both information preservation and visual comfort, not only title contrast or occupied area.

## WeChat master-level explanatory standard

Effective from the user's 2026-10-07 instruction, featured WeChat articles must do more than improve fluency. They should read like a strong organic-chemistry mentor guiding readers at three levels: cross-domain understanding, field-specific evidence, and transferable design insight.

1. Each article must make the core scientific constraint legible to a reader outside the exact subfield without adding textbook detours.
2. Each article must preserve enough chemical detail for an organic chemist to audit the argument: structures, conditions, evidence hierarchy, scope and failure boundaries.
3. Each article must extract 1–3 transferable design principles for method/catalyst development, but every high-level insight must be traceable to specific evidence in the paper and must state its extrapolation limit.
4. “High-level” must never mean grandiose. Repetitive model-like rhetoric (for example frequent “真正…”, “最…”, “不是A而是B”, “值得注意的是…”) should be actively removed during the human-language pass.
5. Every featured text receives three separate reviews before textReview=pass: scientific-evidence review, anti-AI/natural-language review, and cross-domain/transferable-insight review.

## WeChat image-to-draft delivery loop (binding)

Effective from the user's 2026-10-08 instruction, the image-editing task is NOT done when an image has merely been generated or delivered.

For any WeChat image/cover correction, default to the following end-to-end flow WITHOUT requesting a second authorization to finish the already approved draft-edit task:

1. Inspect the current **same-day same-media** Official Account draft and source manifests; keep selected DOI, article order, full body and unrelated image assets unchanged.
2. Build/repair the cover or scientific crop from **original verified source**. Preserve chemistry exactly; never use an AI-regenerated molecular structure in place of original figures.
3. Independently verify visual dimensions, source-image fidelity, native headline overlay clearance, text/cover duplication, figure completeness and mobile readability. A standalone generated image is **not** a verified WeChat draft.
4. Lock asset bytes and revised source hashes. Make one controlled `draft/update` call via the existing fixed-IP WeChat API and **`draft/get` readback**. If an editorial gate fails, fix source/QA first; never claim the draft was updated.
5. Inspect the actual returned article titles, source images, two-article order and generated preview; if a clear issue remains, revise the source and rerun the complete review/update/readback loop.
6. **Only after the readback and applicable preview/layout QA have passed** provide the user a fresh, genuine `https://relay.gczhouwld.com/wechat-preview/...` URL returned by the publishing relay. Do not invent or reuse a previous preview link as a successful new update. Distinguish native-app display (only verified by a genuine client observation) from web preview/layout simulations.
7. Draft permission never authorizes public send or distribution.

If the task cannot reach draft/get success, state the exact blocker; do not stop at image generation and say that the user can copy it manually.

User override on cover + article title: when the cover includes “今日精选·JACS”/“今日精选·期刊”, the main article’s actual native title is the **paper Chinese title only**, without duplicating the cover label/date prefix. Keep a white/light original-color TOC when the user requests it, with only a sufficiently high-contrast bottom strip for native white title and no chemistry glyphs beneath the title.

