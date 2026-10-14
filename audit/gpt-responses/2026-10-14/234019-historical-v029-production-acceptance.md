# Organic Synthesis Gallery · 历史正文 v0.2.9 正式部署、许可证误判与真实回执核验

北京时间：2026-10-14 23:40:19
用户最后指令：“继续”
任务：承接用户已批准的 `0.2.9` 历史正文出版社页面自动关闭／许可证待核实问题，验证代码、正式 Pages/Worker 部署、线上安装器以及新版本的真实浏览器诊断。

## 当前窗口对用户已显示的回复与验收数据

### 历史正文 0.2.9 已正式上线

此前阻塞发布的 Pages 版本校验问题已解决。
- [Pages 正式部署 #38542762375](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38542762375)：授权、构建、部署全部通过。
- Gallery 主域名 `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js` 实际读回 `@version 0.2.9`。
- API 备用域名 `https://api.gczhouwld.com/gallery-historical-text-pilot.user.js` 实际读回 `@version 0.2.9`。
- 双域名脚本源码提取内容均可核实 `historic-body-evidence-v029`、`license_pending_load`、`BATCH_MAX_REVIEW_TABS=2`、`batchFinishPublisherTab(batchTab,result,paper.doi)` 和 `BATCH_PUBLISHER_PROBE_MS=9500`；不再包含过早 `maxProbeMs=3200`。
- 正式 installer `@downloadURL` 指向 Gallery 主域名。
- [原修复 PR #655](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/655) 合并 `d3de024c8ea5956e6a2d0a14bd9b9e339bd24188`；[Pages 门禁修复 PR #658](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/658) 合并 `db5993f9fa64af343ece5807e0bba2147cfe103e`。
- [Worker 生产部署 #38537558817](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558817) 成功；原始历史 Chromium 测试 [#38536659217](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38536659217) 及 Pages 修复 PR 的全部五条 CI 包括 site-quality [#38541768926](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38541768926) 全部成功。

### 最新诊断结果

只读 [管理员诊断运行 #38590898670](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38590898670) 成功读取最近 200 条元数据事件，归并 133 次真实尝试。
- `publisher_script_not_confirmed`: 62
- `license_not_verified`: 41
- `page_http_error`: 21，真实观察 HTTP 403
- `body_missing`: 6
- `timeout`: 2
- `saved_local`: 1
- HTTP 200: 48；403: 21；unknown: 64（不能猜测 HTTP 错误）。

**全部最新200条事件仍来自旧版 `0.2.8`，没有任何 `0.2.9` 的真正用户浏览器回执。** 因此已经确认“正式部署 + 自动化浏览器测试通过”，尚未证明用户的 Edge/Chrome 完成一次真实新版本重抓，不能宣称全库许可证待核实或正文缺项已解决。

### 用户的本机验收步骤

1. 在 Edge/Chrome 的 Tampermonkey 安装或覆盖主域名 `0.2.9`（两浏览器各自升级），回到 Gallery 刷新。
2. 先使用旧 UI 的「跨期刊正文证据核验（12篇）」做有限、逐 DOI 的出版社真实复验；**12 是诊断抽样，不是全站总额**。该测试应能暴露此次许可证异步加载与自动关页问题是否真实改善，并保留最多2个待核实文章页供人工检查。
3. 之后使用「一键补抓全部缺项」继续覆盖历史出版社页面，使用「全库开放正文补抓（本机）」核查所有正式 DOI 的官方 OA 正文来源；无20篇全站限制。本机有权保存与正式公网可搜全文是两种不同状态。
4. 在「失败详情／服务器报告」检查实际 `0.2.9` 回执（已保存本机管理员诊断密钥时不应重新输入）；有真实403、NC/ND、无许可的仍不得被当作合格可持久化文本。脚本未启动与版权无权也必须区分。
5. 如无任何 `0.2.9` 上报，应核查 Tampermonkey 实际安装版本和用户浏览器侧脚本权限、Diagnostics outbox 发送状态，而不能把旧 `0.2.8` 事件归咎于当前修复。

永久审计文档：
`audit/historical-body-review/2026-10-14-v029-production-installer-and-private-diagnostics-acceptance.md`
Commit `aa2a8121a86d8c961e553e637c6facacadafb639`。

### 交付结论

- `production_deployed_and_static_checked=true`
- `synthetic_browser_gate_passed=true`
- `real_operator_v029_publisher_replay_confirmed=false`
- `all_formal_fulltext_complete=false`

绝不把上线、目录母数、技术性模拟或诊断事件数冒充实际已取得文章正文／授权／全站公共 FTS 的数量。
