# Approved reader + navigation continuation final state

Beijing time: 2026-09-23 19:53 +08:00
Context: user said 继续 after explicitly approving reader-count and navigation33 work.
Reader fix: PR163 -> 19ca396cd5b72d8a843d200a17ca0d8fd0e45659, deployed and read-only verified.
Navigation final fix: PR171 -> 039706f1cd5bf6b49ea909d9e4c926c9dde6545a.
Navigation live acceptance: run35858462991, all four entry/browser jobs success,8/8 each.
Feedback status: not written because fresh export run35858965950 could not read D1 after free-tier row-read exhaustion; no blind reviewed-status write.

## Final user-visible reply

**这两项现在的最终状态如下：**

1. **阅读人数防漏计：已完成并上线。** PR #163 已合并为 `19ca396`，Worker 已发布。上线后的只读检查确认两个 API 入口一致，当前物化计数与真实 DOI×IP 打开账本一致；没有做历史造数，也没有改变“一篇论文同一 IP 只算 1 人次”的规则。

2. **#33 回到顶部／底部：已完成并上线。** 最终产品提交为 `039706f`（PR #171）。后续又解决了 GitHub Pages + WebKit 的两个真实启动时序问题：先是导航模块加载太晚，随后是导航先连接而 `#gallery` 还没异步插入。最终实现只在启动阶段短暂等待 `#gallery` 出现，接入现有 ResizeObserver 后立即停止监听，没有永久轮询。

最终导航验收 run `35858462991`：
- GitHub Pages Chromium：**8/8**
- GitHub Pages WebKit：**8/8**
- Worker Chromium：**8/8**
- Worker WebKit：**8/8**

合并前导航专项也为 Chromium **9/9**、WebKit **9/9**，其它原图、裁切、卡片光效、刷新成本、migration、数据校验和统一质量门禁均通过。

**目前只剩 #33 的吐槽后台状态没有改成 reviewed。** 最新导出时 D1 返回“今日免费 row read 额度已耗尽”，无法安全重新确认 #33 当前仍在 open 列表；R2 fallback 又没有这条 D1 反馈。因此我没有盲写状态。产品功能本身已经完成并上线，等 D1 读额度恢复后，只需核对并关闭 #33，不需要再改产品代码。

[手机端顶部效果](sandbox:/mnt/data/navigation33-live-mobile-top.png) · [手机端底部效果](sandbox:/mnt/data/navigation33-live-mobile-end.png)

[查看 #33 完整发布与验收证据](sandbox:/mnt/data/navigation33-release-evidence.zip)
