# PDF 私有授权及正式浏览器端到端实测：同步本聊天回复

北京时间：2026-10-08T16:02:02.916+08:00
项目聊天：用户再次要求“继续”；希望 AI 独立判断真实 PDF 能否打开及需要多久，而非反复要求截图。

## 本轮已向用户发送的部分回复

## 后台实测结果：PDF 文件本身正常

已经在 GitHub Actions 中通过生产 Cloudflare D1/R2 检查 DOI `10.1021/acs.orglett.6c03725`。真实 PDF 长度 1,905,180 字节（约 1.82 MiB），R2 读取耗时 1.53 s，PDF SHA-256 与记录完全一致。PDF.js 成功解析 6 页、第一页解析耗时 262ms，文件并非损坏或对象缺失。

已完成的脚本日志：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37746080240

## 已验证：完整授权链在独立测试环境中可以打开

首次使用有效期 120 秒的合成账号运行生产 D1/Worker/R2，正式线路授权 335ms、备用 325ms，完整 PDF GET 90ms，PDF.js 第一页解析 235ms。临时用户、session 和 capability 均已完全清理；GitHub Actions 运行成功。
证据：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37746601483

## 实测进一步确认：正式网页也能正常打开

再次使用短期合成会话直接启动真正的 Chromium 读取 https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Facs.orglett.6c03725：
- `real_gallery_chromium_page.status=ready`
- `firstPageRendered=true`
- `readyMs=1095`
- `authorizationMs=449`
- `fileTransferMs=228`
- `totalMs=1401`
- `successRoute=primary`
- `networkRangeCount=5`
- 主线授权 HTTP200 / 367ms，备用 HTTP200 / 303ms
- 第一页 PDF.js 解析 266ms
- `cleanupVerified=true`, workflow final cleanup `ok=true`
- 无真实账户权限变化，无日志中的会话令牌、R2 路径或签名 PDF URL。

证据：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37746872305

测试代码保存在独立分支 `diag/pdf-owner-live-verification-20261008`，两个测试均由一次性 GitHub Actions 执行，未将新测试或任何数据更改合并至生产 main。生产 PDF 授权逻辑无变更；被测试的目标是当前真实线上站点，所有临时数据清除。

## 尚未验证的环节

- 仅能够证明美国/外部 GitHub Actions 的真实端到端能力，不能虚构中国校内 Edge/Clash Verge Rev/aTrust/VPN 的网络可达性及实际会话。
- 15s `authorize` / `both-failed` 更符合特定客户端网络链路/代理/CORS 预检故障，但用户专属 session/某次 D1 后端异常未被直接排除。
- 没有用户本人授权令牌，也没有远程控制其本地 Edge 浏览器的已登录状态，因此不能认定用户的问题“已解决”或“也只需要1秒”。
- 无需再反复测试或截图；若后续需要确认唯一环节，可在用户浏览器现有脱敏诊断页测量真实环境或获得经用户允许的屏幕/网络调试连接；应避免收集令牌。

## 计划最终对用户的结论

我已经替你实际测过，而不是只跑模拟测试：这篇 PDF 在真实生产授权链、完整下载和真正的 Chromium Gallery 页面中全部可以打开，Chromium 首屏约1.10秒，总流程1.40秒。两次测试的临时账号均已清理。

因此不能再把 PDF 损坏、R2 存储、PDF.js 或面向所有用户的 Worker 授权视为主要故障。剩下高度可疑的是本机 Edge/Clash/校园 VPN 的访问路径，或个人会话特有异常；这些无法从我当前的远程环境直接读取，不能谎称已验证。现阶段不再盲目发布更多“提速补丁”。如果需要根治，应先在该电脑的网络环境比较 OPTIONS/POST 请求和代理路由，再决定是否增加稳定的国内可达代理入口。
