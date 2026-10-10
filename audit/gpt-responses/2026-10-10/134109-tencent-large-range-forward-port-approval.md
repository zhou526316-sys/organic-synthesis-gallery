# GPT response sync — approved Tencent large Range recovery on current main

- Beijing time: 2026-10-10 13:41:09 +08:00
- Chat context: Architecture/PDF, user approved repair for multi-paper `pdf_transfer_timeout` in parse phase
- Read-only defect evidence: `audit/pdf/2026-10-10-live-reader-range-timeout-after-tencent-16b-pass.md`
- Implementation branch `fix/pdf-tencent-range-fallback-20261010`, tested head `1a6cf70cb443e5500c8b11a635fbebf4ec7cc4a6`
- Draft PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/464
- Isolated CI success: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38028098960
- Owner-run large-range comparator: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/fix/pdf-tencent-range-fallback-20261010/scripts/pdf-private-range-comparison-console.js

## Upfront user-visible commentary

按已批准的范围开始修复。我会以当前 main 为基线，先补齐腾讯与 Cloudflare 两条线路的较大 Range 对照验收，再把受控切换逻辑移植到最新版 PDF 阅读器。会先在独立分支完成实现和回归测试，保留现有授权限制、连续滚动、分段大小及画质。正式启用仍以真实 PDF 第一、第二页和手机独立账号验收为条件，不会直接打开全站开关。

## Partial final visible answer

## PDF 阅读超时修复进展

已建立 PR #464：腾讯 PDF 分段传输恢复，以最新 main 阅读器为基线，不是直接合并旧的 PR #420。

目前已完成以下代码修改：
- 在主、备 Cloudflare 文件线路发生可恢复传输故障后，支持向腾讯网关重新申请独立授权票据。
- 切换前核验 PDF 的 SHA-256、文件长度和票据来源，禁止把不同文件的数据拼接在一起。
- 保留 401/403 权限拒绝、原有 PDF.js 阅读器、1 MiB 分段、画质和连续上下滚动。
- 增加文件线路和分段传输阶段的诊断信息，以便区分响应头等待与文件正文传输阻塞。

独立安全测试及前端构建已经通过。完整 Chromium 阅读回归仍在执行。（此处为当时中途状态；下文给出最终完成结果。）

生产状态没有变化：腾讯网关已安装，但自动切换开关仍是 enabled:false。目前还不能宣布 PDF 实际阅读问题已经修复。

## Terminal user-visible answer

## 修复代码与完整回归已完成

PR #464 的 Linux 构建、安全单元测试与 Chromium 回归全部通过：私有 PDF 浏览器 **43/43**，本地 PDF Vault 浏览器 **23/23**。其中新增的测试模拟大型 Range 主线路失败后通过独立腾讯票据继续读取，并实际由 Chromium PDF.js 渲染第一页、滚到第二页；另验证 SHA-256 不匹配必须拒绝组合、403 不可绕过、关开关后仍维持主/备 Worker 原行为。测试运行 #38028098960。

最新主线的授权 JSON、Range 请求和连续阅读流程均保留；只加入受控腾讯文件切换与脱敏的分段诊断。没有修改现有 1 MiB 分段、画质、PDF 原始字节、用户权限、R2、微信/Tampermonkey 或每日 08:00 更新。公开路由清单仍为 enabled:false；PR #464 保持草稿且未合并。独立腾讯网关此前真实部署的 HTTPS、无票据 401 和授权 16B Range 206 已通过，但真实 **1 MiB 前/尾段**及网页第一页第二页仍不能凭模拟测试宣称成功。

### 你现在只需做一次真实同 DOI 对照

在电脑 Edge 已登录 https://gallery.gczhouwld.com 的页面按 F12 → Console。打开 PR #464 内经过审查的只读脚本 `scripts/pdf-private-range-comparison-console.js`，复制整段 JavaScript 到 Console，回车并输入失败样本 DOI `10.1021/jacs.6c17448`。脚本会通过两个**独立授权的票据**分别向 Cloudflare 主入口和腾讯入口读取最多 1 MiB 的文件前段和尾段；核对 SHA-256 与长度，不读取整份 PDF，也不更改开关。仅输出 `primary` 与 `tencent` 的匿名状态/耗时/字节数/有效性，绝不输出 token、PDF 签名链接、私有字节或账号身份。请提供最后 console.table 两行截图，不要提供 Network 面板请求头。

若腾讯 `frontHTTP` 和 `tailHTTP` 为 206 且 `frontValid`、`tailValid` 与 `hashMatch` 全为 true，而 primary 失败，就有真实证据支持腾讯能避开当前文件传输问题。若两边都失败，继续检查共享 Worker/R2 上游；此时不能为了上线强行开启开关。

下一步才是真实 Edge 第一/第二页与手机另一个已授权账号的移动数据验收，以及无权限账号的 403 拒绝验收。等全部通过后，才按经过审查的分阶段发布操作合并/启用。无须再扫码 SSH 或重装网关。
