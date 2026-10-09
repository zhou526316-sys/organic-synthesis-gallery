# Gallery Architecture — PDF 连续滚动与备用网关整合

- 时间：2026-10-09 12:54:17 (北京时间)
- 聊天任务：架构续作 / PR #428 连续滚动 / PR #420 腾讯备用网关
- 整合提交：`abd7258a3e469689078008d03963dfef4725cd74`
- 工作流：`37885705594`、`37885710952`、`37885710967`
- 范围：仅 PR #420 隔离分支集成；未改变 main 站点代码或启用备援

## 向用户回复正文

已接续，并完成本轮 PDF 架构整合，**没有直接修改正式网站**。

**已完成：**我把尚未合并的腾讯备用网关 PR #420 与已经上线的连续滚动 PR #428 合并到同一隔离开发分支，生成 [整合提交 abd7258](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/abd7258a3e469689078008d03963dfef4725cd74)。以最新 `main` 的 PDF.js 连续阅读器为基线，保留在线／本地纵向滚动、页码、缩放、下载、原图框选、Range 按需读取和退出账号后的画布清理；仅整合备用网关的鉴权、文件传输和下载回退。旧单页翻页器没有被带回。

**验证结果：**[联合浏览器回归](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37885705594) 已成功，覆盖腾讯线路不可用与故障切换、401/403/429 不得绕过、滚动到第二页及本地 PDF 阅读。独立的[私有 PDF 权限回归](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37885710952)和[本地 PDF 回归](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37885710967)同样通过。PR #420 已设为 **Draft**，路由配置仍是 `enabled: false`，不能误合并或启用；微信 relay、生产 DNS、腾讯云配置和账号权限都未改动。

**仍需解决的事项：**你实际 Edge／校园网络中的授权超时尚未验收，不能称为修复；390px 手机布局已通过浏览器测试，但真实手机手势和几十至上百页 PDF 的长期画布占用仍缺现场或压力验收。另外，代码审查发现普通小 PDF 的第一页解析／绘制等待缺少与大文件 Range 模式对等的超时边界，这是待核实的性能风险，并非已经证实的用户端故障。本轮没有擅自修改 `main` 的该路径。三个月冷热分流架构也保持原状，没有被本次 PDF 变更触及。

[查看 PR #420 的整合记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420)。接下来应优先针对授权耗时和大页数 PDF 做真实网络与压力验收，确认问题后再修复和部署。
