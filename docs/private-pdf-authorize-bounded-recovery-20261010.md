# Private PDF authorization timeout remediation — 2026-10-10

## Scope and observed problem

Owner-provided screenshot (2026-10-10 17:40 Asia/Shanghai) reports `authorize · pdf_authorize_timeout · 15.0s`, primary no response after 15011ms, backup no response after 11508ms, primary retry and Tencent not started. The public health GET 200 and deliberately invalid-authorized POST 401 do **not** prove an actual entitled `/open` is working. The 938-DOI owner inventory and first 120/120 internal R2 object head/tail probes do **not** prove public client `/open`, 206, first page or second page.

## Bounded fix and security invariants

1. The authorized `/open` uses the real D1 session hash lookup and `private_pdf_read` capability; it now passes `touch:false` to skip only optional last-seen device metadata writes. Regular authentication/session endpoints retain their normal device touch behavior. Revoked or expired sessions are still denied; the 5-device limit is not changed.
2. The three mandatory D1 reads (session, capability, selected active READY PDF) are bounded to 4500ms each and a shared 9000ms stage deadline. A hung D1 lookup yields fail-closed 503, never a forged ticket or a permission bypass. Requests can still fail earlier on an invalid/denied session.
3. R2 16-byte PDF prefix verification is attempted as normal, with a 1800ms budget. On a proven invalid header, bad length, missing object or timely R2 error, the original fail-closed statuses apply. On **timeout only**, the server may mint the independently signed, owner-entitled ticket but must return `headerVerified:false`; this is *not* R2 validation evidence.
4. For `headerVerified:false` the browser verifies a **real, authenticated** GET Range `bytes=0-15`, HTTP 206, accurate content-range/length, `application/pdf` and `%PDF-`. Transport failure only (timeout, TypeError, 429/5xx) can trigger one further independent `/open` on a different allowlisted Worker host, always with its own freshly minted signed ticket, exact document SHA-256/length/host and a new true 206 preflight. Mismatched identity, corrupt bytes, 401/403/404 and invalid Range are never bypassed.
5. Manual Tencent remains an explicit `pdfIngress=tencent` canary; `public/pdf-gateway-routing.json.enabled:false` is unchanged. General Tencent automatic failover is not authorized by this change and still requires separate real desktop and domestic cellular acceptance and relay budget review.
6. A temporary, server-side entitlement-gated, strictly allowlisted `Server-Timing` diagnostic can identify D1 and R2 delays; it is automatically disabled after **2026-10-12 18:00 Asia/Shanghai** regardless of env flag. Only phase names and rounded durations appear; never user IDs, DOI, cookies, bearer credentials, ticket URLs or R2 keys. Broad invocation traces remain disabled.

## Regression and production acceptance

- Node Worker fixtures: no blocking optional last-seen updates; R2 stall returns unverified ticket promptly; true 206 remains required; bad object/header stays denied; hung D1 returns 503; owner/account isolation and revocation continue to pass.
- Chromium: deferred R2 with primary 16-byte preflight 503 obtains an independently authorized, identity-matched backup and renders pages 1 and 2 with natural vertical scrolling; file 403 and mismatched SHA explicitly deny backup bytes. Previously verified fast path and native reading must remain stable.
- Runtime `/open` failure must never be declared fixed solely from R2 storage probes, anonymous 401, compiler checks or mocked browser runs. Live acceptance additionally requires at least one real owner-authorized `/open`, signed real 206 bytes, full visible first+second pages and continuous scrolling from the owner's actual network; target a small representative sample rather than hundreds of manual opens. Independently check an unentitled account remains rejected.
- Do not change the sole daily 08:00 literature publishing slot, PDF 1 MiB Range chunking, figure quality, PDF files, historical scraping or WeChat.

## CI scope preflight and upstream merge-base correction

- The first site-quality run on the PDF PR inherited a stale local architecture browser test expecting workers.dev failover on localhost. This environment assumption was independently corrected by the separate search team's merged [PR #487](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/487), whose quality gate passed. Recheck the PDF PR against updated canonical main; do not change search code, disable the site-quality gate, or treat the old test's failure as a private-PDF authorization result.
- The PDF-specific regression [#38043563955](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38043563955) passed the live-session stall protections, R2 deferral/206 correctness, 53/53 Chromium fixtures and Worker dry-run on its tested head. This is still not end-user live authorization proof.

This is a targeted independent repair of reader authorization. PR #473's audit-table snapshot changes are separate and should not be bundled or misrepresented as browser-read fixes.
