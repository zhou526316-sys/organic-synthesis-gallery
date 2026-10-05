# Rolling-three-month count label and mobile feedback closeout

Beijing time: 2026-10-05 10:23 +08:00
Context: user asked whether screenshot count 772 is the recent-three-month literature count and why the scope was unlabeled, after an interrupted new-feedback repair.

## Verified architecture semantics
- shared/literature-lifecycle.mjs: LIFECYCLE_RULE=rolling-three-calendar-months-v1.
- On 2026-10-05, cutoffFor(asOfDate) is 2026-07-05.
- architecture/published-reader.mjs landing() calls reader.hot(asOfDate).
- Site quality build for PR #318 reported recordCount=797, hot=772, archive=25.
- Current all-time production membership therefore has 797 records; default Hot landing has 772.

## Scope-label implementation
- PR #318 merged as 0a04e4db232d121ef9381e5ee156b116bf481a93.
- Default architecture landing displays “近三个月 · N 篇文献 / Last 3 months · N papers shown”.
- Search, journal selection/exclusion, only-new, custom dates, or DOI deep links display “当前筛选 · N 篇文献 / Current filter · N papers shown”.
- Architecture frontend tests: 4/4 passed, including Hot landing, Archive deep link, global search, and historical date filter.
- Site quality gate 37254125047: success.
- GitHub Pages deployment 37254594743: success.
- Worker frontend deployment 37254601463: success.
- Initial sync verification 37254594793 attempt 1 failed because Pages was still publishing; attempt 2 succeeded after Pages completed.
- Live canonical bundle https://gallery.gczhouwld.com/assets/main-04OT8aEr.js was read after deployment and contains “近三个月”, “当前筛选”, and the rolling-window explanation.
- Cloudflare Pages fallback remains independently affected by its existing API-token issue; canonical Gallery and Worker are deployed.

## Feedback #38/#39 closeout
- PR #314 merged as f5cbf0c56723ce96c6a24fabc99deeba66504c68.
- Dedicated Mobile entry and TOC regression passed.
- PR #314 deployments: Worker 37253084251 success, sync 37253077912 success, GitHub Pages 37253077895 success.
- #38: mobile near-screen media batch capped at 6, smaller preload window, near-visible TOC images eager/high-priority.
- #39 screenshot: ACS 403 is a publisher/in-app-browser access restriction. No access control was bypassed. Mobile title/DOI entry now opens Gallery summary first; explicit “Open original” remains available.
- Read-only closeout export 37254895196 showed exactly 14 opens: #38, #39 plus the known paused 12; no additional new feedback.
- Apply run 37255102605 succeeded: updated=2, failed=0; #38/#39 -> reviewed.
- Remaining open count=12, exact paused baseline preserved.

## Final user-visible reply

是的。你截图里的 **772 篇**就是默认首页当前的**近三个月文献**，不是全库总数。

现在这套架构的准确状态是：
- **近三个月：772 篇**，按首次在线发表日期计算；
- **当前滚动窗口：2026-07-05 ～ 2026-10-05**；
- **全库：797 篇**；
- 因此目前有 **25 篇**已经进入历史 Archive，但仍保留在库里，可以通过搜索、DOI 或历史日期筛选调出来。

你指出的“没有标识”确实是 UI 问题，我已经修了。现在默认首页会直接显示：

**近三个月 · 772 篇文献**

只要进行了搜索、期刊筛选、“仅新增”、历史日期筛选，或者打开历史 DOI，标识就会自动变成：

**当前筛选 · N 篇文献**

不会再让人误以为 772 是全站总量。对应 PR **#318** 已合并，主站 GitHub Pages 和 Worker 都已经部署成功；我也直接检查了 `gallery.gczhouwld.com` 当前线上主包，已经包含“近三个月 / 当前筛选”的新文案。

另外，刚才中断前的两个新吐槽也已经收尾：
- **#38 手机端 TOC 加载慢**：手机首轮只加载屏幕附近最多 6 篇，首屏 TOC 改为高优先级加载；
- **#39 ACS 403**：这是出版社在微信/内置浏览器中的访问限制，不是 DOI 错链。现在手机点击标题/DOI 会先留在 Gallery 打开摘要，不再直接把用户送进 ACS 的 403 页面；需要访问出版社时再明确点击“打开原文”。

#38、#39 都已经标记为 **reviewed**。当前只剩原来的 **12 条旧吐槽**继续暂停。
