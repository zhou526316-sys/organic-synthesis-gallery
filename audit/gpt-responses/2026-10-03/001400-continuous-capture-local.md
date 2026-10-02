# Tampermonkey continuous capture response

Beijing time: 2026-10-03T00:14:00+08:00
User request: 抓取任务不要分批，直接抓到底。
Read baseline main: fa99a1115003381347f77bb76b8f1c30e56b3100. Before-edit TOC blob verified locally and through GitHub: 1c9bad4783d5ff9495973e31f4f15b05b3e68468.
The repair branch fix/tm-continuous-20261003 was created, but the subsequent source-patch create_file call was blocked by the connector. No source changes were committed, merged or deployed. This record documents the local delivery only; it does not retry or carry the blocked source modification.
Local installer: gallery-vpn-bridge-continuous-v5.user.js, 275701 bytes, SHA256 6ad10bbf3f0a9466baaed8721d80d19767e433e3fe91795e3f03099c6afb9575. Compatible controller2.2.39/protocol6.2.20. Exact baseline embedded source was replaced inside the verified v4 bundle using the existing packaging transformations; the wrapper/runtime were unchanged. Standard builder's legacy AppDeploy dependency was unreachable. Local syntax/installer-contract validation and155 unit tests passed. Offline Chromium mock ran61missing tasks under one run ID, including a failure at21 followed by continued processing to61, with no console/page/request errors. The attempted live-origin navigation was administrator-blocked; the later browser check was entirely offline and did not access that origin. No actual installed user browser or publisher/VPN success is claimed.

## Progress messages

我会把抓取改成一次启动连续处理整个缺项队列：不再按固定篇数结束一批；单篇失败就跳过继续，直到没有可执行的缺项，或你主动暂停。最新文献优先的顺序不变，图片的网页发布规则也不改。

当前主入口已经会遍历缺项队列，但旧的“每批数量”入口还在，而且单篇文章仍有一次最多处理20张新正文图的限制。我已把启动入口统一到连续补缺模式，并补上“单篇因超时未处理完时，保留已存图片并自动接着处理”的逻辑；没有新进展的失败项不会反复卡住队列。

连续补缺版已生成，已验证超过20篇后会继续往下处理，单篇43张正文图也不会因张数限制截断。不过，这次仓库写入被工具拦截，线上更新链接尚未切换；我会提供可直接导入 Tampermonkey 的脚本文件，不把本地完成说成已经部署。

## Final reply

**已做成连续补缺版：点击一次“立即开始任务（只补缺项）”，就持续处理整个缺项队列，不再按8篇、20篇分批结束，也不需要你再点“下一批”。** 单篇失败会记录后跳过，继续处理后面的文献；你仍可随时暂停。

**[下载：Tampermonkey 连续补缺5脚本](sandbox:/mnt/data/gallery-vpn-bridge-continuous-v5.user.js)**

将文件导入 Tampermonkey，**覆盖现有同名脚本，不要先卸载或清空数据**。刷新文献库页面，确认面板标题包含 **“连续到底5”**，再点“立即开始任务（只补缺项）”。版本号仍为2.2.39。

这份保留“只补缺项”和“网站最新更新优先”的规则，并取消连续模式下单篇20张新正文图的数量截断。因单篇超时而未处理完、且已有有效保存进展的，会保留断点自动接着补；没有新进展的失败项不会无限重试拖住整个队列。出版社必要的访问间隔仍然遵守，网页图片的发布规则不变。

**本次尚未部署到线上：GitHub代码写入被工具拦截，因此请使用上面的文件，不要把原网页安装链接当作这次更新。** 本地155项测试已通过；离线浏览器测试也验证了一次处理61篇、第21篇失败后仍继续到队尾。你电脑上的实际抓取效果尚未验证。
