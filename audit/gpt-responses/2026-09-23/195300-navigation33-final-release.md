# Navigation33 final release response

Beijing time: 2026-09-23 19:53 +08:00
Context: user explicitly approved continuing feedback33.
Final product release: 039706f1cd5bf6b49ea909d9e4c926c9dde6545a (PR171).
Audit record: audit/ui-feedback/2026-09-23-195300-navigation33-final-release.json, commit f6c29a26334eed19bea03e88ccf5762912635ecc.
Final live run: 35858462991, four jobs all success, 8/8 each.
Feedback reviewed-status write intentionally not attempted because fresh export run35858965950 could not read D1 after free-tier row-read exhaustion.

## Final user-visible reply

**#33“回到顶部／底部”已经完成并上线。** 最终产品提交为 `039706f`（PR #171），GitHub Pages 和 Worker 两个主入口都已部署成功。

这次把最后一个 WebKit 启动时序问题解决了：导航可能先加载，而文献卡片列表 `#gallery` 稍后才异步出现。现在只在启动阶段临时监听 `#gallery` 的出现，出现后立即接入现有 ResizeObserver 并停止该监听；**没有永久 DOM 监听、没有轮询**。之前的右侧布局、顶部/底部跳转、长列表 1.5 秒有限校准、用户操作立即取消校准、弹窗/图片查看器打开时隐藏等行为保持不变。

合并前，导航专项为 **Chromium 9/9、WebKit 9/9**，0 failed/skipped/flaky；原图、裁切、卡片光效、刷新成本、migration、数据校验和统一质量门禁也全部通过。

上线后的最终验收 run `35858462991`：

| 入口 | Chromium | WebKit |
|---|---:|---:|
| GitHub Pages | **8/8** | **8/8** |
| Worker | **8/8** | **8/8** |

也就是说，之前反复失败的 **GitHub Pages + WebKit 已经最终通过**。线上测试拦截了 API 写请求，没有制造真实阅读人数。

反馈后台还有一个纯管理层面的尾巴：我刷新 #33 状态前，D1 返回“今日免费 row read 额度已耗尽”，因此无法安全再次确认当前 open 列表；R2 fallback 又没有这条 D1 反馈。所以我**没有盲目把 #33 写成 reviewed**。产品功能已经完成，只是反馈状态同步暂缓，等 D1 读额度恢复后再核对并只关闭 #33。

[查看手机端顶部效果](sandbox:/mnt/data/navigation33-live-mobile-top.png) · [查看手机端底部效果](sandbox:/mnt/data/navigation33-live-mobile-end.png)

[查看 #33 完整测试、线上验收和失败演进证据](sandbox:/mnt/data/navigation33-release-evidence.zip)
