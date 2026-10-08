# Tampermonkey approval follow-up and concurrent production release status
Beijing time 2026-10-08 18:59:37 +08:00
User approved same-job final-first report ordering, as well as previously approved RSC and inventory repair. On current main another project window already committed release 5944b25b1285017d590fcd7c3beceb8a69ff87b1 ("release(tm): Bridge 2.2.72 report-order, RSC and inventory recovery"). Avoid duplicate code changes.
Draft PR #416 head bb1344dba8d42973073c5fac88c1e559bee8013a has 25/25 pull-request CI success; PR remains draft/unmerged although equivalent code was committed to main directly.
Live official installer read-only verification: https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js and https://api.gczhouwld.com/gallery-vpn-bridge.user.js both return 2.2.72, new RSC media functions and cooldown. Main Worker importTampermonkeyReport now deduplicates job event and preserves effective final report against a delayed progress record; owner-PDF unknown state preserved. API health ok.
Production postdeployment checks contain various failed run statuses, including Tampermonkey October 1 live acceptance; do NOT claim all production tests passed or owner-authenticated publisher capture resolved. CI 25/25 is source/PR testing only.
No functional changes made in this chat after approval, to avoid conflict with parallel released changes.
## User-facing reply
已核实：**你刚批准的回执去重与终态优先修复，已由并行工作合入正式版 2.2.72**，因此我没有重复提交同一批修改。

- 同一论文任务的重复最终回执不再累加为多次访问／失败；同一任务的迟到进度记录不再覆盖最终结果。
- RSC 的新版页面图源处理和库存超时／分批核验也包含在这次更新中。
- 相关分支 **25/25 项代码回归通过**，并且我已确认主站与 API 的正式安装地址都返回 **2.2.72**。

**[正式版 2.2.72 更新链接](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js)**

但需要明确：部分上线后验收工作流仍报错，尚无足够证据证明校园 VPN 下所有 RSC 图片和 PDF 缺项已抓取成功。**2.2.72 已上线，不等于所有抓取问题已解决。** 建议只在当前浏览器正常更新一次，不用清数据；之后上传一份新的 TOC 日志即可核实真实效果。