# GPT response sync

Beijing time: 2026-09-24 ~23:50
Context: full-text capture + GPT-reviewed summary architecture
Related main: 938a18d05f96e1c461e07db426b1bcdfc973584c

Recommendation:
- Reuse existing private article-fulltext import/storage, article-summary API, and summary button UI.
- Do not couple GPT generation to media publication. Media stays atomic/fast; summary is an asynchronous reviewed derivative.
- Bridge 2.2.32 should capture a structured Article Evidence Packet during latest paired capture and historical figures/fulltext capture, but never during historical TOC-only jobs.
- Evidence packet: DOI/title/publisher/source URL/source hash, structured sections, abstract, Results/Discussion, Conclusion, General Procedure when useful, figure/scheme captions, tables/footnotes; exclude references/navigation/recommendations.
- Keep raw full text private in R2; never publish/commit full text. Public UI receives only reviewed derivative summaries.
- Enqueue durable summary jobs after validated full-text import. State machine: captured -> validated -> queued -> generated -> audited -> published, with blocked/retry states.
- GPT output must use strict structured JSON and evidence section IDs. Final summary should cover core transformation, catalyst/reagents/conditions, scope, yield/selectivity/ee, mechanistic evidence versus proposal, limitations, and significance, plus zh/en.
- Prefer fast lane for latest additions, low-priority historical fulltext-only backfill after TOC/body priorities. Click on summary should only read reviewed cache, never initiate model work.
- Suggested model policy: current-day articles use GPT-5.6 Sol final review; historical backlog may use GPT-5.6 Terra/Batch; uncertain historical output escalates to Sol.
- Existing Cloudflare Gemma can remain only as fallback/draft, not auto-published as final reviewed summary.
- Add TOC image and key scheme caption/context to evidence packet; optionally include TOC image in GPT review because chemical structures can be absent from extracted text.
