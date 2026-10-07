# Private PDF first-page performance repair

- Beijing time: 2026-10-08 00:19 +08:00
- User report: private PDF reader visibly crawled at "正在读取 PDF… 5%" and was too slow.
- Root cause: PDF.js was using 64 KiB ranges with `disableAutoFetch=false`; each small range passed through D1 access-token/capability validation plus an unnecessary R2 HEAD before R2 GET. High RTT made first-page latency excessive.
- Functional commit: `852c7f587bf1c966cb5daf784adf4d7a91a55977`
- Changes:
  - range chunk size 64 KiB -> 512 KiB;
  - `disableAutoFetch=true` to prioritize data required for first page instead of filling the rest of the article in the background;
  - progress copy now reports on-demand MB for first-page preparation instead of misleading whole-file percent;
  - private PDF HEAD no longer reads R2 object bytes;
  - Range GET no longer performs a redundant R2 HEAD; verified D1 byte length is used directly.
- Private PDF access regression: run 37649065845 — success, 17/17 browser cases.
- Worker unit regression confirms Range works without redundant R2 HEAD and HEAD establishes size without R2 body read.
- Browser owner case contains a guard that first-page range calls remain <= 8 on the enlarged range fixture.
- Worker deploy run 37649065878 — success.
- Worker/frontend sync run 37649065961 — success.
- GitHub Pages run 37649066007 attempt 1 failed only because unrelated body-auto read returned HTTP 503 (`auto_read_http_503`); failed jobs were rerun once.
- GitHub Pages run 37649066007 attempt 2 — success.
- Live delivery audit `de6aac3d8b20e8e91aa301e9e9b5129f3e18cf9e` records sourceCommit `852c7f58...`, runAttempt 2 and `success-live-verified`.

## Final user-visible response

这张图对应的性能瓶颈已经处理掉并正式上线。

之前虽然已经改成 Range 读取，但配置仍然很差：每次只取 64 KB，而且 PDF.js 还会自动把后续区段继续补齐；同时每个分片都要经过 D1 校验、R2 HEAD、R2 GET，所以在高延迟链路上会出现你截图里“5% 一点一点爬”的情况。

现在已经改成：
- 512 KB 分片，显著减少往返次数；
- 关闭后台自动补齐，优先只拿“目录 + 第一页真正需要的数据”；
- Range 请求去掉多余的 R2 HEAD；
- HEAD 只返回大小/Range 信息，不再读取 PDF 正文；
- 加了首屏门禁：测试 PDF 第一页阶段的 Range 请求数必须 ≤8。

专用 PDF 回归 17/17 通过，Worker 和 Pages 都已正式发布；线上交付记录明确绑定 `852c7f58`，状态为 `success-live-verified`。

请把当前这个旧 PDF 标签页关闭，再从 Gallery 卡片重新点 PDF。新版不再显示那种“整份 PDF 百分比慢慢爬”，而是优先准备第一页。如果这次仍然慢，我下一步就不再调分片参数，而会直接把临时 PDF 文件令牌改成无需每个 Range 都查 D1 的短时签名读取链路。
