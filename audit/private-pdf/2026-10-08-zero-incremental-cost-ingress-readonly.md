# Cross-network owner PDF access — zero-incremental-cost feasibility

**Status:** Public DNS, official documentation and repository read-only checks only. No deployment or console access. Implementation approval still pending.  
**Captured:** 2026-10-08T19:05:33.577+08:00 (Asia/Shanghai).  
**Budget constraint:** **¥0 additional cost** — no new instance, payment, metered overage, free trial converting into a paid plan, or non-included use of existing services.

## Facts verified

| Layer | Read-only evidence | Implication |
|---|---|---|
| Parent zone | Public DNS NS = tessa.ns.cloudflare.com / lynn.ns.cloudflare.com | Zone uses Cloudflare-authoritative DNS; does not establish Cloudflare account plan or remaining free limits. |
| Gallery site | gallery.gczhouwld.com public CNAME -> zhou526316-sys.github.io | Static GitHub Pages site; adding a same-origin Worker route would require changing routing/proxying and could disturb the main site. Not authorized. |
| API | api.gczhouwld.com resolves to Cloudflare anycast (observed 104.21.51.70, 172.67.176.241). | Current API ingress is Cloudflare. Existing workers.dev alternative does not provide an independent ingress provider. |
| Tencent relay | relay.gczhouwld.com public A = 43.135.32.73, public IP geolocation provider identifies Tencent AS132203 in Hong Kong. | Existing independent public hostname/hosting vendor appears to be Tencent HK. Public geolocation does **not** prove cloud-console region or compute/traffic available. |
| Suggested spare hostname | pdf.gczhouwld.com A record publicly NXDOMAIN at check time | Candidate is not currently configured; cannot be considered operational. |
| Existing relay HTTPS | Root HTTPS request returns 404 | No evidence root has an index route. Do not treat this as WeChat relay outage, and do not probe protected relay endpoints. |
| Current owner PDF | main src/private-pdf-reader.mjs uses api.gczhouwld.com and workers.dev, same Cloudflare Worker/D1/R2; 15s deadline | A third Cloudflare hostname or increasing timeout alone does not meet independent-route requirement. |
| Owner UI capability | main src/private-pdf-access.ts refreshes /api/user-ui/auth/session exclusively on api.gczhouwld.com | Alternate channel must preserve account/session/capability checks, open, Range file, download and cookie continuation, not merely PDF file download. |

Sources: public DNS JSON from dns.google/resolve; public IP registration from ipinfo.io/43.135.32.73/json (public routing/location only); repo source main; Cloudflare Workers Routing docs https://developers.cloudflare.com/workers/configuration/routing/routes/ and https://developers.cloudflare.com/workers/configuration/routing/custom-domains/.

## Main cost blocker, verified from official documentation

Tencent Cloud Lighthouse generally charges for public outbound traffic exceeding the monthly package, even when there is no new server purchase:
https://cloud.tencent.cn/document/product/1207/44368 .
Tencent's package and monthly usage are not readable from public DNS, public instance IP or the repository. Do **not** assume the instance has free spare traffic. Intra-package usage is not equivalent to permanently zero incremental cost unless monitoring and hard admission/egress limits prevent overage. Monthly usage from WeChat and other processes shares the bill. Rate-limit and stop the PDF relay before the safely reserved amount; ordinary provider alerts alone do not guarantee no charges.
Cloudflare also publishes free usage limits for Workers/R2 (https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/r2/pricing/) — account's actual plan, current usage, and overage configuration must be established before adding load.

## Feasible designs ranked

**Candidate 1, zero-new-vendor but not independent:** Existing Cloudflare Worker with an additional same-origin/allowed hostname or Cloudflare DNS/Worker route; no purchase but still same CDN, so fails the requirement for independent internet ingress if Cloudflare routing is blocked. Do not make GitHub Pages hostname orange-clouded without staged front-end regression and explicit approval.

**Candidate 2, preferred conditional independent route:** If the existing Hong Kong Tencent relay has adequate *currently included* outbound traffic, stable TLS/ports and safe process isolation, create a new DNS-only `pdf.gczhouwld.com` virtual host on the same VM with a separate service, resource limits, redacted logs, per-user capability enforced by the authoritative Cloudflare upstream, and an allowlist restricted to owner-auth/session, private-pdf/status/open/file routes only. Preserve CORS, 206, HEAD, signed-ticket URL gateway rewriting, HttpOnly native-reading continuation, no-store and no public bucket. Automatic browser fallback only after both code and real mainland carrier path acceptance; fail closed when budget cap or upstream is unavailable. No existing WeChat relay process changes unless user separately authorizes.

**Candidate 3, if Candidate 2 fails:** Do not silently replace with a paid VPS, CDN, third-party relay, second storage, paid DNS or trials. Report no-cost feasibility blocker. Keep existing Cloudflare and optional local encrypted caching as an independent separately-approved design.

## Essential unknowns

1. Tencent Lighthouse product plan, cloud-console region, present month's total outbound included quota/used/remaining and whether extra data overage billing is on. No Tencent Cloud management connector / logged-in console access is available in this chat.
2. VM's actual CPU, RAM, disk free, 80/443 process ownership and reverse proxy service, TLS renewal, and safe isolation ability.
3. Tencent VM -> Cloudflare canonical private API connection latency and reliability; cannot infer from GitHub Actions US runner or public HTTPS root.
4. Real Chinese-mobile/campus/ISP end-to-end route performance and browser owner experience; not measured.
5. Existing Cloudflare Workers/D1/R2 plan and included quota; public DNS cannot prove headroom.

## Next information needed (no credential upload)

A *redacted screenshot* of Tencent Cloud Console -> Lighthouse/轻量应用服务器 -> instance **套餐/流量使用情况** and **实例规格/地域** (hide account identifier, public IP and billing identifiers if desired); only region, type, CPU/RAM, included monthly traffic, already used traffic, bandwidth and expiry/renewal state need to be visible. This does not grant permission to modify the VM. Existing relay SSL/process details can be gathered in a later separate read-only console operation, if explicitly approved and available.

## Constraints

- Owner-only `private_pdf_read` must remain enforced by the authoritative Worker/D1. No public storage or bypass.
- No changes to existing WeChat official-account relay `relay.gczhouwld.com`, SSL, DNS or production process; no hidden DNS cutover.
- No changes to 08:00 publication tasks, literature scope, TOC capture, or media inventories.
- No extra charge whatsoever; availability must be reported with its network test scope, no claims of 100% for total Internet outages.
