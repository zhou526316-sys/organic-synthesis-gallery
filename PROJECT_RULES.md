# Project Rules

## GPT response synchronization

Effective from 2026-09-19, every GPT assistant reply produced for this project must be synchronized to Git before or together with the corresponding code/data changes.

Operational rules:

1. Append each assistant reply to `audit/gpt-responses/YYYY-MM-DD.md`.
2. Preserve the reply text substantially as sent to the user; code blocks and commands should be retained.
3. Include Beijing time, conversation/task context, and any related Git commit SHA when available.
4. If a reply itself changes repository code/data, commit the reply log in the same turn or immediately after the functional change.
5. This logging requirement is project-wide and applies to maintenance, debugging, literature audit, TOC capture, website, deployment, and user-system work.
6. Do not include secrets, tokens, passwords, API keys, or private credentials in the response log.
7. If GitHub is temporarily unavailable, queue the response for the next successful Git operation rather than silently dropping it.

