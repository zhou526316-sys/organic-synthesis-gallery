# Owner-only PDF: cross-network availability architecture proposal

Status: **read-only analysis; awaiting explicit user approval for this implementation**.
Date: 2026-10-08, Asia/Shanghai.
Scope: Organic Synthesis Gallery, main baseline; no changes to literature publishing, public PDF rights, WeChat relay or Tampermonkey acquisition.

## User requirement

For the same properly authenticated account holding private_pdf_read, any private PDF already stored in the protected collection should be readable through the Gallery from campus, home broadband and mobile networks, with no forced campus VPN or manual proxy switching. This is a reliability and owner UX requirement, not a request to bypass authorization or expose PDFs publicly. A totally offline or completely blocked network cannot fetch uncached cloud files; encrypted owner-only offline copy may be a separate optional feature.

## Verified defects and evidence

1. Current production src/private-pdf-reader.mjs uses api.gczhouwld.com and organic-synthesis-gallery.zhou526316.workers.dev; both reach one Cloudflare Worker and the same D1/private R2. They are two DNS names, not independent ingress providers or independent backends. Backup starts at ~3.5s and shared deadline is 15s.
2. The user's actual earlier owner request for DOI 10.1021/acs.orglett.6c03725 timed out during authorize after 15 seconds with both-failed; no PDF bytes were requested.
3. Cross-journal live QA: 16 journals, 47 sampled DOI, 36 stored files authorized, complete-hash verified and rendered first page in GitHub Actions Chromium; 11 selected DOIs not stored. Audit: audit/private-pdf/2026-10-08-cross-journal-reading-qa.json. This does **not** test the China end-user path.
4. 2026-10-01 onward: 177 currently published cards, 163 owner-private PDF ready records, 14 missing storage records. Media acquisition gaps are **not** reader failures and must remain a separate workflow.
5. Read-only public checks: https://gallery.gczhouwld.com/api/_healthcheck returns 404, so there is no Gallery same-origin API today. The public https://api.gczhouwld.com/api/_healthcheck works. Gallery's capability refresh in src/private-pdf-access.ts also calls canonical API only; a blocked API may hide owner actions even before opening.
6. The user has an existing Tencent Cloud Ubuntu instance used for relay.gczhouwld.com and WeChat JS-SDK/access_token/jsapi_ticket/publishing relay. Do not modify or restart it without verified isolation and specific permission. Region, capacity, TLS ingress and cost have not yet been checked. Public root URL returning 404 is not evidence of failure.
7. Official background: Cloudflare recommends a production custom domain/route rather than workers.dev as business-critical primary; EdgeOne China mainland nodes require ICP filing, and its premium cross-border optimization is Enterprise plan. Tencent previously published HK Linux Lighthouse 2vCPU/2GB/40GB 500GB/month at ¥38/month; current availability/renewal must be checked, with user's cap of ¥50/month.

## Proposed solution, after approval

**Stage A, read-only feasibility.** Determine existing Tencent instance region, occupancy, ingress proxy ownership, TLS, available CPU/RAM/bandwidth and *server-to-server* reachability to api.gczhouwld.com and R2. Inspect live relay config read-only; do not restart, patch or share port ownership at this stage. Check actual mainland ISP access from neutral probes. If instance lacks safe isolation or region unsuitable, evaluate a **separate** Hong Kong Linux instance within explicit recurring <= ¥50 monthly authorization before buying; no purchase automatically.

**Stage B, independent browser ingress gateway.** Create a strictly owner-only HTTPS endpoint (working hostname suggestion: pdf.gczhouwld.com) on a different provider/route, with isolated process/credentials/virtual host. This is independent client-to-service ingress, but initially shares existing Cloudflare D1/R2 as authoritative backend. It must not intercept the existing WeChat relay hostname, path or 80/443 traffic unless proven safely possible and explicitly approved. No public private-PDF bucket/copy.
- Auth paths: securely proxy only required owner account login, session/capability check, /api/user-ui/private-pdf/open and /file (GET, HEAD, Range 206). Existing account remains the source of truth; no IP/VPN binding or alternate public download path.
- The gateway forwards Bearer authorization to the origin server over TLS; origin checks private_pdf_read every authorization; 401/403/availability failure remain fail-closed and are never overridden by fallback.
- Signed file responses must point at the **gateway** on alternate routing, not send the browser back to the same blocked Cloudflare hostname. Preserve scoped short-lived ticket, content-range/content-length/accept-ranges, no-store/noindex, cookie continuation needed by native mode. Allowlisted target paths only; no open proxy, token/query/userID in logs, no unsupported redirects.
- Include bounded 403/401, 404, no-PDF, stale session, lost route, 206 Range, full GET, first/second page, download and return-from-reader login persistence regressions. No permission broadening.
- Browser picks fastest reachable trusted endpoint and switches on transport failure with the same authenticated account; do not trigger a relogin merely because primary API times out. Allowlisted CSP and CORS. Do not merely add a third Cloudflare workers.dev alias.

**Stage C, robust acceptance and measured cutover.** Validate owner login -> session/capability -> PDF open -> first/second page -> download and re-open across real mainland China network probes (multiple mobile/campus/carrier and overseas) and papers representing all 16 current target journals. Record p50/p95, error code and chosen gateway; never log PDF tickets. Only cut over after tests are actually performed, with rollback to existing Cloudflare route. Do not call GitHub Actions US tests evidence of China success.

**Stage D, optional resilience if the upstream itself fails.** If required after Stage C, consider an independent *private* encrypted copy in a second storage provider with short-lived owner entitlement and valid licensing; this is new private storage and identity risk and requires separate approval. Stage B alone fixes independent client-to-Cloudflare route, not total Cloudflare outage.

## Security and constraints

- Preserve owner-only access and real user server-side capability checks. A same-account claim cannot waive authentication.
- No token, API key, R2 path or signed PDF URL in logs or public artifacts.
- No changes to existing WeChat relay, no downtime or restart, no additional host charges without budget approval.
- No alteration to formal 08:00 literature publishing or owner PDF capture responsibility.
- Do not promise 100% from networks with no usable Internet, hostile firewall or during global upstream outages.
- The proposal does not authorize implementation until the user approves the specific gateway architecture, its isolated hosting choice and allowable cost.
