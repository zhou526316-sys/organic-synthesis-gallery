# 2026-10-10 Organic Synthesis Gallery: approved PDF dual-failure repair and confirmed controlled production deployment

Beijing time: 2026-10-10 14:50:55 UTC+08:00
Conversation: architecture and PDF gateway work, user said "你直接修复" following two screenshots showing desktop authorize 15s timeout and Android later Range 20.8s timeout after a 512 KiB segment.

## Reviewed user-visible response — opening

我会直接修复这两类故障：电脑端的授权超时，以及手机端取得部分 PDF 后的分段传输超时。先核对最新 main 和 PR #464，再把腾讯线路接入授权与文件读取的受控恢复流程。修复会保留账号权限校验、文件哈希验证、1 MiB 分段和连续滚动；完成代码与浏览器回归后，我会检查能否安全发布，不把单纯测试通过当作真实 PDF 已经能打开。

## User-visible partial final — early validation

## 两类故障的修复代码均已通过回归测试

已在 PR #464 完成修复：电脑授权超时增加腾讯独立授权入口，两个 Cloudflare 入口迟迟无法完成授权时尝试恢复；手机分段超时在可恢复的分段传输失败后使用腾讯网关重新签发授权票据；401/403 保持拒绝，保留 1 MiB 分段、PDF 画质及连续上下滚动。最初独立 CI：Chromium 私有 PDF 47/47、本地 PDF Vault 23/23。

## User-visible partial final — final validation

## 修复已完成最终回归

最终 isolated test https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38031309441 **SUCCESS**: Chromium 私有 PDF 52/52，PDF Vault 23/23，前端构建及私有 PDF 授权检查通过。包含在错误页点击“使用腾讯线路试读”后第一页第二页显示、授权 403/401 拒绝、文件 SHA256 与 byteLength 严格匹配、禁止跨域复用签名票据。上线为仅需用户手动选择的试读（flag `enabled:false,manualCanary:true`），不对所有账号强制自动切换。

## User-visible partial final — main merge

## 修复已合并到正式主线

PR https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/464 已合并至 main，合并提交 e9da63aadbe503406b0a751935ff3553aabd2b84。Pages 发布 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38031528813 执行文献准入、静态媒体包构建、PDF 账号安全、本地 Vault 回归后 **全部成功**。

## Online independent verification

- Public Tencent health `https://pdf.gczhouwld.com/_pdf_gateway_health` readback: `{"ok":true,"role":"private-pdf-ingress","authenticated":false}` (no private creds).
- Pre-deploy public `https://gallery.gczhouwld.com/pdf-gateway-routing.json`: HTTP 404; after success readback of version-busted URL returns JSON with `"schemaVersion":1,"enabled":false,"origin":"https://pdf.gczhouwld.com","manualCanary":true`.
- Anonymous, no-login trial page https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78405-z&pdfIngress=tencent loaded `PDF · Organic Synthesis Gallery`, continuous scroll toolbar and '请先在 Gallery 登录后再读取私有 PDF。' as expected; this does NOT prove private owner PDF first or second page was read.

## Terminal user-facing reply

这次修改已经完成合并与生产部署，确认最新站点有受控腾讯试读入口。代码实现两层恢复：授权超时时腾讯重新授权；正文 Range 失败时在强哈希与字节长度相符、权限仍有效的前提下受控恢复。默认普通读者保持已有线路，出现网络传输故障时错误页可选择“使用腾讯线路试读”；该按钮不会在 401/403 拒绝下出现。

无需再次 SSH、安装服务器或操作 F12。请在已登录 Gallery 且确有 private_pdf_read 权限的浏览器，直接打开此前失败的一篇测试链接：

- 手机 Nature Communications：https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78405-z&pdfIngress=tencent
- 电脑 Nature Communications：https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78486-w&pdfIngress=tencent
- 电脑 JACS：https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Fjacs.6c17448&pdfIngress=tencent

确认第一、第二页是否显示及可上下连续滚动；若仍超时，仅发送页面底部脱敏阶段与耗时截图，不提供任何 token、Cookie、Authorization header、签名 PDF 链接或二维码登录 URL。独立测试成功和匿名在线读回不等于真实账号的整份 PDF 已成功。由于真实中国移动网络的全文件验收、不同授权账号及无权限账号拒绝验收尚未完成，`enabled:false` 全站自动切换仍关闭。保留 1MiB Range、画质、连续滚动、256MiB/月腾讯预算，不增加付费服务器，也未更改每天 08:00 文献准入及 Tampermonkey/微信站点。
