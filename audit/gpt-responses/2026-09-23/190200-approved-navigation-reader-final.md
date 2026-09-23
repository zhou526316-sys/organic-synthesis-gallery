# Approved navigation + reader-count final release

Beijing time: 2026-09-23 19:02 +08:00
Context: user explicitly approved navigation33 and reader-count repair after feedback approval gate.

Navigation:
- PR150 merge d15afca8aead58a5422f7054fde9487d0f637ce1
- PR166 merge 778740547bd1ecb7d0fc0175744e0727329b4ce9
- final local nav run 35850499048: Chromium7/7, WebKit7/7
- GitHub Pages deploy 35851005572 success
- Worker sync 35851005619 success
- final live run 35851322926: four matrices each6/6
- feedback33 apply run35851770271 success, status reviewed

Reader count:
- PR163 merge 19ca396cd5b72d8a843d200a17ca0d8fd0e45659
- atomic run35841592886: SQLite11/11, local D1 6/6
- Worker release35842249869 success
- read-only postdeploy run35842399078: markRequests0, uniquePaperReads130, summedReaderCounts130, uniqueIps18, papersWithReaders106

Audit record: audit/ui-feedback/2026-09-23-190000-approved-navigation-reader-final.json
Audit commit: 81fdacc90a7f4f1c3e4f99582a182bd33280bac4

## Final user-visible reply

**这两个已全部推进完。**

**① 回到顶部／底部：已正式上线并通过最终验收。**  
#33 先由 PR #150 完成导航逻辑，最终发布修正由 PR #166 完成，当前有效版本为 `7787405`。导航固定在页面**右侧**，不会再和左侧“吐槽”按钮重叠；长文献列表跳到底部后，会在最多约 1.5 秒的布局稳定期内校准真正的页面末端，用户滚动、触摸、按键或窗口变化会立即停止校准。

之前唯一剩下的 GitHub Pages + WebKit 问题也解决了：不是跳转逻辑错误，而是导航模块排在多个可选模块之后加载过晚。现在导航提前加载；即使后续用户模块被故意延迟 5 秒，导航仍要求在 **2.5 秒内**出现。

最终线上验收：
- GitHub Pages Chromium：**6/6**
- GitHub Pages WebKit：**6/6**
- Worker Chromium：**6/6**
- Worker WebKit：**6/6**

因此 #33 已成功标记为 **reviewed**。其余吐槽没有被顺带修改。

[手机端顶部效果](sandbox:/mnt/data/navigation-final-mobile-top.png) · [手机端底部效果](sandbox:/mnt/data/navigation-final-mobile-end.png)

**② 阅读人数防漏计：也已经上线。**  
PR #163 已合并为 `19ca396`。原来的真实漏洞是：先写入“这个 IP 看过这篇文章”，再单独增加计数；如果第二步数据库写入失败，后续同一 IP 重试会因为已经被判定为“看过”而永久少算。现在这几步放进同一个 D1 事务中，任一步失败都会整体回滚；重复打开还能根据真实 DOI×IP 记录修复缺失的物化计数，而且不会凭空增加读者。

合并前 SQLite 故障恢复 **11/11**、本地 D1 **6/6**、总质量门禁全部通过。上线后的只读检查没有发送任何测试阅读记录，目前两个 API 入口一致：
- DOI×IP 去重打开：**130**
- 去重 IP：**18**
- 有读者的论文：**106**
- 物化总计数：**130**
- 账本一致：**是**

这里也解释了为什么你仍会看到很多“1”：130 次去重打开分布在 106 篇论文上，按这个总量，**至少 82 篇现在必然只能显示 1**。所以这次修复解决了“数据库失败造成永久漏计”的漏洞，但没有为了让数字变大而补造历史阅读人数。当前规则仍然是**同一 IP 对同一 DOI 只算 1 人次**。

因此阅读人数的技术漏洞已修复，但“是否要改变统计口径”仍保留给你决定，我没有把相关吐槽直接关闭。

[本轮导航 + 阅读人数完整验收证据](sandbox:/mnt/data/navigation-reader-approved-release-evidence.zip)

本轮没有修改文献数据、抓图链路、Tampermonkey/Bridge 或其他未获批准的吐槽。