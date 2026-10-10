# Verified owner feedback — Android mobile PDF reader receives 512 KiB then times out

Date: 2026-10-10 Beijing. Approved repair scope: PDF reader `pdf_transfer_timeout`, draft PR #464. Evidence: screenshot supplied in architecture/PDF chat; this text record does not copy any credential or signed URL.

## New mobile screenshot

- DOI: `10.1038/s41467-026-78405-z` (Nature Communications, distinct from desktop JACS `10.1021/jacs.6c17448`)
- Gallery PDF reader in mobile in-app browser; screen shows '文件传输超时' and no rendered PDF page
- `阶段: range`
- `pdf_transfer_timeout`
- Total elapsed: `20.8 s`
- Authorization: `1750 ms`
- Engine loading: `478 ms`
- Range requests: `3`
- Most recently displayed `分段响应`: `438 ms` (reader's `privatePdfRangeHeaderMs`, not evidence that every response body completed)
- Successfully accepted by PDF.js `已读字节`: `524288 B` (=512 KiB)
- Complete validated `传输字节`: `524288 B` (=512 KiB)
- `授权线路: primary` indicates `/open` route selection; does NOT reveal which file request failed
- No displayed file failover count, file route, which Range offsets timed out, or whether a later response body stalled.

## Boundaries of inference

- The selected account obtained a valid authorized PDF ticket and at least one complete Range segment; this is not the usual `not_authenticated` / `private_pdf_not_entitled` denial pattern.
- Read/parse/render still failed. The successful 16-byte Tencent canary and this separate 512KiB primary data read do not prove first page or trailer availability.
- Current production `main` reader uses only Cloudflare hostnames; feature flag `enabled:false` and draft PR #464 unmerged, so Tencent is NOT yet proven on this mobile PDF route.
- Earlier PC JACS PDF failed after 25.6s / 3 Range requests; this mobile Nature Communications failure is a second document, device and likely network, supporting a shared transport-path suspicion but NOT proving Cloudflare alone causes it.
- Mobile screenshot is an in-app browser; if it used the previously described cellular data without Wi-Fi/VPN, campus proxy/VPN alone cannot explain the cross-device errors. Connectivity and webview behavior still need discrimination.

## Approved repair's acceptance emphasis

1. Real independent primary/Tencent tickets for SAME DOI, verify SHA-256 identity and complete ≤1MiB front/trailer Range responses without logging tokens or PDF bytes; test both JACS and this Nature Communications sample if available.
2. Separately record Range headers and full body timing/length by offsets, including at least one successful 512KiB segment and the subsequent requested ranges; never infer subsequent segments succeeded from `Range: 206` headers alone.
3. Preserve 401/403 refusal, byte-identity checks, 1MiB chunk, PDF quality, continuous vertical scrolling, first and second rendered page, mobile independent account.
4. Tencent fallback source changes remain draft PR #464; no main merge or `enabled:true` until real full Range and mobile results meet the approved rollout gates.

Status: new read-only field evidence recorded. Does not authorize claiming live Tencent mobile PDF reader works.
