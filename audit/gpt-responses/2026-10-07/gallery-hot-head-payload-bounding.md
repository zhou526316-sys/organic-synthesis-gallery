Beijing time: 2026-10-07 00:32 +08:00
Context: Gallery architecture / startup and TOC performance optimization
Related commits: f7e2c662e76b7e446436af471f48c4021ee2adbb, 758e775fc1cf2092dfc6b1a1dbd7121a6fbc7aa6, 9da386f9dc4746e52b254f5ee0ae8f47e575b282, ca3d28973b0e921d9a65efaea0bb8ed2be2284b1, 758589a288418267e7a3824c5afae3f256ca06d6, f465ec16694802261bcb22bc126414eae000e315, 4e4de2068f4a87ada1d567c3900d46c2d51cb0e1

User-visible reply:

这一批做得更完整一些，主要继续压缩首屏数据量，而不是只减少 DOM。

正式域名在上一版上线后实测约 5.01 秒，相比最初约 8.35 秒已经下降约 40%，并确认首页从 60 张降到了 24 张。本轮又完成：
- 架构发布包新增 hash-bound Hot head：首屏只携带 24 篇桌面窗口数据，并附紧凑日期桶用于计算完整 Hot 数量；完整 3 个月快照不再是首屏依赖。
- 后台全历史 membership/catalog 初始化不再顺手下载完整 Hot；只有翻第 2 页、按阅读数/最早排序、期刊/新增筛选等确实需要更多 Hot 数据时，才按需加载完整兼容快照。
- 删除了 Hot head 和完整架构读取末尾重复请求 release-delivery.json 的重检；对象已经由同一 delivery/release 的 content hash 绑定并逐对象验哈希，因此这一额外网络往返是冗余的。
- 修正了分页里的旧 RESULT_WINDOW_SIZE 运行时引用，并将共享桌面窗口基准正式固定为 24；手机仍为 2 张/页。
- 修复 frontend-worker-sync 的 run ID 解析：上一版 sed 多转义了一层，得到字面量 \1；现在已改为真实 run ID，后续同步不会再因为这个原因误报失败。
- CURRENT-CONTRACT 已明确：以后不仅 DOM 必须 bounded，首屏 Hot 网络 payload 也必须 bounded；完整 Hot fallback 只能作为按需兼容路径，不能重新回到 first paint。

发布状态方面，上一版 Worker run 37496068090 已成功。包含最新 Hot-head 架构的 GitHub Pages run 37496536894 当前处于 pending；新的 Worker run 37496282352 正在运行。这里我停止继续提交和轮询，避免因为每次 push 把同类 Pages 部署取消重启，也避免聊天再次超时。

因此，当前已经从“60 卡片 + 全 Hot 数据 + 串行架构读取”推进到“24/2 卡片 + 24 篇 Hot 首屏对象 + 后台全历史初始化 + 按需完整 Hot”。下一轮只需要等当前最新 Pages 构建接棒后做一次正式测速和失败项检查，不需要再重做这一套架构。