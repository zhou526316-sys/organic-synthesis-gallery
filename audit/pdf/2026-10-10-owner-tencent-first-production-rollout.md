# Production evidence: owner-only Tencent-first private PDF pilot

Verified: 2026-10-10 ~19:18 Asia/Shanghai (11:18 UTC), release day.
Scope approved by owner: Tencent first ONLY for currently authenticated private_pdf_owner + private_pdf_read accounts; Cloudflare fallback; retain existing Tencent gateway 256 MiB/month reserve. Do not expand until actual entitled China-network PDF reading acceptance.

## Exact code and CI

- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/491
- Merged to canonical `main` as `7058e0994fc0c0116ed4ee043ea79de9ecf910d7`.
- Private PDF owner/reader Chromium regression: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046623788 — **success, 59/59**. The new cases verified Tencent as first owner /open, ordinary reader Cloudflare-first, stale cached role cannot spoof owner, gateway monthly-quota 429 at authorized /open and later large Range securely switches to fresh Cloudflare ticket, 403 denies, first+second page rendering and continuous scroll.
- Entire site quality gate: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046623767 — success.
- Cloudflare migration/Worker dry-run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046623849 — success.
- Other unrelated regression: PDF Vault, original figure rescue, private PDF capture, Tampermonkey capabilities, author data — success, per PR #491 checks.

## Verified real production deployment

- Canonical Worker: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046940325 — success. Backend routing and authorization semantics inherited from the already deployed PR #484, no new privilege grant or R2 storage change.
- Canonical GitHub Pages: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046935614 — success, deploying build SHA `7058e0994fc0c0116ed4ee043ea79de9ecf910d7`; official deploy-pages status reported success and script verified the custom domain `https://gallery.gczhouwld.com/`, release delivery and CSS.
- Live public read-only fetch (no session/token/cookies):
  - `https://gallery.gczhouwld.com/pdf-gateway-routing.json` returned JSON with `schemaVersion:1`, `enabled:false`, `origin:"https://pdf.gczhouwld.com"`, `manualCanary:true`, `ownerPriorityPilot:true`, `reason:"owner-only-tencent-first-pilot-general-automatic-failover-disabled"`.
  - `https://pdf.gczhouwld.com/_pdf_gateway_health` returned `{"ok":true,"role":"private-pdf-ingress","authenticated":false}`.
  - Independently retrieved through public read-only fetch (not from repository text alone) on 2026-10-10. Both requests succeeded; this establishes public manifest and unauthenticated gateway reachability, not PDF authorization.

## Security and quota boundaries

- A refreshed owner route decision must come from `/api/user-ui/auth/session` through Tencent with the current bearer, checked for both `private_pdf_owner` and `private_pdf_read`. Cached UI claims cannot enable owner priority; known cached non-owner can only avoid an extra lookup.
- Pilot owner tries Tencent /open FIRST, 5s bounded. HTTP 429 (monthly cap), 5xx or timeout recovers with a new Cloudflare /open and signed ticket; 401/403, unavailable PDF or malformed source never bypasses entitlement.
- File Range HTTP 429 similarly uses new Cloudflare ticket with same cryptographic file hash and length, and separate HTTP 206 validation if Worker prefix was deferred. No signed ticket replay across hosts or mixing PDF bytes. Later Tencent retries are suppressed within that viewer after fallback.
- `public/pdf-gateway-routing.json.enabled` remains false: ordinary `private_pdf_read` users are not automatically Tencent-first. Explicit manually chosen canary `?pdfIngress=tencent` remains as before.
- Gateway's existing durable 256 MiB monthly egress reserve is unchanged. Same Tencent shared VM, no new paid server, ordinary download path stays Cloudflare, same original file/quality/1 MiB Range ceiling/vertical scrolling/08:00-only literature release.

## NOT YET PROVEN: owner end-to-end live PDF reading

We do NOT have the owner's logged-in browser or signed private PDF token in ChatGPT. The real owner-content end-to-end acceptance on China desktop and mainland cellular (with both pages, complete large first/trailer PDF Range 206 and true scroll), independently denied ordinary account and current quota usage has not been checked in this conversation. Prior Tencent owner 16-byte Range proof plus today's 59/59 mocked browser cases cannot be called real two-page live proof. Thus **routing pilot is deployed, production PDF readability remains awaiting actual owner sample**, and all-user expansion is prohibited until separate acceptance and approval.

Recommended minimal no-console live sample (owner signed in):
- https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Fjacs.6c17448
- https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78405-z
These are normal links (without manual pdfIngress parameter), so they exercise priority selection. Only claim a DOI works if page 1+2 and continuous scroll actually render. No need to open hundreds manually.
