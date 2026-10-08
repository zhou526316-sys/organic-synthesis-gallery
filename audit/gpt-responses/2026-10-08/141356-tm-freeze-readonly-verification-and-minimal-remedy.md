# Tampermonkey freeze and read-only regression verification

Beijing time: 2026-10-08 14:13:56 +08:00
Conversation context: user replied “可以” to previously proposed Tampermonkey freeze, read-only version comparison, and later user-approved minimal repair.
Mode: READ-ONLY diagnosis, no Tampermonkey source changes, no browser publication or media capture, no owner token use, no PDF inventory writes. This new audit log is the only Git write in this turn.

## Verified source evidence

1. Baseline `639957f612ee83e866a9d3b4e7fa8524618f10ff` (previous Bridge 2.2.68) and live `main` (2.2.70/6.2.51) both contain:
   - `PUBLISHER_ACCESS_COOLDOWN_MS = 30*60*1000`;
   - publisher-wide GM cooldown from access gate;
   - pre-dispatch `publisherAccessCooling(job)` marking `candidate.state='blocked'` and incrementing skipped without publisher visit.
   Thus it is a pre-existing fault, not introduced by 2.2.70.
2. In current `public/toc-mainline.user.js`, the only explicit pre-dispatch blocked assignment is the cooldown at line ~4934. The other `row.state='blocked'` transitions occur in `coverageRemaining` after a publisher attempt, which increments `row.attempts`. A screenshot showing 23 blocked/0 attempts is specifically consistent with publisher access cooldown preventing dispatch, not 23 failed publisher visits. Exact trigger origins are not proven without client GM diagnostics.
3. PR #407 changed Oct-1 `addedDate` scheduling and server-verified owner PDF inventory; 13 protected publisher extraction methods stayed unchanged relative to 2.2.68. A static source-preservation test cannot measure publisher task dispatch in a real persistent GM profile.
4. `scripts/test-tm-oct1-scope-contract.mjs` sets `GM_getValue:()=>null`; queue coverage fixture also does not seed publisher-wide GM cooldown then assert no false closure. Existing deployment acceptance checked installers/API access but sent no real authenticated publisher capture.
5. Owner PDF: the 2026-10-07 recorded status `audit/architecture/private-pdf-phase3-readable-20261007.json` shows 154 verified readable/active PDFs out of 163 then-known target records (9 capture gaps); not a live Oct-8 scope of 177. Current `readOwnerPdfInventory` returns unknown whenever lease is absent or inventory batches fail; unknown does not equal missing nor lost. `public/private-pdf-owner-setup.html` has a separate “授权本浏览器抓取 PDF（7 天）” step after account owner capability check.
6. The 2026-10-08 08:00 historic capture diagnostic records ACS JOC image shortages, some 403 high-res links, one >6 minute image-stage delay, RSC access gate, Elsevier figure successes but 400 evidence provenance. Current main DOES already contain source-level Elsevier evidenceArticleUrl fix, RSC articlehtml opportunistic routing, ACS viewer candidate parser and a bounded 24s image-upload budget. Their LIVE effectiveness remains unproven; do not re-repair without fresh evidence.
7. No evidence current protected publisher core selectors became worse as a result of the 2.2.70 scope/PDF merge. The urgent reproducible end-user regression is the previously untested publisher-level cooldown state reporting/dispatch path.

## Proposed narrowly scoped repair, HOLD FOR USER'S EXPLICIT APPROVAL

A. Separate `deferred_by_access_cooldown` from `blocked_after_visit`, preserve DOI pending needs and expiry, continue unaffected publishers, schedule bounded safe retry at expiry while active without bypassing legitimate restrictions.
B. Display real opened/attempted count, deferred count, per-publisher reason and cooldown expiry; never emit “已遍历全部待办” for 0/23. Ensure a real access gate doesn't trigger 23 fake attempts.
C. Display missing/expired private owner lease separately from inventory request failure, ready/pending/failed/missing/unknown; keep “unknown” closed to download.
D. Add deterministic cross-version regressions that inject persistent publisher cooldown into real scheduler fixture (all deferred, mixed publishers, expiration, 0 actual attempts), plus owner PDF leased/stored/missing/unknown. Gate release on field acceptance from authorized desktop with actual publisher-job dispatch and stored receipts.

