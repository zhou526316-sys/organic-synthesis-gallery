# Organic Synthesis Gallery — History recovery (interim Git sync)

Beijing time: 2026-10-11T01:54:04 (Asia/Shanghai)
Context: User approved restoring 23:00 historical GitHub collection and 23:40 independent review.
Authoritative repository: `zhou526316-sys/organic-synthesis-gallery`; snapshot main `afb3ef4a2b6574007fdf75e224bb83e71199f61c`.

## Completed, with real evidence
- Restored existing ChatGPT scheduled automation "Gallery 历史回溯验收", ID `6ac9de345ca081918a8bc5871e111e3c`, to `is_enabled=true`; exact 23:40 Asia/Shanghai schedule and prompt unchanged.
- Identified no historical collector schedule run at 2026-10-10 23:00; staging previously held completed=[], attempts=[], lastRun=null.
- PR #532 merged successfully as commit `72a4bb3b4434955a947e5519620b0ef8a517ac94`; retained 23:00 schedule, added deduplicated 23:09 backup and narrow main-only push trigger for one-time historical staging recovery. Historical 8/8, Tampermonkey, PDF, and complete site quality CI passed.
- Actual push-triggered collector #38073396190 launched at 2026-10-11 01:50:46 Beijing, but **failed before reaching network capture** in staging branch merge step: `fatal: empty ident name`. Runner lacked Git user identity before `git merge origin/main`; the identity existed later in the commit step.
- PR #533 [https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/533] created with a strictly one-file change setting the existing staging bot user.name/email before the merge. Historical regression succeeded; PDF/Tampermonkey regressions succeeded; site-quality browser suite was still running at this interim report.
- Production formal literature marker remains 938 cards; eight authoritative protected blob SHAs unchanged. The collector has not yet written a true batch or new article into production, and PR #499 split-window enhancements remain a separate unmerged draft.

## No false completion claims
- Scheduled task reactivation is true; no actual 23:40 run has yet occurred after reactivation.
- The first push-run is a real GHA run but failed before Crossref/OpenAlex, so it is NOT a successful real historical crawl.
- PR #533 must finish its quality gate before merge, followed by a new narrowly controlled push trigger and direct staging readback. Do not treat unit tests as source coverage.
- Keep 08:00 as the sole formal daily new-paper admission. July–September 2026 retrospective acquisitions remain TOC-only and older papers metadata-only; never collect new historical body/PDF, modify authoritative literature data or count historic candidates as Today's New.

## User-visible partial answer synchronized
23:40 历史回溯验收任务已重新启用；GitHub 的 23:00 采集配置原本未产生实际执行。PR #532 修复了定时触发与兜底去重，全部相关门禁通过并已合并。第一次受控运行 #38073396190 真正开始，但在合并 staging 之前因 `fatal: empty ident name` 失败，没有联网采集。已提交只调整 Git 身份配置顺序的 PR #533，审核完成后需要重新真实触发并验收。
