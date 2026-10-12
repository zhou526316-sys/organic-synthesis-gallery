# 云盘本地同步目录选择器正式交付（2026-10-12）
- 北京时间：2026-10-12 13:04:06
- 来源：Project 抓取有机合成文献并持续更新网页，本地 PDF 工作线
- 用户批准范围：在更换下载目录里显示百度网盘、夸克、阿里云盘、OneDrive，官方登录/客户端安装引导，再选择真实本机同步文件夹；不做 OAuth 云端 API。
- 主仓库：zhou526316-sys/organic-synthesis-gallery，main
- PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/544
- 合并提交：67c0f5f7a40ee387b130fc134c1defd56ebbe39d
- 页面发布：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205185762 （success）
- 主线专项：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205185710 （39/39，success）
- 发布资源验收：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206251697 （success，verifiedFiles=18，sourceCommit=67c0f5f7）
- 当前正式入口：https://gallery.gczhouwld.com/pdf-vault/open/?doi=10.1021%2Facscatal.6c06048

## 用户可见阶段性答复原文
已完成「选择 PDF 保存位置」界面的开发，并通过首轮 **39/39 项 Chromium 本地 PDF 测试**，包括百度网盘等五种入口、只读文件夹授权、取消后保留原目录，以及手机窄屏布局。

状态：功能测试通过，正式发布验收进行中。

在新的选择界面中，用户可以先选择百度网盘、夸克网盘、阿里云盘或 OneDrive，进入对应官方页面登录或安装客户端，再返回 Gallery 授权电脑上的同步目录。

这里不会读取云盘密码，也不会声称 Gallery 已直接连接云盘账号。后续 PDF 识别仍以本机实际文件和 DOI 校验为准。

[PR #544](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/544) 现已合并到 `main`，提交 `67c0f5f7`。全部 14 项合并前检查通过。

保留原有的 DOI 校验和本地 PDF 直读方式。用户取消文件夹选择时不会覆盖先前的关联，云盘登录也只发生在各服务商官方页面。

正式 Pages 部署已成功：[#38205185762](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205185762)，源码 `67c0f5f7`，包含新的五种选择界面。

## 最终答复内容
**已正式上线并完成真实生产静态资源校验。** [PDF Vault live delivery #38206251697](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206251697) 返回 `{"ok":true,"pagesRunId":38205185762,"sourceCommit":"67c0f5f7a40ee387b130fc134c1defd56ebbe39d","verifiedFiles":18,"error":null}`。通过真实 Pages 发布与浏览器 P1 检查，不将测试成功冒充用户实际云盘同步。

### 操作
1. 在 Gallery 登录，点击某篇卡片的「本地 PDF」，未找到已下载文献时点击「第一步：选择 PDF 保存文件夹」或「更换下载目录」。
2. 在弹出的选项中选择「本机文件夹 / 百度网盘 / 夸克网盘 / 阿里云盘 / OneDrive」。
3. 云盘选项会显示官方页面链接与登录/客户端说明，仅用户本人在官方页面登录。需要确保相应 PDF **已经真实存在于电脑的同步或下载文件夹中**，OneDrive「仅联机」文件需先设为本地可用。
4. 用户再点击「选择电脑上的文件夹」，在 Edge/Chrome 的系统选择器中授予 Gallery **只读**访问该目录；云盘种类与原始 FileSystemDirectoryHandle 按当前 Gallery 账号、设备保存在本机 IndexedDB。
5. 将有授权取得的论文 PDF 保存或同步到同一目录，以后再次点击该文献「本地 PDF」，继续复用 DOI 安全校验与本地原生 PDF 阅读器。取消系统选择时不会覆盖之前授权的目录。

### 适用边界
- 本次是本地云盘同步目录引导而非云端直连。**没有连接百度/其他云盘 OAuth 账号，不能浏览只存在于云端的 PDF，也不自动下载付费出版社 PDF。**
- Gallery 不要求云盘密码、不向云盘 API 发送账号信息、不移动或上传用户 PDF。用户如果启用了客户端双向同步/备份，PDF 可能由其客户端上传到第三方云端，须根据自身文件许可判断是否启用。
- 非所有云盘客户端都支持自动同步；只支持浏览器能从操作系统实际访问的本地文件夹。不承诺所有账号、所有路径或手机端云盘可直接读取。
- CI 已测试真实 Chromium IndexedDB/OPFS、选择取消、云盘入口、移动端 390px，但无法远程替用户在其 Windows 电脑真实登录第三方云盘并完成目录授权。
- 每日北京时间 08:00 文献发布、站长私有 PDF 权限及媒体采集未因本功能改动。

### 结果
真实生产源 SHA 67c0f5f7、生产 PDF Vault 18 文件完整核验成功，项目响应记录完成。

## 附注
不含任何账号密码、浏览器令牌、私有 PDF、云盘文件路径或秘密。项目所有聊天可沿用这条交付结果，但不能把“本地同步目录引导”称为“已实现云盘 API 直连”。
