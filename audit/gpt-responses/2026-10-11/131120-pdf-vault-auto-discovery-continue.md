# Organic Synthesis Gallery 本地 PDF 三项修复续办答复归档

- 北京时间：2026-10-11 13:11:20
- 工作窗口：抓取有机合成文献并持续更新网页 / 本地 PDF 直读功能继续
- 生产基线：main
- PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/540
- 合并提交：364690da686b210b820313f8e0fd6c1d49aaef96
- 线上发布：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38111928039
- 生产文件核验：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38112581344
- PDF Vault 专项：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38111928049
- 私有 PDF 权限回归：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38111928081

## 用户可见答复（完整正文）

## 本地 PDF 三项修复已正式上线

核查 GitHub 后确认，[PR #540](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/540) 已于 **2026 年 10 月 11 日北京时间 12:32** 合并到 `main`，提交为 `364690da`。

- 正式网站：gallery.gczhouwld.com；已合并并部署。
- [Pages 正式部署 #38111928039](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38111928039)：成功。
- [PDF Vault 生产资源验收 #38112581344](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38112581344)：成功。
- PDF Vault 本地阅读、私有 PDF 权限及站点综合测试均已通过。

此次上线包含你批准的三项功能：登录验证结果复用、错误 PDF 的 DOI 核验与关联纠正，以及授权下载目录后的自动发现。

继续核查生产验收的具体证据和操作边界，确认是否还有影响实际使用的细节。

**最终核验：** PDF Vault 的 Chromium 浏览器测试为 **36/36**，私有 PDF 回归为 **59/59**，主域名上的 **18 个实际静态资源文件**与对应正式发布版本的 SHA-256 一致。公开直读页面已经返回新的下载目录授权、重新搜索、更换及取消关联控件。

**现在的使用方法：** 在你常用的 Edge/Chrome 登录 [Gallery](https://gallery.gczhouwld.com/)，打开任意文献卡片的「本地 PDF」。第一次点击「授权 PDF 下载目录（只读）」并选择以后保存文献 PDF 的目录；此后新 PDF 下载到该目录或其一级子目录，点击对应文献卡片就会在本机按 PDF 内 DOI 搜索，匹配成功直接以浏览器原生连续滚动方式打开，不需要再逐篇手动选择文件。

如果之前选错 PDF，打开该 DOI 直读页，使用右下角「管理此 PDF」中的「更换本地 PDF」或「取消该 DOI 的关联」。原文件不会被删除；旧版错误关联在再次核对时也会被阻止自动打开。

**权限与适用范围：** 登录检查改为复用近期已验证会话（短时记录），不必每开一个标签都等待网络确认，但会在必要时静默复核；浏览器本地文件权限与账号登录不同，Edge/Chrome 仍可能在首次授权或权限收回后要求用户确认。仅能自动检索明确授权的下载目录，不会未经许可扫描所有磁盘位置；另一个浏览器或设备需要单独授权。纯扫描版或未能可靠提取 DOI 的 PDF 会拒绝自动绑定，以防误打开其他文献。

[直接打开新版本地 PDF 入口](https://gallery.gczhouwld.com/pdf-vault/open/?doi=10.1021%2Fjacs.6c15886)。此 DOI 仅作为功能入口示例，不表示该文献已经存在于你的电脑。

**验收边界：** 代码、自动化 Chromium 回归和正式静态资源部署均已核查通过，但无法从远程验证你的 Windows 电脑实际是否保留系统级文件夹授权；仍需在你的浏览器对选定目录完成一次授权。若还看到旧按钮，可先刷新网站。

本次继续工作的答复已同步记录至 `audit/gpt-responses/2026-10-11/131120-pdf-vault-auto-discovery-continue.md`。
