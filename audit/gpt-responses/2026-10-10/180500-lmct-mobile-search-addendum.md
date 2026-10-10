# 2026-10-10 18:05 Asia/Shanghai — LMCT mobile-search continuation addendum

Conversation context: User said “继续” in ongoing Organic Synthesis Gallery LMCT search repair.

Additional completed work since response log audit/gpt-responses/2026-10-10/180218-lmct-search-mobile-recovery.md:

- Inspected the newly introduced `tests/architecture-frontend.spec.ts` regression on the repair PR #485 and identified an invalid assumption: local preview is served at `127.0.0.1:4174` and deliberately routes catalog search through same-origin API; failover to `api.gczhouwld.com` then `workers.dev` is enabled **only** on real non-localhost hosts, so a local preview cannot prove first-party failover.
- PR [#487](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/487) merged to main as `0061f77e18f5fa779bbf12ac43c7dd91a41fb738`. Removed the invalid production-origin assertion from localhost preview while keeping the meaningful failure-recovery regression; production browser matrix still tests actual Gallery hostname. No production search logic or literature data was changed.
- PR [#485](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/485) had previously merged as `1acfd9924e663db840229d89cfda3dd66ea1b625`:
  * Public literature health + indexed view use first-party `api.gczhouwld.com` and bounded fallback `workers.dev`.
  * Index transport errors no longer permanently disable D1; bounded retries and visible incomplete metadata-only warning prevent misleading definitive nine-result mobile count.
  * Existing 938 DOI membership, 887 abstracts, reviewed descriptions and 08:00 sole release rule unchanged.
- Post-merge deploy monitoring at 2026-10-10 18:05 Beijing: the Pages workflow `https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38043354801` was **in_progress**, and a newer Pages workflow for #487 `https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38043641565` was **pending**. Worker deployment `https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38043381788` was **in_progress**. No final mobile post-deploy pass is verified. Do not claim production completed based only on merge or event creation.
- Baseline D1 API/desktop checks before this repair: 11 LMCT, 11 bilingual equivalent, 11 手性磷酸, 23 轴手性; 938 registered DOI and 887 original scholarly abstracts. Original mobile LMCT 11 works, but a two-request `net::ERR_FAILED` event in prior build caused 轴手性 temporary static fallback nine. PR #485 addresses this vulnerability in source; post-deploy proof is outstanding.

Terminal user-visible response should say: “移动端索引掉线问题的修复和回归测试已合并：PR #485、#487。稳定索引已核实 LMCT 11 篇和原始摘要 887/938；正式网页上的桌面 LMCT 11、手机 LMCT 11 已实际验证。对手机连续切换查询导致的 net::ERR_FAILED，新增独立 API 域名优先、备用入口和有限恢复，并对不完整的静态结果给予警示。新的 Pages 和 Worker 部署仍在运行/排队，尚不能宣布这项移动端恢复已线上通过。用户可点击所列链接查看实时结果。” This status is intentionally candid, not a guarantee of future delivery.

GitHub response synchronization for this addendum completed with immutable markdown in audit/gpt-responses.
