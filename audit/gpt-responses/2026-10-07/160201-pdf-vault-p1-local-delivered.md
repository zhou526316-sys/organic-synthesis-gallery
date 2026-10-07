# PDF Vault P1 本地保存与阅读首批交付回复

- 记录时间：2026-10-07 16:02:01（北京时间）
- 用户请求：继续。
- 实施提交：db0ccce1e817c638b12a482fcc1abebb1a23d2c7
- 交付范围：P1 首个可用批次，完整 P1 与后续阶段尚未全部交付。
- 本文 Final response 部分须与发送给用户的最终回复完全一致；提交后读取核对。

## Final response

这批已经继续做完并上线：**P1 的“本地 PDF 保存与阅读”首批，现在可以实际使用。**

入口：**[我的 PDF 文献库](https://gallery.gczhouwld.com/pdf-vault/)**。主站有 DOI 的文献卡片也已增加 **“本地 PDF”** 按钮，点击后会带入对应 DOI。[实现与使用说明](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p1-local.md)

## 现在可以怎么用

1. 登录 Gallery，从文献卡片点击 **“本地 PDF”**。
2. 选择保存位置：支持目录选择的桌面浏览器可以选一个真实文献文件夹；也可以明确选择 **“浏览器内存储”**。
3. 核对 DOI 和版本，选择自己已经下载的 PDF，点击保存。
4. 保存后可在网页内阅读、翻页、缩放和导出；刷新页面后，也能重新打开已保存的文件。

这里已经接通了实际文件写入、写入后回读和内容校验。文件被移动、删除或改动后，系统会重新检查并提示问题；取消目录选择、拒绝权限或写入失败时，也不会显示保存成功。单份导入上限为 **50 MiB**。[保存流程与边界](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p1-local.md#导入与再次打开)

## 你自己的账号和普通用户，分别是什么情况

| 入口 | 当前行为 |
|---|---|
| 普通用户的 **“本地 PDF”** | 用户选择文件并保存到自己的真实文件夹或浏览器内存储；在网页中管理和阅读。 |
| 你账号原有的 **“PDF”** | 继续通过原来的私有权限链路读取已经校验、激活的站长副本；自动抓取链路继续保留。 |

**你的私有 PDF 文件实体仍在 R2，Git 保存代码和审计记录。** 这次的本地 PDF 流程不会上传用户的文件、路径或内容 hash，也不会把用户导入的文件自动并入你的私有库。账号切换或退出时，旧账号的列表、阅读画布和进行中的任务会被清理。[实现说明与权限边界](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p1-local.md)

主站仍是你确定的 **电脑每页 24 篇、手机每页 12 篇，按数量翻页**。

## 已完成的验收

| 检查 | 结果 |
|---|---:|
| 状态机、设备身份和本地存储边界 | **42 / 42 通过** |
| Chromium 中实际保存、刷新重开、PDF.js 阅读及账号隔离 | **17 / 17 通过** |
| 站长 PDF 按钮与权限回归 | **13 / 13 通过** |
| 主域名上的入口、阅读器、解析 Worker、字体等文件 | **8 / 8 内容比对通过** |

这些检查已进入正式发布流程。**北京时间 2026 年 10 月 7 日 15:59**，线上核验确认 8 个文件的大小和 SHA-256 与通过浏览器测试的构建一致，响应类型正确，核验前后的发布版本也一致。[正式发布记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37588737678) · [线上文件核验](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37590774083)

## 下一批还剩什么

这次完成的是 **P1 的第一个可用批次**。接下来要接的是 **“待电脑获取”队列，以及文献卡片上的真实 PDF 状态**；跨设备状态同步、普通用户的一次性获取会话和个人云同步仍在后续范围。

还有两个明确的验收边界：当前进入文献库仍需要在线验证登录；Windows 原生目录授权弹窗尚未做真人点选验收，自动测试使用的是真实文件系统句柄。390px 手机布局与存储流程已通过 Chromium 测试，真实手机及微信环境还需要单独验收。[完整验收记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/architecture/pdf-vault-p1-local-20261007.json)

实施提交：[`db0ccce`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/db0ccce1e817c638b12a482fcc1abebb1a23d2c7)。
