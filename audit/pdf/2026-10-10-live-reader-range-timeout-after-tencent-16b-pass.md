# Read-only investigation: production PDF reader Range timeout despite live Tencent 16-byte proof

Date: 2026-10-10 (Beijing). Chat context: architecture and private PDF owner reader; new user feedback (pending explicit repair approval).

## User observation

User tested multiple PDFs in Gallery, none shown readable in supplied screenshots. One representative screenshot of actual document `10.1021/jacs.6c17448` shows a blank reader with status '正在按需读取目录和第一页…'. Failure screen displays:

- phase `parse`
- error `pdf_transfer_timeout`
- elapsed `25.6 s`
- authorization `2943 ms`
- PDF engine loading `507 ms`
- 3 file range requests
- authorization path `primary`
- no displayed successfully completed range bytes, file failover count or Range header duration

Important: `授权线路:primary` identifies auth endpoint selection, not proof of which file-origin requests completed.

## Code verification on main

- `src/private-pdf-reader.mjs`: `API_BASE=https://api.gczhouwld.com`, `API_BACKUP=https://organic-synthesis-gallery.zhou526316.workers.dev`; **no Tencent origin in main**.
- Range-first flow `prefetchPdfBoundaryRanges` requests front and trailer ranges, `PDFDataRangeTransport` requests additional ranges, first attempt timeout 12s, fallback 15s, 45s first-page watchdog.
- `fetchValidatedPdfRange` requires exact HTTP206 Content-Range and complete `arrayBuffer()` of requested byte interval. Failure is surfaced as transfer error in `parse` phase before successful first page.
- `privatePdfAuthorizePath=primary` only tracks /open. Successful validated file failover increments `privatePdfFileFailovers`; this is not shown in screenshot. Absence of display alone does not determine why no failover succeeded.
- PR #455 already merged supports backup Worker host only when exact SHA-256 and size identity are preserved. Both primary and backup still reach the same Cloudflare Worker/R2 origin infrastructure; a failed China-to-Cloudflare file path may affect both.
- Independent Tencent ingress on PR #420 successfully deployed; HTTPS external Windows 200/CORS, unauthenticated missing ticket 401, and one owner's live authorised 16-byte file Range206/`%PDF-` test passed. **No large Range, first-page/second-page or mobile account success established**. Flag remains `enabled:false`; PR420 unmerged and its reader code lags main.
- Cloudflare Worker `private-pdf.js` /file route reads R2 with Range and returns streaming `object.body`; small-range success does not prove larger body delivery.

## Confirmation level

Confirmed: user-visible file-transfer failure in normal production reader, not an authorization or PDF engine load timeout; current production reader does not directly use Tencent gateway; 16-byte canary cannot validate the actual large-Range PDF.js reading workflow.

Not yet proven: which specific range (front/trailer/on-demand) hung or its HTTP status, file host after possible failover, precise transport failure point, whether a specific device/network caused it, how Tencent handles 256KiB-1MiB complete Range responses, and genuine multiple account performance.

## Proposed read-only comparison and repair gate

1. For the same confirmed-stored DOI and same authorised account, compare *separately minted* signed file tickets for canonical Worker and Tencent gateway; measure small and realistic Range response completion (headers/body, complete Content-Range), without disclosing URLs or private bytes. Never replay signed token cross-host.
2. Verify ByteLength+contentHash exact match and permission handling; no fallthrough on 401/403 or mismatched content, preserve no-ticket 401.
3. After explicit approval, forward-port only Tencent file-routing/diagnostic logic onto latest main (not wholesale PR420), preserve continuous vertical scroll, file integrity, image quality, current Range chunk size, account-session security, and 256MiB/month gateway budget.
4. Run isolated plus real owner first/second page and second-account mobile-cellular tests, only then consider route enabled:true under a protected rollout decision. Keep unrelated 08:00 literature publication, Tampermonkey and WeChat untouched.

Current disposition: confirmed new feedback, **repair approval pending**. This is documentation only; no repair code, merge or production routing change.
