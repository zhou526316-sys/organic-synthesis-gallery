# GPT response — Tencent owner first-byte acceptance

Beijing date: 2026-10-10. Chat context: user pasted screenshot of DevTools acceptance table.
Related evidence commit: dad7df6acf634eb896d4f9343d636c22fb7a86b1.
Project PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420

## User-visible streamed response (substantially retained)

## 腾讯 PDF 网关：真实文件传输验收通过

真实登录的该账号，选定的已存储 DOI，通过腾讯 HTTPS 备用网关的授权 PDF 首 16 字节 Range 验收。截图的原始字段与判断如下：

| 字段 | 观察值 | 结论 |
|---|---|---|
| gatewayHealth | HTTP200_verified | gateway health passed |
| authorizeHTTP | 200 | authorization endpoint success for this request |
| available | true | selected DOI available |
| fileHTTP | 206 | PDF partial content |
| range206 | true | Content-Range verified |
| pdfMagic | true | %PDF- header verified |
| error | none | no canary error |
| elapsedMs | 4400 | total time for health + auth + first 16 bytes; not full PDF/first page |
| session | not_checked | test script's unused placeholder, not a failed login |

These observations are from the actual owner's browser screenshot, not merely isolated CI fixtures. Production routing enabled:false remains unchanged; first-page and second-page rendering, continuous scrolling, full download and mobile cellular/other account still require separate verification.

## Terminal response (substantially retained)

我已将此次真实验收结果记录在独立网关分支的 LIVE_ACCEPTANCE_2026-10-10.md 中。下一步先用手机关闭 Wi-Fi/VPN、使用移动流量访问 https://pdf.gczhouwld.com/_pdf_gateway_health 进行腾讯端点连通性测试，再对另一个已获授权账号进行独立的真实 PDF 读取验收。两个已获授权账号成功不等于未获授权账号 403 权限隔离已通过。手机 Gallery 的现有阅读按钮因为自动回退尚未启用，可能仍走 Cloudflare，不能误认作腾讯 PDF 实测。请只发送健康接口的普通结果或不含凭据的结果表，不要提供 Bearer、Cookies、签名 PDF 地址或二维码登录 URL。

此时不合并旧 PR #420，不把过时的阅读器代码覆盖 main，也不修改 PDF 分段、画质与上下连续滚动。后续需在最新 main 上单独前向移植网关回退并回归测试，得到实际网页阅读和手机端授权验收后才考虑启用。
