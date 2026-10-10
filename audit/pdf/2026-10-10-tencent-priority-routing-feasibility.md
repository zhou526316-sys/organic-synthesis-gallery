# Tencent-first PDF routing feasibility — owner request (read-only review)

Review time: 2026-10-10 18:41 Asia/Shanghai.
Requested change: "既然腾讯线路那么稳定，那能不能优先腾讯线路。"
Canonical main reviewed at `a011c9870d1d1d7fc9c38173c78cbd195862e0ab`, merged PDF authorization repair PR #484. Worker + Pages deployment run evidence at time of review:
- Worker: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38045643948 — in progress.
- Another Worker run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38045648814 — pending.
- Pages: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38045643772 — in progress.
Do not claim this repair is deployed or end-user accepted before those runs actually finish.

## Verified source facts

- Current production routing manifest `public/pdf-gateway-routing.json` has `enabled:false` and `manualCanary:true` for `https://pdf.gczhouwld.com`; ordinary Gallery PDF viewer does **not** start authorization through Tencent first. `?pdfIngress=tencent` is explicit manual trial.
- `src/private-pdf-reader.mjs` starts canonical Cloudflare API and hedges workers.dev backup after 3.5s. Tencent authorization is only a later eligible candidate after 5s if globally enabled; the current enabled=false means it never starts automatically. Hence simply switching a manifest flag to `enabled:true` does NOT implement genuine Tencent-first.
- Owner live acceptance record on **unmerged** PR #420 branch `deploy/pdf-gateway/LIVE_ACCEPTANCE_2026-10-10.md` documents Tencent HTTPS and an owner-authorized 16-byte HTTP 206 PDF signature canary in ~4.4s. It does **not** demonstrate complete first/second page, first/trailer 1MiB Range completion, independent cellular account, cross-account denial, all DOI readiness, or superior availability at scale.
- The installed Tencent HTTPS gateway is a strict allowlist proxy to the **same Cloudflare Worker** for login/session/authorize/file. It does not contain an independent R2 PDF copy, so a total Cloudflare/R2 failure remains a single upstream point of failure.
- The Python relay on unmerged PR #420 branch `deploy/pdf-gateway/gateway.py` budgets **256 MiB/month** for its own traffic, atomically reserves >reported bytes for transfers, and can reject exhausted requests with status 429. This is deliberately conservative relative to the included Tencent VM plan but may be rapidly exhausted if all entitled users use it by default. It cannot guarantee the 512 GB shared VM allowance is safe without observing other VM workloads.
- Local network requests from this assistant's execution environment could not resolve either first-party PDF or API hostname; this is **not** evidence that Chinese or owner client networks are unreachable. No owner credentials or per-DOI private inventory were accessed.

## Safe proposal, not yet a production change

1. First agree on rollout scope: administrator-owned account(s) Tencent-first pilot **or** all `private_pdf_read` users. Recommend administrator cohort first, measured rollout thereafter.
2. Preserve exact authorization checks per host and per file; a 401/403 or hash mismatch is final denial, never a fallback. No cross-host signed ticket replay or mixing Range bytes.
3. In an approved pilot, attempt Tencent `/open` immediately when a trusted, first-party feature gate and owner entitlement permit it. Do not wait 3.5 or 5 seconds to start Tencent. Hedge Cloudflare on timeout/5xx/network error with an independent auth ticket; on Tencent quota-exhausted 429 switch to Cloudflare. Do not switch for 401/403. Verify HTTP 206/full PDF pages/vertical scroll, including real China cellular.
4. Add server-sided aggregate quota status (no user/DOI/URL identifiers), explicit per-user routing preference or reversible cohort flag, and a rollback switch. Do not enable the general manifest or raise 256MiB cap until current shared-VM traffic and account cohort usage are known. All changes remain zero incremental cost.
5. Keep reading 1MiB on-demand PDF Range, original image quality, current account and 5-device revocation, disabled global Tencent until signed off, and sole literature 08:00 update untouched.

## Decision needed

Ask user: "先仅让管理员账号腾讯优先，还是让所有具备 PDF 阅读权限的账号优先？"
This changes traffic budget and rollout risk materially and the project's feedback rule requires verification/decision before modifying production functionality. No Tencent routing code or flag changed during this read-only review.
