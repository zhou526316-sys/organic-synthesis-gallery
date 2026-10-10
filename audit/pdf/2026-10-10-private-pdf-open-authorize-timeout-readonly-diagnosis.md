# Gallery PDF reader authorization timeout — owner screenshot, read-only diagnosis

Review date: 2026-10-10 Beijing 17:40+. Source: owner-provided screenshot in ChatGPT project conversation, no DOI visible. This is distinct from PR #467's full-catalog R2 inventory and PR #473's audit consistency fixes.

## Direct screenshot evidence

- Status: `阶段: authorize`; `pdf_authorize_timeout`; total 15.0 s; file transfer not started.
- Primary authorized open: no response / 15011 ms.
- Backup authorized open: no response / 11508 ms.
- Primary-retry: not attempted / 0 ms.
- Tencent: not attempted / 0 ms.
- Anonymous network probes (do not prove owner entitlement): primary public GET HTTP 200 / 2085 ms; primary invalid-auth POST HTTP 401 (CORS preflight passed) / 3224 ms; backup GET and invalid-auth POST were timeout/network failures.

Therefore at least this observed PDF open failed. There is no evidence from this screenshot that all 938 PDFs are unreadable or that the authenticated Worker handler actually completed or returned any 200/401/403 response. Storage's first production 120/120 R2 head/tail checks do not establish user-facing authorization.

## Source-level verification (main as reviewed 2026-10-10)

- `src/private-pdf-reader.mjs`:
  - `OPEN_TOTAL_TIMEOUT_MS=15000`, primary `https://api.gczhouwld.com`, backup `https://organic-synthesis-gallery.zhou526316.workers.dev`, backup hedged after `OPEN_HEDGE_DELAY_MS=3500`.
  - `getPdfSource()` transmits owner bearer only in request Authorization header to the exact configured host's `POST /api/user-ui/private-pdf/open`, and aborts all attempts on the global deadline.
  - Normal Tencent is gated by `tencentPdfRouteEnabled()`; `public/pdf-gateway-routing.json` still has `enabled:false, manualCanary:true`, so screenshot's 'tencent 未发起' is expected.
  - Explicit `?pdfIngress=tencent` manual trial is a separate owner-entitled route, not evidence it succeeded.
- `cloudflare/worker/src/private-pdf.js`:
  - Authorization includes live session lookup, private_pdf_read capability, selected active/ready document lookup, R2 16-byte header read, signed ticket mint/check, and potentially a D1 ticket fallback write. Anonymous invalid-token POST can return 401 before accessing most of this path, so it cannot benchmark authenticated execution.
  - `PRIVATE_PDF_OPEN_TIMING_ENABLED` diagnostics are additionally gated by `Date.now() < Date.parse('2026-10-10T00:00:00+08:00')` and thus disabled on October 10 after 00:00 Beijing, even if configuration remained enabled. That is a demonstrable diagnostic blind spot, not proven root cause of the authorization stall.
  - `cloudflare/worker/src/index.js` sends a finite JSON body with explicit Content-Length on `/open`. PR #457 previously fixed authorized HTTP 200 whose JSON body stalls, but screenshot shows neither authenticated origin returning response headers; therefore this incident cannot be declared solved by the PR #457 test.
- PR #473 `fix(pdf): immutable owner audit snapshots...` at review time has passing owner audit, Cloudflare migration, Worker deployment authority and site CI yet remains **open/unmerged**. It does not change `/open` authorization.

## Hypotheses (NOT proven root causes)

A. China/VPN/rule-proxy path delays or drops authenticated cross-origin POST for both Cloudflare origins.
B. Real-session-only Worker D1 lookup/ticket generation/R2 header step takes longer than 15 s, while invalid-token 401 is fast.
C. A response is stalled before headers by a proxy or regional edge problem. The screenshot alone cannot distinguish these.

## Proposed separate repair batch — AWAIT USER APPROVAL

1. Restore strictly time-limited (e.g. 48h), owner-only, low-cardinality, no-PII timing evidence for session / capability / document / R2 head/body / ticket and end-to-end open stages, observing local abort vs actual Worker response; do not emit token, DOI, file URL, R2 key, user identity or credential. Verify no persistent public leakage.
2. Add focused tests for the actual `no auth headers on either path` failure mode, distinct from HTTP200 stalled-body; isolate whether failure is frontend transport, edge, or server-side work. Keep 401/403 fail-closed.
3. If server-side: repair measured bottleneck while keeping PDF identity and authorization. If region routing: validate the existing manual Tencent gateway with authorized first and second pages, 206 Range and continuous scrolling on representative real networks; no blanket automatic enablement without acceptance and budget checks.
4. Accept fixes only after live authorized /open finishes, valid signed Range 206 and actual page 1 and page 2 render in tested browser(s); owner audit R2 checks stay separate.

No repair code, production data, credentials or account capabilities were modified while recording this diagnosis. This is a new feedback issue; previous '可以' applied to the four PR #473 owner audit consistency items, not to independent PDF reader permission/transport work.
