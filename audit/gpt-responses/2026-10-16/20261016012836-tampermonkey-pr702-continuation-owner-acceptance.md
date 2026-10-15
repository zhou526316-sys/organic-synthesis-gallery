# Tampermonkey 2.2.88 owner-handshake continuation — 2026-10-16T01:28:36 Asia/Shanghai
Conversation: user said “继续任务” after reporting 2.2.87 still failed PDF-owner capture authorization. This is an immutable public-response synchronization, not a new code repair or media write.

## User-visible response — part 1

### Tampermonkey 续作：PR #702 已合并

刚刚重新读取 GitHub，发现上一轮中断后的工作已经继续推进：

- [PR #702](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/702) 已合并至 main。
- **VPN Bridge 2.2.88／抓取引擎 6.2.69** 的修复已进入主线。
- 私有 PDF 捕获、浏览器控制器、ACS/RSC 抓取、历史 TOC 范围保护及网站质量门禁均有成功的 CI 记录。

这次的核心修改是让 PDF owner 授权接收器独立运行，不再依赖完整抓取引擎启动，并防止旧脚本的响应干扰授权。

我继续检查正式域名是否已部署该版本，以及完整安装包的浏览器测试是否真正通过。

## User-visible response — part 2

### 2.2.88 已正式上线并通过专项测试

两个正式安装入口均已更新。

| 项目 | 已核实版本 |
|---|---|
| VPN Bridge | 2.2.88 |
| 内嵌抓取引擎 | 6.2.69 |
| 抓取协议 | 6.2.20 |
| 控制器 | 2.2.41 |

Pages 部署 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38767110548 和 Worker 部署 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38767110595 均已成功。部署后的线上验收 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38769299074 也通过。

最重要的是，私有 PDF 捕获专项 CI https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38766118596 已通过完整安装包的 Chromium 隔离环境测试，确认了三种情况：正常授权成功、没有 Bridge 时不签发授权、Tampermonkey 存储失败时明确提示错误。

正式更新入口：https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 。只需更新现有的 Bridge，不需要安装第二份或清除原来的媒体与 PDF 缓存。

这些验证证明新版代码及部署正常，但还不能代替你本机实际点击授权的验收。

## User-visible response — final

### 最新诊断仍未收到 6.2.69 的本机回执

刚才重新运行只读 R2 日志验收：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38705066633 。服务器保存的最新完整人工上传日志，其 installRevision 仍是 **6.2.67**，而不是 6.2.69。它对应旧批次的 198 个待办 DOI、9 个真正打开的 DOI、仅 1 个确认完成，最后因 publisher_script_missing_3_consecutive 停止，留下 190 个未访问的待办。这份旧日志不能用于证明 2.2.88 新版授权成功或失败。

我已经核对新生产安装包，两条入口均提供 2.2.88 / 6.2.69。现在只需在已有 Tampermonkey 中确认 Bridge 版本是 2.2.88、脚本为启用状态、Chrome/Edge 扩展的“网站访问权限”允许 gallery.gczhouwld.com；刷新 https://gallery.gczhouwld.com/private-pdf-owner-setup.html ，点击“授权本浏览器抓取 PDF（7 天）”。

新版在授权后应报告成功和截止时间；若仍失败，请直接提供按钮下方的**完整状态提示**（例如“未检测到新版 VPN Bridge”或“授权写入或回读失败”），不要发送任何凭证。无需重新绑定 owner、清除 Tampermonkey 数据或移除已存 PDF。

此外，PDF 授权握手的版本修复不会自动解决旧批次连续脚本心跳失败造成的全局队列停止。该抓取问题仍需单独以新版浏览器运行记录验收。

## Evidence

- PR #702: merged as confirmed by GitHub connector, current main source version 2.2.88 / engine 6.2.69.
- Pages deploy #38767110548 and Worker deploy #38767110595 all success.
- Postdeploy online readback #38769299253: Gallery/API both 493849 bytes, HTTP 200, 2.2.88 / 6.2.69, anonymous private inventory denial retained.
- Postdeploy live acceptance #38769299074 reports authenticatedUserBrowserVerified=false; postdeploy night acceptance #38769298975 reports realUserBrowserOvernightVerified=false.
- Private PDF capture v2 regression #38766118596 contains exact test output: OWNER_BRIDGE_BROWSER_PASS full isolated Bridge; OWNER_BRIDGE_BROWSER_PASS no script does not mint owner lease; OWNER_BRIDGE_BROWSER_PASS GM failure reports NACK.
- Latest read-only owner diagnostic R2 recheck is #38705066633 new attempt/job 116568347484: uploadedAt 1792074271882; installRevision 6.2.67; phase capture_environment_blocked; total 198, visited 9, pendingMissing 190, stopReason publisher_script_missing_3_consecutive. As of 2026-10-16 Beijing, there is no newer 6.2.69 manually uploaded complete diagnostic in that R2 latest pointer.
- No private PDF contents, session bearer, authorization key, or other secret copied into this audit.

response_sync_status=committed.
