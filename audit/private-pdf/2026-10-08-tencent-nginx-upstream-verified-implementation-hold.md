# Tencent PDF Gateway — confirmed host ingress + upstream, implementation approval hold

Read-only verification record (2026-10-08T23:14:51.805+08:00); project: Organic Synthesis Gallery.
Owner requirement: from any normally Internet-connected network with a valid owner account, private PDFs already stored in R2 should automatically load through a reachable path. New paid cost must remain **¥0**, no trials or overage, and WeChat relay must remain intact.

## Actual SSH results supplied by user (verified observation)

- Ubuntu user: ubuntu.
- nginx: active. caddy/apache2: inactive. docker: active.
- TCP 0.0.0.0:80, :443, [::]:80, :443 all owned by existing nginx processes; **do not attempt another public listener on these ports**.
- /etc/nginx/sites-enabled/ contains **osg-wechat-relay** only.
- VM anonymous `curl --noproxy '*'` to https://api.gczhouwld.com/api/_healthcheck: HTTP 200, DNS 79.855 ms, TCP 81.889 ms, TLS 210.664 ms, TTFB 399.939 ms, total 400.012 ms.
- VM anonymous `curl --noproxy '*'` to https://organic-synthesis-gallery.zhou526316.workers.dev/api/_healthcheck: HTTP 200, DNS 20.942 ms, TCP 21.972 ms, TLS 67.794 ms, TTFB 191.671 ms, total 191.743 ms.
- Previous user VM status: 1.9GiB total RAM, 1.3GiB available, 31GB disk free, no swap, currently included monthly 512GB traffic, used about 158MB at snapshot, reset 2026-10-24.

## Evidence significance

1. Existing nginx is the single public HTTP/TLS listener. Adding an isolated new `server_name pdf.gczhouwld.com` vhost is **technically plausible** with nginx's name-based virtual hosting. Creating separate public 443 listeners is wrong and would clash with the existing WeChat relay.
2. The VM can currently reach both Cloudflare API hostnames quickly. That is a strong signal the Tencent gateway can proxy these routes, but it says nothing conclusive about Chinese customer networks' ingress to Tencent DNS-only vhost until tested after provision.
3. The active sites-enabled filename `osg-wechat-relay` does not establish certificate SAN availability, certbot/ACME automation, nginx include structure, wildcard/default_server precedence, active container bound to localhost, or unused internal service port. Stage exact read-only preflight to check these before touching config.
4. Existing private-pdf.js has short-lived stateless tickets (ACCESS_TTL_MS=5min), view absolute maximum 90min, and a host-only gpdf_* continuation cookie `Secure; HttpOnly; SameSite=Strict; Path=/api/user-ui/private-pdf/file`. The failover must preserve all of these, including correctly rewriting the JSON `url` returned from /open to the Tencent hostname with no token leakage.
5. The existing capability UI checks `/api/user-ui/auth/session` using the canonical API only. A PDF file-only proxy would not solve owner capability visibility or login continuity if canonical API is blocked. Implement authorized allowlisted session/open/file and required login endpoints as a coherent unit.
6. 16-journal real PDF suite on US GitHub Actions: 36/36 stored selected PDFs authorized and rendered, not China end-user ingress acceptance. Test 14 missing October+ PDF inventory separately.

## Proposed implementation scope — **NOT YET APPROVED**

**Isolation and resilience**
- Keep existing osg-wechat-relay config unchanged. A **new** vhost config and independent localhost-bound gateway process on a non-public high port, only if nginx's current include/certificate handling is safe. Back up full config first, `nginx -t` before any reload, and restore on failed preflight; touching nginx requires explicit owner permission.
- New Cloudflare DNS **DNS-only** A record for `pdf.gczhouwld.com` to existing Tencent server; no orange cloud/proxy to avoid reintroducing same Cloudflare ingress. Use an existing valid wildcard certificate if present, otherwise free Let's Encrypt with no new recurring charge, but issuance must be shown feasible without interrupting WeChat. No new paid domain.
- A tightly allowlisted host-only HTTPS application relay for `/api/user-ui/auth/session`, required login actions, `/api/user-ui/private-pdf/status`, `/open`, `/file` (GET/HEAD/Range 206/full GET) and OPTIONS. Never generic open proxy; only exact HTTPS Cloudflare upstream origin.
- Enforce original Worker session/capability and PDF signature without bypass. Reject 401/403 explicitly; do not use local cached entitlement as security authority.
- Rewrite *only validated* short-lived file-ticket URL in `/open` to `pdf.gczhouwld.com`, preserve ticket mode and query intact; protect it from logs and Referrer. All file byte streams and cookies stay private/no-store.
- Add allowlisted alternate base to Gallery reader, owner-capability/session/login functions and CSP; robust failover on network failure only, not bypassing explicit 401/403.
- Egress safety: hard bounded monthly PDF gateway transfer quota with reservations and fail-closed before excess. Hold considerable 512GB included allowance for existing services. Stop rather than continue with extra paid bytes; ensure existing total outgoing consumption cannot be proven solely from quota snapshot.
- Tests: no secrets/URLs in logs, privacy, 401/403, no-file, signed URL, HEAD, Range 206, CORS, retries, cookie continuation, login, first/second pages, downloading, rollback; China mobile/campus/broadband and US origin separately. Avoid claiming 100% under total disconnection or blocked Tencent and Cloudflare.
- Deployment begins **only after explicit approval** for new isolated vhost, TLS certificate creation (if necessary), nginx syntax-validation/reload, new DNS-only record, and frontend rollout. This user's raw diagnostics indicate feasibility, not approval to change WeChat port bindings.

## Safeguards

Do not buy or enable new metered service, change existing WeChat relay, restart Docker/Ubuntu, change entire nginx default SSL server, modify formal literature release schedule, copy private PDF into public media, bypass user authentication or use Github.io as public site. If isolation, TLS, quota safety, or real-network tests fail, stop and report blocker, preserving current production.
