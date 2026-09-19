# Project Rules

## GPT response synchronization

Effective from 2026-09-19, this rule applies to **every GPT conversation/chat window that belongs to the ChatGPT Project “抓取有机合成文献并持续更新网页”**, not only the current conversation.

Every assistant reply in every chat of this project must be synchronized to Git before or together with the corresponding code/data changes.

Operational rules:

1. Append every assistant reply from every project chat to `audit/gpt-responses/YYYY-MM-DD.md`.
2. Each entry must include Beijing time and a conversation/task identifier or descriptive chat context so replies from different chat windows remain distinguishable.
3. Preserve the reply text substantially as sent to the user; code blocks and commands should be retained.
4. Include any related Git commit SHA when available.
5. If a reply itself changes repository code/data, commit the reply log in the same turn or immediately after the functional change.
6. This is a project-global rule covering all current and future chats under this ChatGPT Project, including literature updates, TOC capture, website work, search, feedback, user system, deployment, audits, debugging, and any other project work.
7. Do not include secrets, tokens, passwords, API keys, authentication cookies, or private credentials in the response log.
8. If GitHub is temporarily unavailable, queue the response for the next successful Git operation rather than silently dropping it.
9. A chat must not opt out of this rule merely because it is a separate conversation window; the project scope is the controlling scope.

