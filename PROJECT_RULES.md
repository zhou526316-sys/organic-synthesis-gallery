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

