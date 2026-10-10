# 2026-10-10 — Owner-only Tencent-first private-PDF pilot

Approval: user explicitly authorized administrator-account Tencent-first with Cloudflare fallback, preserving the original conservative 256MiB/month Tencent relay quota and all account rights. Do not expand to ordinary PDF readers without separate live acceptance and approval.

## Scoping and feature gates

- The first-party `public/pdf-gateway-routing.json` retains `enabled:false` for the **general** Tencent automatic route and `manualCanary:true` for the existing explicit `?pdfIngress=tencent` trial. Independent new flag `ownerPriorityPilot:true` activates only the client-side owner-preference decision; all three flags are checked against the exact `https://pdf.gczhouwld.com` origin.
- On ordinary Gallery `/pdf/?doi=...` (no explicit canary), a fresh `GET https://pdf.gczhouwld.com/api/user-ui/auth/session` with the current bearer must independently return both `private_pdf_owner` and `private_pdf_read` for Tencent to be tried FIRST. Cached account claims are at most a performance hint to skip the pilot for confirmed nonowners; cache alone can **never** enable Tencent preference.
- The Tencent gateway already passes through `/api/user-ui/auth/session` and `/api/user-ui/private-pdf/open` to the canonical Worker. The Worker verifies live session, read capability, active READY DOI, private R2 and signed ticket before any PDF can be read. This preference is not an entitlement or new access grant. Ordinary read accounts default to the existing `api.gczhouwld.com` and workers.dev fallback, even though a previously enabled explicit manual trial remains available.
- PDF downloads (`mode=download`) keep the established Cloudflare default to avoid exhausting the small pilot egress quota. This pilot changes ordinary browser reading only.
- The owner browser starts Tencent `/open` first with a 5-second bound. On **transport-only** timeout, 5xx, or monthly-quota 429, it mints a separate canonical Worker ticket and retains the existing workers.dev second fallback. A 401/403, verified PDF-unavailable status, invalid source or different document identity never authorizes a cross-host bypass.
- A Tencent PDF Range 429 (including first/trailer large Range and small PDF) switches to a separately authorized Cloudflare ticket using exact content SHA-256, length, origin and actual HTTP 206 when edge prefix verification is delayed. Already validated bytes are never mixed across different files. No repeated Tencent quota attempts after a successful Cloudflare switch in the current viewer.
- The explicit manual Tencent canary remains exclusive; it must never silently substitute Cloudflare and masquerade as a Tencent success. General `enabled:true` is **not** set by this PR.

## Cost, fail-safe and data-handling constraints

- The independently installed Tencent Python gateway on the existing shared VM uses a durable SQLite pessimistic monthly reservation of 256 * 1024 * 1024 bytes. Neither that gateway source, its quota state, its PDF copy policy nor the VM billing are altered by this project change. When its quota returns HTTP429, the owner reader switches to Cloudflare, without increasing the cap.
- The gateway remains a separate China ingress but still depends on the same Cloudflare Worker and R2 upstream. A full Worker/R2 outage cannot be hidden.
- No signed PDF tickets, session bearer, passwords, R2 object keys or DOI-level private inventory are exposed to public logs, public build artifacts, JS metrics, or reports. Client metrics contain only status, static route name and timing.
- PDF file bytes, public 08:00-only literature publishing, page count, rendered PDF quality, normal 1MiB chunk ceiling, continuous vertical scroll, WeChat/Tampermonkey, and the five-device account limit remain unchanged.
- To immediately revert owner priority, change ONLY `ownerPriorityPilot:false` and deploy Pages. Existing ordinary readers and manual canary continue unchanged. Administrator pilot is explicitly reversible.

## Acceptance hierarchy

1. Static/Node checks: origin and feature gate reject malformed status; live-session role check rejects missing owner or read capability; no account secret in the manifest; global Tencent flag remains false.
2. Chromium protected-fixture tests: a freshly entitled owner starts Tencent `/open` before canonical, renders pages 1 and 2 with continuous scroll, no Cloudflare open on Tencent success; ordinary and stale role fail over to canonical without Tencent tickets; owner Tencent HTTP429 on `/open` and on substantial PDF Range triggers independently minted Cloudflare ticket; 403 denies without fallback; mismatched PDF content remains rejected.
3. Merge/deploy gates: all required PR CI green, canonical Pages updated and Worker healthy, anonymous gateway/owner API cannot leak DOI inventory or file bytes.
4. **Real China end-user acceptance is separate from automated fixture success.** Before declaring the pilot stable or expanding beyond owner account(s), use an already signed-in owner account in the actual desktop and domestic cellular network to observe a real authorized `/open`, large first+trailer Range (not just 16B), full visible pages one and two with continuous scroll, and quota/Cloudflare recovery. Separately verify denial for nonentitled users. The assistant must never fabricate this evidence or claim universal success from R2 storage probes.

This owner-preference is limited to the website. Do not merge the old PR #420 frontend wholesale; its server gateway was deployed independently and its latest vetted reader semantics have already been forward-ported into main.
