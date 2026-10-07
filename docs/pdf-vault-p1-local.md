# PDF Vault P1：本地保存与阅读首批

本批接续 [China-first PDF Vault v1](../architecture/PDF-VAULT-CHINA-V1.md) 和 [P0 契约](./pdf-vault-p0-contract.md)，把本地保存、导入检查、刷新后再次打开和浏览器阅读接成真实流程。完整 P1 中的“待电脑获取”队列，以及后续跨设备 manifest 同步，仍属于后续批次。

## 用户入口与操作

- 有 DOI 的文献卡片显示“本地 PDF”，进入 `/pdf-vault/?doi=...`；地址只携带 DOI，不携带令牌、本地路径或文件内容。
- 新页面复用 Gallery 登录状态，向 `https://api.gczhouwld.com/api/user-ui/auth/session` 验证实际账号。未登录、验证失败和本地记录不可用时，不显示任何账号的文献。
- 桌面可选择真实文献文件夹；不支持目录选择的浏览器可明确选择“浏览器内存储”。不会因为取消目录选择就悄悄切换保存位置。
- 填写并核对 DOI、选择版本和自己已下载的 PDF，然后保存。每次导入一份，最大 50 MiB；文件中的 DOI 与许可由用户核对，解析器不证明这些事实。
- 列表提供打开阅读、导出和真实文件夹的恢复权限操作。阅读器支持页码、上一页、下一页和缩放；无法绘制时提供导出原文件的提示。
- 主站桌面 24、手机 12 的按数量分页不变。本地库列表独立按需展开，不改变主站文献顺序。

站长原有 `PDF` 按钮与 `/pdf/` 阅读入口继续使用既有私有权限链路。本批新增的“本地 PDF”不会把站长私有副本分配给普通用户。

## 保存位置与本地记录

`src/pdf-vault/local-vault.mjs` 实际使用 IndexedDB、File System Access 和 OPFS。

| 内容 | 保存位置 | 行为 |
| --- | --- | --- |
| 真实目录中的 PDF | 用户选定目录下 `Gallery PDF Vault/library-<随机值>/` | 每个账号独立随机目录；DOI 加随机副本 ID 命名；其他本地软件可直接访问 |
| 浏览器内 PDF | 当前站点 OPFS 下的独立账号目录 | 浏览器管理容量；清除站点数据或空间回收可能丢失；页面明确提示导出备份 |
| 文献和副本记录、目录句柄、文件名 | 当前浏览器 IndexedDB `gallery-pdf-vault-local-v1` | 以账号和副本 ID/DOI 建索引；账号切换重新验证和隔离展示 |
| 设备标识 | P0 提供的随机设备标识 | 必须可持久保存，不能使用设备指纹或把设备 ID 当读取授权 |

文件、文件名、目录句柄、本地路径和内容 hash 均不上传。P0 的 `toCopyManifest` / `toDocumentManifest` 白名单仍排除句柄和路径；本批没有调用远端 manifest 写入端点。

磁盘文件与浏览器索引是不同的副本：清除站点数据会丢失索引和句柄，但不会替用户删除真实目录中的文件。本批不自动扫描目录重建索引，已有文件可重新选择导入。OPFS 中的文件则随站点存储生命周期管理。

账号隔离是应用的读取和展示边界，不是对同一操作系统用户的磁盘加密。能直接访问真实目录或浏览器开发工具的人不属于这个隔离机制的保护范围。

## 导入与再次打开

1. 在原始点击事件中调用目录选择器或恢复权限，保留浏览器要求的用户手势。
2. 在读取整个输入文件前检查大小上限。PDF.js 检查页树、正页数及首个页面的基本结构；需要密码的文件暂不导入。
3. 存储模块检查 PDF 文件头、结尾和实际长度，并计算 SHA-256。它不把文件扩展名或 Content-Type 当作 PDF 成功证据。
4. 写入全新随机副本文件名，不覆盖既有 PDF；关闭写入流后重新读取，确认长度和 hash 一致。
5. 通过同一 IndexedDB 事务提交文献和副本记录，再回读持久化记录。上述步骤完成后才显示保存成功。
6. 每次打开或导出都重新检查权限、实际文件、长度和 hash。被移动、删除或修改的文件不会继续按旧记录直接打开。

