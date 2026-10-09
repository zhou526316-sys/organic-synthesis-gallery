# PDF Architecture continuation — final response synchronization

- Beijing time: 2026-10-09 13:23:32
- Context: Gallery architecture continuation, PR #428 continuous PDF, PR #435 bounded first-page, PR #436 live font gate, PR #420 Draft Tencent gateway
- Production merge: a9c9c0adadad3aab2f4acbac0f225995d88e3a7b
- Validator merge: dd3ed292161a3ef3e13eb2c6fbbff74a2bd905c8
- QA: Pages #37887111773 successful; PDF Vault live #37888250831 successful

## 完整用户可见回复

这轮 PDF 架构工作已完成压力验收、针对性修复，并通过正式网站交付验证。

**性能验收：**使用 128 页、5.27 MB 的模拟 PDF，在线私有阅读器只发起 4 次按需 Range 请求，没有整份下载；滚动到第 64、128 页后，最多保留 6 张页面画布。本地阅读器同样最多保留 6 张，关闭后清理画布。390 px 手机 Chromium 触控模拟可正常滑动到第 2 页，没有横向溢出。联合测试在线 **44/44**、本地 **25/25** 通过。

**已修复并上线：**发现小 PDF 下载完成后的首次解析／绘制没有等待上限，现统一加入 **45 秒的该阶段超时保护**，超时会释放阅读任务，而非无限转圈。修复已通过 [PR #435](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/435) 合入，5/5 项单元测试与 31/31 项私有 PDF 浏览器回归通过。正式 [Pages 部署 #37887111773](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37887111773) 成功；修正一项字体请求误判后，[线上 PDF 资源校验 #37888250831](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37888250831) 通过，核对了 13 个静态资源的指纹及独立字体资源。

**备用网关：**[PR #420](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420) 已与新版阅读器及超时保护对齐，差异收敛为 19 个相关文件，联合回归通过；仍保持 Draft，腾讯线路开关为 **关闭**，未擅自启用。

**尚不能认定解决的部分：**模拟两条授权线路均无响应时，阅读器约 15 秒后能明确报告超时；但这并不证明你实际 Edge／校园网络的授权已经加速。公开入口的 HTTP 200 与耗时数据来自海外 CI，不代表国内账号实测。45 秒限制的是首次 PDF 解析／绘制阶段，也不是整个下载过程的总时限。

详细证据已归档至 [PDF 架构验收记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/pdf-reader/2026-10-09-pressure-watchdog-live-verification.json)，本轮回复同步至 Git。
