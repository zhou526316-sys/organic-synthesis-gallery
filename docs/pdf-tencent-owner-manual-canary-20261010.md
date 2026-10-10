# 2026-10-10 owner-requested Tencent PDF trial after dual transport failures

## Deployment state

- Branch: `fix/pdf-tencent-range-fallback-20261010`, PR #464 from current main.
- Independently deployed `https://pdf.gczhouwld.com` passed original Windows trusted TLS, public health, missing-ticket 401, and owner-authorized 16-byte PDF 206 canary.
- Old `main` showed real 15s `/open` authorization timeout in desktop and ~20s later Range timeout after 512KiB on Android; 16-byte success is not proof of real PDF viewing.
- This patch keeps `public/pdf-gateway-routing.json.enabled` **false**: NO automatic Tencent connection in ordinary readers.
- Opt-in only: `manualCanary:true` plus explicit viewer query `pdfIngress=tencent` enables Tencent on a single read attempt. The canonical Worker verifies each session and PDF access right before issuing the Tencent-host signed ticket; no token is shared across hosts.
- The manual canary must not silently substitute primary/backup bytes when Tencent fails; this ensures its success/failure can be independently judged.

## First-party owner test URLs (no token or DOI disclosure beyond article identity)

- Previously failing Nature Communications mobile DOI:
  https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78405-z&pdfIngress=tencent
- Previously failing JACS desktop DOI:
  https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Fjacs.6c17448&pdfIngress=tencent
- Desktop Nature Communications authorization-failure DOI:
  https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78486-w&pdfIngress=tencent

Requirements: user must open link in browser where Gallery is already signed in with `private_pdf_read`. No username, API key or signed PDF URL is required in the link. The app will independently check the actual R2-backed file readiness for that DOI; an unavailable PDF remains unavailable.

## Acceptance: not just 16 bytes

Confirm real first PDF page and second page rendered, natural continuous vertical scroll, image quality retained, and no session logout on return. Diagnostic HTML datasets safely record `privatePdfAuthorizePath=tencent`, `privatePdfFileRoute=tencent`, successful received byte counts and phase. On `pdf_transfer_timeout`, safe error remains visible; ordinary gallery page (`pdfIngress` omitted) uses the established primary/backup behavior.

Security regression: Chromium tests manual Tencent first+second page, >512KiB file Range, synthetic 403 denial, and manual configuration off. Existing SHA-256/byte-length matching applies to any automatic file splice. No cross-host file token replay, no shared unprotected PDF, no 1 MiB Range chunk size change, no PDF.js viewer replacement, no new paid server.

## Global rollout gate

Automatic `enabled:true` is NOT covered by canary acceptance alone. Require at least one actual large first/trailer Range and first+second rendered page on both desktop and separately authorized Chinese cellular mobile account; unentitled third account must receive 401/403. Respect 256 MiB/month bounded Tencent relay budget. Only after those checks is an opt-out-aware global fallback roll-out considered. Do not merge older PR420's stale viewer; this PR forward-ports onto newer main.
