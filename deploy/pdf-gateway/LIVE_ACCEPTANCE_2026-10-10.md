# Real Tencent PDF gateway acceptance — 2026-10-10

## LIVE owner account authorized Range 206 evidence — 2026-10-10

The owner supplied a screenshot of the **actual browser Console result** from
the reviewed canary running on the Gallery origin against Tencent ingress:

| Field | Observed value |
|---|---|
| gatewayHealth | HTTP200_verified |
| authorizeHTTP | 200 |
| available | true |
| fileHTTP | 206 |
| range206 | true |
| pdfMagic | true |
| error | none |
| elapsedMs | 4400 |
| session | not_checked (script leaves placeholder; not an authentication error) |

Assessment: LIVE PASS for this logged-in account + this known stored DOI:
Gateway reachability, authorized `open` response and first **16 actual PDF
bytes** with `Content-Range` and `%PDF-` magic verified through the Tencent
HTTPS ingress. This upgrades Stage B from 'simulated' to 'live observed'.
`elapsedMs` covers health + authorization + 16-byte Range and is NOT
PDF page render, full download or throughput benchmarking.

**Still pending (no implied success):** phone cellular from the separately
authorized second account, denial from a truly unauthorized account,
revoked-session isolation, multiple real PDF ranges/trailer, page 1/page 2
and continuous scrolling, native open, and download. Unentitled account
negative test must not be confused with a second entitled account.
Production feature flag must remain `enabled:false` and PR #420 remain
unmerged until current main-compatible integration and approval.
No DOI, tokens, signed URL, cookies or PDF bytes were stored in this report.

---

## Verified live deployment (not yet enabled in Gallery)

The owner installed the independent HTTPS gateway on the EXISTING Tencent VM. Its
single SSH installer reported `LOCAL_GATEWAY_READY`, `LOCAL_TLS_SNI_PASS`,
`[SUCCESS]`, `[WINDOWS HTTPS PASS]` (200, trusted TLS, exact origin CORS, 1396ms),
and `[WINDOWS SECURITY PASS]` (file request **without a signed ticket** -> 401).
This proves independent HTTPS gateway installation and anonymous ingress checks
but does not prove authorized file transfer or cross-account isolation.

**Do not enable general Gallery routing yet.** `public/pdf-gateway-routing.json`
in the feature branch remains `enabled:false`; PR #420 is unmerged. The current
`main` reader is ahead of the feature branch, including separate 2026-10-10
authorization-body and range-transfer patches. Port isolated gateway logic onto
the latest main later; never wholesale-merge stale reader code.

## Stage A: anonymous independent network check

On a Chinese mobile device, disable Wi-Fi and any system VPN/proxy. Using
mobile-cellular data, open:

https://pdf.gczhouwld.com/_pdf_gateway_health

Expected HTTP 200 and JSON exactly identifying `{ok:true,
role:'private-pdf-ingress',authenticated:false}`. This checks only transport
and TLS. It is **not** evidence that private PDF Range transfer works.
Do not share any signed/private PDF URLs, QR login links or credentials.

## Stage B: authorized owner Range 206 (without printing secrets)

From a laptop/desktop browser already logged into
`https://gallery.gczhouwld.com`, open the browser developer console (F12).
Review and paste ONLY the audited source:

https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/feature/owner-private-pdf-dual-ingress-20261008/deploy/pdf-gateway/owner-acceptance-console.js

The script refuses a non-Gallery origin, prompts for an actual stored-paper
DOI, reads the current user's session from same-origin localStorage, and
sends it solely to the FIRST-PARTY `https://pdf.gczhouwld.com` gateway,
where the canonical Worker still checks entitlements. It requests only
16 bytes via `Range: bytes=0-15` and verifies 206, Content-Range and `%PDF-`.
It prints only fixed status fields and total timing in console.table;
NEVER the bearer, signed file URL, DOI, cookies or PDF body. It does not
download or save the PDF or enable failover. The inspected source should
show exact allowed origins before anyone runs it.

Pass criterion: `gatewayHealth=HTTP200_verified`, `authorizeHTTP=200`,
`available=true`, `fileHTTP=206`, `range206=true`, `pdfMagic=true`.
HTTP 401 on authorize means session authentication; HTTP 403 may mean
entitlement/role; `available=false` is an actual readiness/missing DOI
condition, NOT a network failure; `open_timeout` suggests origin auth;
`file_timeout`/network error after authorization suggests file transfer or CORS.
Do not report success from mere HTTP 200 on /health.

## Stage C: mobile and account isolation

Phone with a SECOND separately authorized account must be checked on
its own cellular connection. Do not test that account using the primary
owner's cookie/ticket; verify its session and capabilities separately.
A mobile health-200 is only connectivity evidence. Until a mobile-friendly
same-origin canary exists, ordinary Gallery PDF opening may use the canonical
Cloudflare route because the Tencent reader integration is still disabled;
do not mislabel that traffic as Tencent validation.

Cross-account isolation needs: an unauthorized account denied at open (403)
and valid owner-specific signed tickets must not work after origin
session revocation according to Worker contract. Anonymous file 401 only
proves rejection of requests without a ticket. Never paste a signed ticket
into chats, public logs or a third-party tester.

## Stage D: actual reader functionality and deployment gate

After authorized Range 206 passes, validate first and second PDF page,
continuous vertical scroll, native PDF open and download with a representative
Oct-1+ stored paper, as well as re-login/return without forced logout. Record
timings separately for authorization, 206 first 16 bytes, page 1 and page 2.
Do not change PDF chunk size, quality or existing viewer while diagnosing.

Respect the Tencent gateway's pessimistic 256MiB/month egress reservation:
a 16-byte canary is intentionally small. Full-download tests are only for
confirmed entitled accounts. Mainland access does not remove dependence
on upstream Cloudflare authentication/storage, and fallback cannot guarantee
availability during a total origin outage. No extra paid service.

Activation is separate: current main frontend must first receive a
forward-ported, regression-tested version of the disabled fallback path;
only after real owner file, denied account, mobile-cellular and China
network tests pass should `enabled:true` be considered. Do not merge PR420
wholesale or alter 08:00 literature publication workflows.
