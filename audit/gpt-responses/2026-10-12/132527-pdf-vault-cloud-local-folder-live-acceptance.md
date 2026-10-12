# Organic Synthesis Gallery 本地 PDF 云盘保存位置首期交付

- 北京时间：2026-10-12 13:25:27
- 工作对话：“批准”后完成“更换下载目录内显示百度云等，引导官方登录并选择本地同步文件夹”；本回合用户要求“继续”核查生产部署。
- 仓库：zhou526316-sys/organic-synthesis-gallery；生产 main 唯一基线
- PR #544：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/544
- 合并时间：2026-10-12T04:46:57Z（北京时间 12:46）
- 合并 SHA：67c0f5f7a40ee387b130fc134c1defd56ebbe39d
- 直接对应 Pages 发布：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205185762（success）
- 第一次线上资源验收：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206251697（success）；源提交 67c0f5f...，verifiedFiles=18
- 后续 Pages 发行：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086655（success）
- 最新线上资源复核：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38207150554（success）；源提交 cea8b113e18fad29af4bccaebf631f2e3ebce693，verifiedFiles=18
- Pages 正式构建浏览器验收：PDF_VAULT_LOCAL_BROWSER_OK 39（两次发布皆通过）
- 站长私有 PDF 浏览器验收：PRIVATE_PDF_BROWSER_SUMMARY ok=true, passed=59, total=59（两次发布皆通过）
- 正式 DOI 示例入口：https://gallery.gczhouwld.com/pdf-vault/open/?doi=10.1021%2Facscatal.6c06048
- 只读线上页面检查：新保存位置面板与明确的“不收集第三方密码、不连接云盘 API”说明已出现。HTML 中云盘选项在未打开弹层前为隐藏状态，不代表缺失。

## 用户可见的完整答复

## 云盘保存位置功能已正式上线

[PR #544](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/544) 已于 **2026 年 10 月 12 日北京时间 12:46** 合并到 `main`。

目前确认：

- [Pages 正式部署 #38205185762](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205185762)：成功。
- [PDF Vault 线上验收 #38206251697](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206251697)：成功，18 个资源文件通过版本核验。
- 后续 [Pages 发布 #38206086655](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086655) 及 [线上验收 #38207150554](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38207150554) 也已成功。

新版本提供本机文件夹、百度网盘、夸克网盘、阿里云盘和 OneDrive 五种保存位置引导，并保留原有的 PDF 自动识别和 DOI 校验功能。

**进一步验收**：正式发布日志的 PDF Vault 浏览器测试为 39/39 通过；私有 PDF 权限回归为 59/59；最新线上验收核对 18 个 PDF Vault 静态资源文件。正式域名中也已经出现选择面板的说明文本。

**使用方法**：打开 [本地 PDF 示例页面](https://gallery.gczhouwld.com/pdf-vault/open/?doi=10.1021%2Facscatal.6c06048)，先登录 Gallery。点击「第一步：选择 PDF 保存文件夹」或「更换下载目录」，选择百度网盘等平台。如果选择百度网盘，先点“前往百度网盘官方页面登录或安装客户端”，只在百度官方客户端/页面登录，选择其实际提供的下载/本地同步功能，确保 PDF 已在电脑上可打开；然后返回 Gallery，点击「选择已保存在电脑的百度网盘文件夹」并完成浏览器读取授权。以后从期刊取得 PDF 并保存/同步到该目录，再点对应论文的「本地 PDF」即可尝试按 DOI 自动识别并用浏览器原生阅读器打开。其他云盘同理。

**必须说明**：第一期只有云盘本地同步目录引导，没有云盘 OAuth 登录、远程网盘目录浏览或直接把云端 PDF 自动下载至指定位置的能力；云盘仅保存「类别」标记和本地文件夹句柄，Gallery 不收集第三方账号密码。启用同步后文件可能由第三方云盘客户端上传，用户应自行确认文件许可。普通网页也无法接管出版社网页发起的所有下载操作或将文件无授权写入云端。

**生产安全边界**：原始 PDF 不删除不移动；保存位置仍按当前设备、当前 Gallery 账号分别授权；更换目录时取消仍保留旧选择；保留 DOI 校验、错误 PDF 防串联、只读文件夹访问和每日北京时间 08:00 的出版流程。Windows 自己的 Edge/Chrome 文件夹授权持久性仍需要用户本机验证。

如仍看到旧的文件夹选择按钮，可刷新 Gallery 页面后再次打开当前 DOI 的本地 PDF；不建议清除网站存储，因为会影响原先保留的本地文件关联。

本次结果已同步至 `audit/gpt-responses/2026-10-12/132527-pdf-vault-cloud-local-folder-live-acceptance.md`。

## 变更范围

- 增加 src/pdf-vault/storage-providers.mjs：品牌白名单及官方网址；
- 增加 pdf-vault/open/index.html 的选择弹层；
- 更新 src/pdf-vault/open.mjs 事件处理；
- 更新 src/pdf-vault/local-vault.mjs：在账户/设备隔离的原目录句柄旁保存提供商类别（非 OAuth）；
- 更新 src/pdf-vault/open.css：桌面和 390px 手机布局；
- 新增 provider 合规 Node 测试和两个 Chromium 场景；
- 更新 PDF Vault P1 CI 与文档；
- 没有向云盘/出版社执行自动代登录，不上传 PDF 字节或账号凭据。
