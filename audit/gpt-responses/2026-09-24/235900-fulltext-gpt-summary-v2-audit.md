# GPT response sync

Beijing time: 2026-09-24 23:xx
Context: strict audit and v2 architecture for full-text capture + GPT-reviewed summaries
Related main before sync: 0b595ca969d6c78552b2ccf4fe52c77ba4180291

Strict audit conclusions:
- Existing article-summary.js generates AI output from a public GET when cache is absent. This must become read-only; generation moves to a durable private job queue.
- Existing fulltext import only validates DOI syntax and minimum text length. It lacks strict publisher/source/page DOI/capture-version/completeness guards, so cross-DOI or challenge-page contamination must be prevented before automatic capture is enabled.
- Existing summarizer samples 140k characters from a normalized text blob (front/middle/end). This can omit conditions, scope, mechanistic evidence and limitations. Replace with publisher-specific structured section extraction and evidence IDs.
- Existing summary schema only has zh/en. Replace with strict structured chemistry facts plus claim-level evidence references, then render zh/en from approved facts.
- Add a two-stage GPT pipeline: extraction/draft then independent audit; separate mechanistic evidence from mechanistic proposal and forbid unsupported inferred mechanism from publication.
- Media capture must stay independent. Latest paired and historical figures jobs may opportunistically capture text after media is secured; historical TOC-only remains TOC-only. Fulltext-only historical backfill is the last priority tier.
- Fulltext storage and third-party model processing require a configurable per-publisher retention/processing policy; private access does not automatically establish rights to permanent cloud storage or third-party processing.
- OpenAI model naming Sol/Terra/Luna is currently supported; however Batch should not be the default for copyrighted/private full text because its data-retention behavior differs from normal Responses. Prefer server-side Responses with store:false; Batch only where the user's source/license/data policy permits it.
- Record model, model version/snapshot where available, promptVersion, schemaVersion, auditVersion, sourceHash, evidencePacketHash and generatedAt. Regenerate whenever sourceHash changes.
- Add deterministic numeric/entity checks and a chemistry golden-set eval before enabling auto-publication.

V2 target state machine:
capture -> provenance_validated -> evidence_ready -> queued -> draft_ready -> audit_passed -> published
with partial/blocked/retry/needs_manual_review branches.

Public GET only returns status or an already approved cached summary.
Raw full text/evidence remains private; public site exposes only approved derived summaries and non-sensitive provenance metadata.