本批的 PDF 检查不是逐页内容审计，也不保证所有复杂 PDF 都能完整绘制。PDF.js 解析与渲染错误会反馈给用户；原文件导出作为继续阅读的途径。

取消、拒绝授权、配额不足、IndexedDB 不可用、写入失败或账号切换时不会生成虚假的成功状态。失败会尝试中止本次写入流，但不自动扫描或删除用户目录；极端中断可能留下空文件或尚未纳入索引的独立文件。

## 账号与异步操作

- 账号身份来自已验证会话，不能由 URL、DOI、设备 ID 或文件 hash 推导。
- 每个控制器绑定一个账号、令牌和生命周期代数；存储事务、文件操作、导入解析和异步绘制在边界处再次核对。
- 收到退出/切换事件时，同步清空列表、文件选择、画布和阅读窗口，并撤销 Blob URL、中止活动 IndexedDB 事务及旧 PDF.js 任务。
- 跨标签 `storage` 事件和同页 `gallery-auth-session-changed` 事件都会触发重验。未发事件的同页写入由 800 毫秒观察器兜底；操作入口还会即时检查令牌，不能趁观察器运行前打开旧账号文献。
- 列表根据 P0 的真实文件探针显示状态，探针到期后降为待检查；刷新后不把旧的数据库 `available` 状态直接视为当前可读。

## 阅读器与静态资源

PDF.js 固定为 `pdfjs-dist@6.4.299`，使用同版本的官方 legacy 构建及 Worker，由 `src/pdf-vault/reader.mjs` 懒加载；首页不预先下载整个阅读器和 Worker。`scripts/pdf-vault-assets.mjs` 把 CMap、标准字体、图像解码支持、ICC 与许可证打包到版本化同源目录。

PDF 通过本地 `Uint8Array` 交给解析器；不用第三方在线 viewer，不上传文件，不从 PDF 指定的地址抓取资源。阅读器只绘制 Canvas，不启用活动链接、附件处理、表单或 PDF 脚本。页面 CSP 限制脚本和资源来源，禁止 JavaScript eval，并仅为本地解码器允许 WebAssembly 编译。

固定依赖与官方资料：

- [Mozilla PDF.js 6.4.299 正式发布](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299)
- [PDF.js API](https://mozilla.github.io/pdf.js/api/)
- [PDF.js 官方示例](https://mozilla.github.io/pdf.js/examples/)

## 本批范围

本批没有修改 D1 schema、Worker 授权、站长 R2 链路、普通用户 V3 写入开关、出版社抓取或文献发布时刻。它也没有实现“下载证明换取站长私有副本”、跨用户私有 PDF 合并或把用户文件默默纳入站长库。

后续批次才接：卡片的跨设备 PDF 状态同步、“待电脑获取”队列、普通用户短时 capture session、个人同步目录及可选云备份。主站卡片当前的“本地 PDF”是管理入口，不承诺该文献已有可读文件。

## 验收和发布

- Node 检查覆盖 P0 状态机/设备身份，以及本批大小、格式、取消、权限、存储失败和账号失效边界。
- `tests/pdf-vault-local-browser.mjs` 使用真实 Chromium IndexedDB、OPFS、FileSystemHandle 结构化克隆与 PDF.js；账号 API 使用固定测试响应，文件为合成 PDF，不读取真实用户文献。
- 目录适配测试以真实 OPFS 目录句柄替代系统选择弹窗，检验文件操作和句柄持久化。它不等于已经在真人 Windows 桌面点选过浏览器权限对话框。
- `tests/private-pdf-access-browser.mjs` 保留站长按钮回归，并检查普通用户本地入口、DOI URL 和手机布局。
- 新独立工作流 `.github/workflows/pdf-vault-p1.yml` 运行本地流程回归。正式发布仍由 `.github/workflows/github-pages.yml` 执行，新增本地 PDF 门禁位于 Pages artifact 上传之前。
- 浏览器小型 `summary.json` 记录用例结果与实际加载静态文件的 SHA-256，供部署后核对主站交付；失败才保留截图、trace 和诊断。

本地测试、GitHub Actions 与真实线上交付应分别记录，不用一次本地成功代替生产验收。本批最终证据写入 `audit/architecture/pdf-vault-p1-local-20261007.json`。
