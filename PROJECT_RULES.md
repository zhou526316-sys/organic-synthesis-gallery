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

