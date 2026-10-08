# Existing Tencent Cloud Lighthouse resource screenshot — PDF proxy feasibility

Checked: 2026-10-08T19:27:26.435+08:00
Scope: Owner-only PDF alternate gateway using existing Tencent Ubuntu instance with **¥0 incremental paid** services. Read-only screenshot interpretation, DNS context and public vendor billing documentation. No production changes or remote access claimed.

## User-provided console snapshot

| Metric | Observed | Interpretation |
| --- | --- | --- |
| Included monthly transfer | 512 GB | Existing package allowance; does **not** mean unlimited, and additional traffic can exhaust shared quota. |
| Transfer used | 158.0 MB, UI reads 0.03% | ~511.85 GB nominal headroom, as of screenshot only. |
| Allowance reset | 2026-10-24 00:38:43 in UI | Timezone not explicitly identified in screenshot; dashboard local context likely China. |
| CPU | 2 cores, momentary 0.966% utilization | Appears underloaded at capture time, not evidence of sustained 24h capacity. |
| Memory | 2 GB, dashboard shows 415 MB usage | Nominal ~1.585 GB free, actual Linux available can differ due to page cache. |
| Disk | 40 GB, 7.3 GB used, 18.4% | Nominal 32.7 GB unused. |
| Operating system | Ubuntu Server 22.04 LTS 64 bit | Appropriate for isolated low-memory reverse proxy without storing PDFs. |
| Addressing | Tencent instance has public IPv4 and private IPv4, public IPv6 toggle enabled | Never persist literal IP/credentials in public test artifact. |
| Tencent integrated domain | Dashboard displays “未设置域名” | This describes Tencent panel integration, not necessarily public DNS: Cloudflare DNS already resolves relay.gczhouwld.com to Tencent public IP. |
| Snapshot public throughput | Near idle | Instantaneous value only, cannot infer peak/limit. |
| Resource location | **Not visible in screenshot** | Public GeoIP previously indicates Hong Kong but Tencent authoritative region still must be checked from console. |

## Verified official charging rule

Tencent Cloud Lighthouse subscription transfer package meters **public outbound traffic only**; when the included cap is exceeded the extra traffic is charged separately, typically hourly. Official:
https://cloud.tencent.com/document/product/1207/44368
https://cloud.tencent.com/document/product/1207/44569

Given 158 MB used of 512 GB, a **small, strictly limited owner-only PDF streaming gateway** looks plausible using the **existing** package, with no new package required. Do not claim it is free regardless of volume: combined use of the existing WeChat relay and the new PDF service remains on the same allowance, and billing may occur if total exceeds quota.

## Proposed no-cost architecture conditional on host checks and explicit implementation authorization

1. New `pdf.gczhouwld.com` DNS-only A record to the existing VM, reusing the existing domain without purchasing anything, with ACME/Let's Encrypt certificate if compatible with current 443 listener; **do not change existing relay.gczhouwld.com**.
2. Install or reuse a small, resource-constrained HTTPS reverse-proxy component as an isolated vhost/service only if existing 80/443 listener and certificate automation allow safe separation. No restart of current WeChat relay without separate explicit permission.
3. Allowlist exclusively owner-session, private-pdf/status/open/file endpoints; upstream remains existing Cloudflare Worker for DB/R2/private-pdf-read entitlement validation. Properly rewrite signed file URLs for gateway host, support Range 206, HEAD, PDF.js, browser native, CORS and cookies, strictly private no-store; reject public access/bypass, never log token or PDF bytes.
4. Set strict bounded usage for the gateway before any traffic (concurrency and egress guard) and stop the backup service before consuming unsafe monthly quota. Provider alerts supplement but are not a reliable hard stop. Leave substantial allowance for existing service.
5. Stage read-only VM checks first: `ss -ltn` 80/443, `systemctl is-active nginx caddy apache2 docker`, `free -h`, `df -h /`, unauthenticated `curl` to production API and backup health checks. No config files, passwords, API keys or private user session information should be shared.
6. Distinct China client/carrier and overseas acceptance tests, owner-only security + disabled access on failed entitlement, first/second pages, download, no additional subscription and automated fallback. No claim of 100% on totally disconnected networks or global upstream failures.

## Exact boundary now

**Feasible on paper but not authorized nor proven live:** Host 80/443 ownership, TLS chain, CPU/RAM during load, cloud-console instance region, monthly quota hard guard configuration, server-to-Cloudflare access, domestic client-to-HK reliability all remain unverified. We have no Tencent VM SSH or console session. Do not deploy or modify active WeChat service. The user's screenshot alone supports resource feasibility, not end-to-end delivery.
