# GPT response — Bridge 2.2.25 live and client status

- Beijing time: 2026-09-23 21:04
- Context: TOC/body-image Tampermonkey capture continuation; Bridge 2.2.24 real-report diagnosis and Bridge 2.2.25 rollout
- Related commits: defd85608f60fbf4ff5638110a001d1d92f272a9, 6437c4e33985246fd71837cf5a5de9612474d8e5, 8b48fbb0b7af48793ec37160bcf9b275a5181795, eba52b383a3ec71175f3dce5f56d92667d11052d, 07b15561d6eef3d013271d32f5dc6bf2a6ad83bc

继续完成了。现在可以把状态明确分成两层：

**服务端/线上已经到 2.2.25，并且验收通过。** 2.2.25 已合并并成功部署到 GitHub Pages。它的核心改动不是降低图片质量门槛，而是把 ACS 正文抓取入口从容易出现空壳页的 `/doi/full/<DOI>` 改回 canonical `/doi/<DOI>`。本轮还发现两个 live verifier 残留了 2.2.24 的版本断言，我已经只修了测试契约，没有动采集逻辑；修正后专用 2.2.25 live verifier 和通用 live-progress verifier 都已经通过。

**你本机现在仍然是 2.2.24。** 最新一次真实报告读取（2026-09-23 13:02 UTC）仍没有任何 `controllerRevision=2.2.25`；报告索引已经增长到 168 个 DOI，其中 132 个 DOI 有自动报告。2.2.24 本身已经出现明确成功样本：`10.1021/acs.orglett.6c03536` 为 TOC + 正文图 3/3，`10.1021/acs.orglett.6c03508` 为 TOC + 正文图 4/4。因此主抓取链、上报链和 staging 不是整体故障。

2.2.24 的真实日志也把剩余 ACS 问题定位清楚了：`sameFigureCurrentSrcFallback` 确实在真实浏览器里运行；失败主要分成两类——高分辨率端点返回 TIFF/`application/octet-stream` 或 403，以及同 Figure 可读的 currentSrc 只有约 520 px，被现有清晰度门槛判为 low。清晰度门槛没有放松。2.2.25 先解决另一批 0/0 shell 页面问题，所以在拿到 2.2.25 真机报告之前，不应该继续做 2.2.26。

你现在需要做的就是把本机 Bridge 原位更新到 2.2.25：

https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.25

操作仍按原来的安全顺序：暂停当前抓取，等当前出版社任务页关闭；原位更新，不卸载旧脚本，不清空 Tampermonkey 存储、密钥或断点；然后刷新唯一的 Gallery 控制页并继续抓取。更新成功应看到脚本版本 **2.2.25**；内部仍显示 `captureVersion=6.2.20` 是正常的。

下一轮判断标准已经固定：只看新报告中的 `controllerRevision=2.2.25`。先比较以前出现 0/0 shell 的 ACS 文献是否恢复正文 DOM/figure discovery，再单独统计 TIFF/520 px 类失败。没有这批真机证据之前，不再继续盲升版本。