Do NOT change existing journal scope, 08:00 literature publication, old PDF corpus, current captured images, passwords, auth or cooldown storage until specifically authorized. Do NOT deploy or claim working update link on simulated tests.

## User-visible partial reply 1

已开始进行版本对照。这次发现一个重要细节：

**“出版社冷却后直接把任务标记为受阻”的问题，在 2.2.68 中就已经存在，并非 2.2.70 才引入。**

因此，不能简单认定最新版的抓取算法退化，也不应该直接回滚。2.2.70 主要改变了 10 月 1 日后的任务范围和 PDF 库存判断，必须进一步确认这些变化是否放大了旧版调度问题。

这次诊断将区分两件事：**任务为什么没有启动，以及启动以后能否成功抓取。** 两者需要分别验证。

## User-visible partial reply 2

另外，查到 10 月 8 日早上的实际抓取诊断记录，说明问题不止调度一个环节：

- **ACS**：部分 JOC 文献只抓到 2/4 或 1/6 张正文图；低分辨率候选图被拒绝，高分辨率下载又遇到 403。
- **Chem（Elsevier）**：两篇文献分别成功取得 14/14 和 7/7 张正文图，但全文提交出现 `publisher_source_mismatch`。
- **RSC**：已有任务因出版社访问验证而停止，尚不能据此判断正文图片识别代码是否有效。
- **上传阶段**：一篇 ACS 文献的图片发现只用了约 8 秒，但整篇处理耗时约 6 分钟，日志显示主要延迟发生在上传和暂存。

这表明现有抓取器并非完全没有能力；实际问题分布在任务调度、出版社访问、高质量图获取、全文提交和上传回执几个环节。后续必须逐项恢复，不能用一次大规模改版代替排障。

## User-visible final reply

本轮只读核查已经完成，找到了一条明确的故障链：

**当前“23 篇受阻、0 次尝试”不是 23 篇论文抓取失败，而是旧的出版社级访问冷却在任务打开前阻止了派发。** 30 分钟冷却会持续保存在 Tampermonkey 中；重新点击“立即开始”并不会自动清除。现有代码仍把这些根本未访问的文献记作 `blocked`，最后错误显示“已遍历全部待办”。

还有两个需要区别对待的情况：

- **PDF 的 177 篇“未知”不能算缺失。** 10 月 7 日留下的权威验收记录为 154 篇 PDF 已通过验证、9 篇待抓（当时 163 篇的范围）；不能直接套用到 10 月 8 日的 177 篇。现行 PDF 库存查询要求本浏览器另行取得 owner 授权，缺少授权或者请求失败都会出现“未知”。
- **早上的 ACS、RSC、Elsevier 和上传问题不能重复盲修。** 当前源码已经含有部分针对性修改，包括 Elsevier 的文章来源 URL、RSC 的全文路由、ACS viewer 解析与上传时间预算，但还缺少修改后的真实出版社抓取回执，不能宣称已经解决。

建议下一步只批准一个小范围修复批次：把冷却任务改为“等待重试”，继续运行不受冷却影响的出版社；准确显示实际访问数和冷却原因；将 PDF 授权缺失与库存真正缺失分开；为“23 篇等待、0 次访问”增加回归测试。真实 401/403/429 访问限制继续尊重，不通过频繁请求绕过。

**本轮未修改抓取代码、没有重置授权或历史回执、也没有发布新安装包。** 请确认是否批准这个“调度状态＋库存提示＋针对性测试”的最小修复批次。批准后再实施，并以你授权浏览器里的真实抓取结果作为上线验收，而不是只看 CI 通过。
