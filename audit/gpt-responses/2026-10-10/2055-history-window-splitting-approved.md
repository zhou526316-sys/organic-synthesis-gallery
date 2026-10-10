# Organic Synthesis Gallery — historical archive resume / approved split implementation
- Beijing timestamp: 2026-10-10T20:53:15+08:00
- Chat/task: user confirmation “可以” to the historical-archive follow-up work proposed in preceding message
- Sole production authority: `main`; baseline at this audit: `7c519a23661feb6668092aeef7658c4a880a5cfe`
- Tracking issue: https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498
- Draft implementation: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/499
- Latest implementation/test commit before audit: `0c75859e45c21d58b29628be7f9d03495f8ba6bc`
- Scope: No production `main` change, no historical first-run collector rollout, no PDF/TOC/figure modification, no archive admission.
 
## Verified baseline and guardrails
- Previously merged PRs #468, #492, #495 provide retrospective TOC-only policy, independent 23:00 candidate staging, and repaired historical title queue.
- Latest observed published catalog contains 938 unique DOI; July–September 2026 contains 733 `toc_only` records with 0 blank queue titles. 118 lack verified official TOC: 107 fallback_only and 11 no_visual.
- The historical staging initial state had 0 completed journal/window units; first real GitHub scheduled discovery is tonight 23:00 Asia/Shanghai, with an independently enabled 23:40 review automation. No collection success is claimed ahead of that run.
- Formal new-article release remains exactly 08:00 Asia/Shanghai. Retrospective candidates must never become Daily New, Hot, Today's count, or WeChat daily new. July–September gets only publisher TOC acquisition; earlier historic items are metadata_only.
- The historical collector reads production DOI membership but stages only candidate metadata to `staging/historical-archive-nightly`. It must not modify protected literature sources, media or PDF objects.

## Changes executed
- Created draft PR #499 on independent feature branch `feature/history-resumable-window-splitting-20261010`.
- Added inclusive UTC date-window bisection for strictly detected Crossref/OpenAlex pagination truncation. Non-truncation source failures, including HTTP 429, remain blocked.
- Historical staging checkpoints store each source-complete subwindow; only after every leaf succeeds is the parent aggregated into a root DOI batch with deduplication and evidence references. Root completion remains false for partial source coverage.
- The scheduled 23:00 workflow, input defaults, and publication path were deliberately not changed or merged, protecting the first unchanged production baseline.
- Existing tests retained; nine mocked Node tests pass, including long source pagination, restart after first leaf, 429 fail-closed and protection of public DOI catalog/marker.
- GitHub Actions evidence: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38053428068 — success, 9/9 tests, no failures. At audit time other related PR actions include separate Tampermonkey/PDF regressions success; site-quality browser validation may still be in progress and must be read back before claiming full CI closure.

## Outstanding
- PR #499 is a **draft**, not merged/deployed; schedule unchanged. It prevents infinite repeat on genuinely truncated source windows after later rollout, but does not by itself eliminate the present default `MAX_UNITS=8` (~920 uninterrupted nights / 7360 root units to 1850). Raising throughput needs real source rate-limit/timing measurements and safe founding-year bounds.
- Metadata-only historical candidate discovery is not formal scoped literature admission or all-time searchable indexing. Reviewed DOI admission, complete citation/legally displayable abstract handling, chemical terms/Chinese English search and 3-month hot/cold architecture remain under Issue #498.
- Attempted read-only direct fetch of official online `toc-demand-live.json` and `toc-mainline.user.js` with available browser reading returned inaccessible/disabled; do not infer successful live static-queue HTTP readback from this.
- The first 23:00 historical collector batch and 23:40 review outcomes were not executed in this conversation, and no future result is promised.

## User-visible answer (substantially as delivered)
已按批准范围推进历史文献回溯优化。

**新建 [PR #499](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/499)**，解决历史抓取中一个确定的问题：当 Crossref 或 OpenAlex 的结果超过分页上限时，自动缩小日期范围、保存断点，并在全部子窗口完成后才确认原始窗口抓取完整。

已完成的专项验证：8 项历史采集回归测试全部通过；Tampermonkey 期刊兼容性测试通过；私有 PDF 采集回归测试通过；正常采集、失败重试、DOI 去重和历史 staging 隔离规则均保留。

[查看专项 CI 记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38053094070)

PR #499 目前保留为草稿，尚未合并或部署。今晚 23:00 首次历史采集仍使用原版程序，避免未经真实运行验证就改变生产链路。

随后补充了模拟 HTTP 429 的一项集成回归，历史采集专项测试变为 **9/9 全部通过**，检查确保来源限流时游标不推进、缺口不误标为已抓取、正式目录不被修改。最终 CI 和第一次线上采集需要分别验收。

当前仅完成与审批相关的开发/测试准备。尚未完成真实历史回溯、摘要全文检索或变更生产采集速度。
