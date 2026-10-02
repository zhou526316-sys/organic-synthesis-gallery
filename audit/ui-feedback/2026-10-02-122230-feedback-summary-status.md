# Read-only feedback and article-summary status

Checked on 2026-10-02, Beijing time 12:19:11 (feedback) and 12:22:30 (summary inventory and live reads).
Context: user asked whether new feedback exists and how article-summary publication is progressing. No feedback repair, status change, literature change, summary publication, or schedule change was authorized or performed. Diagnostic files/workflow and this evidence record are the only repository changes.

## Original evidence

- Feedback export run: 36964022599, completed successfully. Artifact 11208997894, site-feedback-review; ZIP SHA-256 6e750c58ee131990f52e1c0a7666b409db779c91b15a3f250e1ea211905f9a4f.
- Summary read-only audit run: 36964264197, completed successfully. Artifact 11208203674, gallery-summary-status; ZIP SHA-256 a96eb11f6c3041c2661a08862dec7d71362f40d9260618990622b22f20b00e86.
- Repository summary blob: df253f1f6f7c7046fdd36fb1814d38ac87f32647.
- Live endpoints read: gallery.gczhouwld.com/scheduled-article-summaries.json and toc-demand-live.json; Worker scheduled-article-summaries.json; authenticated API evidence-inventory and review-status; per-DOI article-summary GETs. All requests were read-only.

## Feedback

Fresh generatedAt: 2026-10-02T04:19:11.148Z.
Open count: 12. D1 available: 11; R2 fallback available: 1.
Open IDs: 8, 20, 21, 22, 23, 24, 25, 28, 31, 32, 34, r2:bd1346e7-aab7-40af-9ec5-0b031e750f0f.
The ID set exactly matches the post-feedback36 baseline. New open feedback: 0. Feedback35 and feedback36 are not open. Existing paused feedback was not changed.

## Deployed summary records

Live static file and Worker static file both returned HTTP 200 and were exactly equal to the repository JSON.
Published scheduled records: 163, all approved and all containing nonempty Chinese and English summaries.
Summary-record evidence levels: complete 79; partial 65; abstract_only 19. These are the coverage levels of the published records, not a claim that all captured evidence remains unchanged.
Latest content generatedAt: 1790434018809 = 2026-09-26 22:46:58.809 +08:00.
Static file Last-Modified: 2026-10-02 08:06:02 +08:00. The later deployment time must not be reported as newly generated summary content.

## Coverage against the live DOI registry

Current active registry: 755 unique DOIs.
Scheduled summary records on active DOIs: 163 (21.6%).
Active DOIs without a scheduled summary record: 592.
Current captured-text evidence inventory: 457 unique DOIs; all are in the active registry.
Active DOIs with captured-text evidence but no scheduled summary: 294.
Active DOIs absent from the current evidence inventory: 298. This means absent from this indexed evidence source, not a claim that no material exists in another capture/staging source.
The 294 captured-but-unpublished items have current evidence levels: complete 104, partial 87, abstract_only 103. Evidence coverage controls summary depth; the production contract does not require complete full text for every summary.

## Live per-DOI verification scope

Checked 80 of the 163 scheduled-record DOIs, selected by sorted DOI order: all 80 returned HTTP 200, available=true, state=published, source=scheduled_reviewed_evidence_v2 and nonempty bilingual text.
This is a sample of 80, not verification of all 163 per-DOI API results.
Also checked the latest 10 registry entries: all 10 have no summary. Four return evidence_ready / scheduled_summary_pending; six return missing / fulltext_missing.
The four captured-but-unpublished latest examples: 10.1126/sciadv.aej5227; 10.1126/science.aef5175; 10.1038/s44160-026-01168-4; 10.1038/s44160-026-01164-8.

## Continuing publication

The task inventory was read in this turn. No currently enabled daily article-summary publication task was found. This was not changed in this turn.
The normative contract still specifies daily 12:00 Asia/Shanghai publication without a model API, separate from the 08:00/18:00 literature-card releases. A configured cadence string is not evidence that the scheduled publication task is executing.
The legacy real-time model-review backend is disabled intentionally; this must not itself be misdiagnosed as a fault in the no-API architecture.
Current conclusion: existing summary data is deployed and the sampled records are readable, but incremental publication is not keeping up. There are 294 currently indexed captured-text items without scheduled summaries, rather than an entirely empty evidence queue.
The handoff-manifest request timed out once during this audit. No conclusion about persistent transport failure or current ability to publish was drawn from that single timeout. No summary-data write was attempted.
