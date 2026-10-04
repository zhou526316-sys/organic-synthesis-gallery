# 2026-10-04 20:47 Asia/Shanghai — RSC/Chem 发现覆盖与 Chem TOC 修复完成状态

修复已继续完成，结论分两部分。

## 1. Chemical Science / Green Chemistry / Chem 发现链：已修复并实测

不是“最近没有文章”，而是旧发现逻辑把真实来源记录过滤掉了。当前 main 已修复：

- verifiedThrough catch-up 现在真正扩大 Crossref/OpenAlex 查询窗口，而不是只在报告里写 catch-up；
- Crossref created/deposit 日期与正式 publication 日期分开保存；
- 年/月精度不足的日期不再伪造为 1 月 1 日或当月 1 日；
- created/deposit 新出现但 publication 日期未知/冲突的 DOI 保留为 dateUnverified，进入逐篇审核，而不是静默消失；
- 增加 raw → union collapse 守卫，原始来源明显非零而过滤后归零时必须报警；
- 未改变 canonical journal registry、activeFrom、07:05/17:05 审核时刻或 08:00/18:00 发布槽。

修复后的真实审计（audit/latest.json generatedAt=2026-10-04T12:28:59.750Z）：
- Chem：sourceRecords=9，其中现有 Gallery 1 篇，待审核缺口 8 篇；
- Chemical Science：sourceRecords=78，待审核缺口 78 篇；
- Green Chemistry：sourceRecords=41，待审核缺口 41 篇。

三刊合计 127 篇已进入 compact unresolved，不再是 0。全站当前 unresolved=152；criticalSourceFailures=0、sourceFamilyGaps=0。sourceCoverageAnomalies=4 继续保留，不用“请求成功”冒充完整覆盖。

当前 literature-update-state.json 的 verifiedThrough 仍为 2026-09-18，没有因为“候选找回”而伪装成语义审核已经闭环。生产卡片也没有因本次修复绕过固定槽直接新增。下一次既有 07:05 主审核会直接看到这些候选，合格项仍只在 08:00 固定槽发布。

发现能力已经正式提升到 audit/literature-capability.json currentKnownStable，promotion id=rsc-chem-crossref-partial-date-20261004。

## 2. Chem TOC / Elsevier 路由：修复代码已经真实上线

目标 DOI：
10.1016/j.chempr.2026.103282
Taming transient radical couplings by preassembling organophotocatalytic dyads

旧真实浏览器失败不是“找不到图片”，而是：
- 最终已经到达正确 ScienceDirect 页面：
  https://www.sciencedirect.com/science/article/pii/S2451929426003487
- 随后触发 capture_tab_job_mismatch；
- 因此在页面身份绑定阶段就失败，没有进入 TOC/正文图提取。

修复内容：
- Elsevier DOI 先解析到真实 ScienceDirect/Cell article URL；
- 只接受 sciencedirect.com / cell.com 出版社域，拒绝伪造相似域；
- 在最终出版社 URL 确定之后再附加 osg-job hash，避免 DOI/LinkingHub 跳转丢失 tab-job binding；
- 新结果记录 publisherTaskBindingRevision=20261004-elsevier-bound-task-v2；
- 对旧的 10.1016/... capture_tab_job_mismatch / bound_publisher_heartbeat_missing 仅提供一次立即 repaired-route retry，之后恢复正常退避，避免无限重试；
- DOI/page/media identity guards、capture protocol 6.2.20、controller revision 2.2.39 均未放松。

合并：
- PR #303
- merge commit 93bdf6a028b7f847c3237ebe3fdc6c6a19c3e222

线上版本：
- Bridge 2.2.43
- installRevision 6.2.25
- captureVersion 6.2.20
- publisherTaskBindingRevision 20261004-elsevier-bound-task-v2

Worker deployment run 37202774018 成功，构建日志明确：
TM220_RELEASE_ARTIFACT {"bridgeVersion":"2.2.43","captureVersion":"6.2.20","completeQueue":786,...}

GitHub Pages run 37202774088 成功，build/deploy/真实 delivery verification 均完成。

修正后的只读 live verifier run 37203269240 成功，实际从 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 读取到：
- Bridge 2.2.43
- installRevision 6.2.25
- publisherTaskBindingRevision 20261004-elsevier-bound-task-v2
- script SHA256 ee10c1ff040093aedbddbd08cf0fd6f89908dafacee7d2cde01aa20e124334d0
- queueArticles=786
- Worker capability handshake 匹配

历史 TOC retention 不再错误耦合到 installer live verifier；它由 dedicated reviewed-toc live check 独立负责。此前“reviewed TOCs unexpectedly lost”只是旧 verifier 的无关阈值导致，不能据此说新版 installer 未上线。

## 3. 当前唯一未完成项：Chem 这篇尚未产生“部署后”的真实浏览器重试

最新只读 R2/Tampermonkey acceptance run 37203244889 成功读取现有本地浏览器状态。对目标 Chem DOI，最新可见 attempt 仍是部署前：
- finishedAt=2026-10-04T11:39:04.795Z
- status=failed
- reason=capture_tab_job_mismatch
- ScienceDirect PII 页面身份正确

截至本次核验，没有出现部署后的新 Chem attempt。因此不能宣称该 TOC 已经抓到。

当前 public/toc-demand-live.json 对它仍为：
- state=no_visual
- allMissingOfficial 中仍存在
- 正文图也未补齐

服务端已经把新版 installer 和 retry 逻辑上线，但无法热替换用户已经打开的 Tampermonkey 页面实例。用户端只需确保安装/更新到 Bridge 2.2.43，并刷新或重新打开 Gallery 页面一次；新控制器会利用 one-shot repaired-route retry 自动重试该 Chem DOI，不需要改队列、不需要新增定时任务。

安装/更新入口：
https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js

## 4. 本轮没有做的事

- 没有改变 07:05/17:05 或 08:00/18:00；
- 没有新增替代定时任务；
- 没有把 127 篇找回候选直接纳入生产；
- 没有把 sourceCoverageAnomalies 清零伪装完整；
- 没有把 Chem 的 TOC 说成已经抓到；
- 没有降低 DOI、页面和图片身份验证；
- 没有用 Figure 1 冒充官方 TOC。

相关关键状态：
- main 在写本回报前：6b51a94cf1e19b4ca958e89ea4d81f468464cd95
- discovery merge: b9ee9d4ef0a36d0dd8b1ef716166cac5a94832fa
- Elsevier follow-up merge: 93bdf6a028b7f847c3237ebe3fdc6c6a19c3e222
- live installer verification: run 37203269240 success
- browser acceptance read: run 37203244889 success
- current Gallery cards: 786
- verifiedThrough: 2026-09-18
