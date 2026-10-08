# Owner private PDF authorize timeout — bounded diagnostic checkpoint

Beijing: 2026-10-08T15:14:24.538+08:00
Chat context: continued Gallery architecture repair after owner reported DOI 10.1021/acs.orglett.6c03725 always failed with authorize / both-failed after 15 seconds; user explicitly approved deploying diagnostic then evidence-based repair.

Repository: zhou526316-sys/organic-synthesis-gallery, main baseline.
PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/413 (merged)
Merge SHA: 7b0f2b284417595089fbf832d6c1cd09504e4a3f
Cloudflare Worker deployment workflow: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37741968866
GitHub Pages workflow: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37741968787

Technical scope: Worker owner-only /api/user-ui/private-pdf/open stage timing via Server-Timing for session, capability, document, R2 16-byte fetch and body, ticket issue/check, legacy-write and total. 2026-10-10 00:00 Beijing automatic timing gate expiry. Slow logs contain only durations and numeric status, not DOI, user ID, R2 path, token, file URL or request secrets. Canonical deployment generates redacted query-string console logs (automatic invocation logs disabled); broad native automatic R2 traces disabled to avoid private R2 object key exposure. Browser separately records canonical/backup attempt duration, only sanctioned Server-Timing stage labels, and on authorization network failure measures healthcheck GET and CORS/POST via deliberately invalid static diagnostic credential, without actual account token or document DOI.
Privacy access remains owner-only; no expanded PDF grants, no changes to literature cards, Tampermonkey, 08:00 publication rules or D1 schema.
Code files changed:
- cloudflare/worker/src/private-pdf.js
- cloudflare/worker/src/index.js
- src/private-pdf-reader.mjs
- cloudflare/worker/scripts/test-private-pdf.mjs
- tests/private-pdf-access-browser.mjs
- .github/workflows/deploy-worker-frontend.yml

Main validated: Private PDF access v1 regression SUCCESS, 31/31 isolated Chromium tests, worker stage privacy PASS, Cloudflare migration CI SUCCESS, PDF Vault P1 SUCCESS, Private PDF capture v2 SUCCESS.
PR branch CI red: Worker deployment authority regression protected file comparison disallows any private-pdf.js logic change other than bootstrap hash, Tampermonkey Oct1 scope guard disallows concurrent reader/Worker changes, daily scheduled summary backend check expects an obsolete 6-hour cron while current main runs */15. These guard failures have not been modified, bypassed, or represented as passes. Their content is separated from successful targeted PDF tests.
Before final handoff: confirm canonical Worker release completed, GitHub Pages sourceCommit equals merged SHA, public worker health, and current user must reproduce on actual local account/network; no credentials supplied to assistant.
This checkpoint is not a production claim of corrected latency. Final performance fix is conditional on real diagnosis, not yet established.
