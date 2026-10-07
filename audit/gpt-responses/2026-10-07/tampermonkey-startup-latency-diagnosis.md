# Tampermonkey startup latency diagnosis

Date: 2026-10-07
User report: after pressing “立即开始任务（只补缺项）”, the panel stays at “正在核对已有图片、全文和 PDF 库存” with no active DOI and 0/0 counts.

Read-only diagnosis; no code change in this turn.

Findings:
- Current public demand has 859 articles.
- runManualFromHead() does not dispatch a publisher DOI until readMissingCaptureInventory() completes.
- Startup inventory reconciliation waits on four inventory classes together: media inventory, TOC inventory, staged body-figure inventory, and private full-text evidence inventory.
- Media inventory is split into chunks of 250. At 859 articles that is four POST batches, executed as two sequential rounds of two parallel requests.
- GET/POST inventory metadata uses native browser fetch first. GET/media-read timeouts are 45s; private evidence timeout is 30s. If native transport fails, the same request is then tried through GM transport. safe() can retry the whole operation once after 1.5s for transient failures.
- Therefore a single 45s inventory operation can consume about 90s before one attempt fails, and about 181.5s with the retry. Four media chunks in two sequential rounds can theoretically hold startup for roughly six minutes when a transport stalls.
- The panel displays 0/0 until the full Promise.all inventory reconciliation returns, so “0 gaps” during this phase is not a completed inventory result.
- The per-run inventory cache is newly allocated for each restarted manual run, so pressing immediate restart cannot use the previous run's verified inventory to begin quickly.

Recommended fix, pending user approval:
1. Reuse a recent verified inventory snapshot as a provisional startup cache; fresh reconciliation still runs before declaring all-resolved.
2. For 859 current DOIs, reduce media inventory from four 250-DOI requests to one bounded request while still below the Worker 1200-DOI cap, with fallback chunking if necessary.
3. Replace serial long native→GM timeout behavior for read-only inventory calls with a bounded hedged transport / short startup budget, preserving unknown state rather than treating timeout as complete.
4. Show per-layer startup progress/timing (media / TOC / figures / evidence) so a slow layer is visible immediately.

No implementation was made because project feedback rules require explicit approval before changing a newly reported issue.
