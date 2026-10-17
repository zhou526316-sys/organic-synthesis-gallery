# Response synchronization · gallary网页运营 · PR #739 acceptance and trial installer

Beijing: 2026-10-17 21:18:20
Related PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/739
PR head: 51607d7eb60bbb6d96246e737cef6809872494e5
Preview package run: 39034927288
Final CI run: 39034931280
Formal audit: audit/tampermonkey/2026-10-17-pr739-owner-acceptance-gates.md

## User-visible reply, including the earlier partial answer

已解决安装包验收中的版本问题，并生成了独立测试更新包：

**[安装 PR #739 测试版 VPN Bridge 2.2.93](https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/preview/tm-pr739-20261017/audit/tampermonkey/previews/pr739/gallery-vpn-bridge.user.js)**

内置抓取引擎版本为 **6.2.74**。我已从 GitHub 重新读取并核对生成文件，确认新版本号、修复代码及安装包均已存在，且测试版没有指向正式版的自动更新地址。

**这是测试更新链接，不是正式发布链接。** 测试版保留原 Bridge 的脚本身份，因此安装前需要暂停抓取、备份现有 2.2.92 脚本，并以更新方式替换；不能让两个版本同时运行。

正式旧版仍可通过 [原安装地址](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js) 回退。

最新修订的 **27/27 组代码与网站 CI 最终全部通过**，测试安装包的构建、版本标识及 SHA-256 校验也通过。有一组 WebKit Gallery TOC 交互测试首次出现超时；不改断言、不改页面源代码，原样重跑后通过。两次结果均已保留在审计中。

目前 PR #739 仍是草稿，尚未合并或部署。尚缺的不是代码包，而是新版在你已授权的 Edge/Tampermonkey + VPN 出版社会话中的真实抓取回执，因此我不会虚报“实际成功率已提高”。

请用上方**测试版链接**进行最后的真实验收：

1. 在 Gallery 暂停正在运行的任务，并在 Tampermonkey 导出备份当前的 VPN Bridge 2.2.92。
2. 打开链接，在 Tampermonkey 中**更新现有脚本**，不要新装一个同时运行的副本；刷新 Gallery，核对 Bridge 2.2.93 / 引擎 6.2.74。
3. 在已授权出版社环境里启动一次小范围抓取，运行若干 DOI 后暂停；使用 Tampermonkey 的“上传本地日志”菜单上传，回复“已上传”。

我随后通过只读 R2 诊断核对真实 DOI、官方 TOC、正文图、全文、云端 PDF 回执、心跳缺失和任务耗时，再决定是否正式发布。如果表现没有改进或有回退，就保留旧版。**正式更新链接会在真实验收通过后发布，现阶段不替换正式地址。**

Audit synchronization excludes secrets and tokens.
