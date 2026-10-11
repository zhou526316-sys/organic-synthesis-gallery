# 2026-10-11 11:51:25 北京时间｜本地 PDF 直读反馈核验

任务：本地 PDF 功能工作线；对用户反馈「重复确认、错误 PDF 持续关联、下载后不能直接打开」进行只读核查与方案审定。此记录是核查结论及待审批方案，**不是修复或已上线声明**。

已检查仓库 `main` 中 `src/pdf-vault/open.mjs`、`src/pdf-vault/local-vault.mjs`、`src/pdf-vault/page.mjs`、`src/pdf-vault/cards.mjs`、`src/user-ui/library-shell.ts`、`PROJECT_RULES.md`；来源包括 Chrome File System Access 和 MDN 浏览器 API 文档。

## 用户可见回复正文

已在当前 `main` 核实：这三个问题都存在对应的代码层面原因，并非当前产品已经实现了“下载即开”而只是操作方法不对。

1. **重复确认。** 每次打开文献都会新建直读标签，新页都重新请求 `/api/user-ui/auth/session`。主站本来已经定期核验登录，但新页没有复用最近一次经服务端确认的状态，因此登录没到期也会重复等待。另一个可能出现的确认是 Edge/Chrome 的**本地文件读取权限**，它和 Gallery 登录相互独立，无法以登录有效来跳过浏览器授权。拟改为跨标签复用短时、绑定账号和令牌的已验证会话，后台复核、失效/退出/切换账号立即关闭读取；文件读取权限按浏览器允许的持久授权处理，不重复弹应用层确认。不能仅凭 localStorage 中存在令牌就断言服务器会话有效，尤其有五设备强制下线规则。

2. **选错 PDF 后一直打开错误文件。** 现有 `linkPdfHandle()` 只确认 PDF 格式、大小和 SHA-256，不校验文件正文 DOI；选择时即按卡片 DOI 建关联，下一次直接优先打开最近关联的文件。当前原生阅读界面和文献库都没有充分的“更换／取消 DOI 关联”入口。这是明确缺陷。拟增加本机 PDF 首页/元数据 DOI 核验，区分主文与 SI；不吻合的文件不得自动绑定，已发现错误绑定则停用错误关联，并提供随时可用的“更换／取消关联”入口。只更新索引，**不删除用户电脑上的 PDF**。无法从文件中可靠提取 DOI 时不能假称匹配，需走明确的人工校正路径。

3. **已下载却不能直接打开。** 当前网页只查 IndexedDB 中曾手动选择的文件句柄，根本没有扫描浏览器下载目录、发现新文件并按 DOI 建索引的能力。因此此前“首次需要逐篇选一次”的实现没有达到要求。拟优先支持 Edge/Chrome 一次性、只读授权一个 PDF 下载目录；此后打开任一 DOI 时在该目录的增量索引中自动匹配真实 PDF，并直接进入浏览器原生连续滚动阅读器，不再逐篇点选文件。扫描只在本机，设数量/时间上限和缓存；解析 PDF 中真实 DOI 后再自动绑定，不以文件名相似或“这是个 PDF”作为充分证据。若下载不在已授权目录、浏览器收回目录权限或无法识别 DOI，必须清楚提示而不能默默打开其他文献。

**技术边界：** 纯网页没有权限监视 Edge/Chrome 的所有任意路径下载，也不能凭“用户登录”读取整个硬盘。一次性授权目录的文件可以列举；Chrome/Edge 是否长期保持权限取决于浏览器和用户选择，拒绝访问敏感目录时须使用其他可选目录。若要求任何磁盘路径下载都无需任何一次授权或关联，则需要额外的、用户明确安装并授权的浏览器扩展或本地助手，不能用普通网页假装做到。Chrome 可提供“Allow on every visit”持久权限，但不能强制或代用户授予。

我建议按**一次性只读授权下载目录 + DOI 自动核验 + 可纠错关联 + 登录状态静默复用**作为网站第一阶段方案。原有账户隔离、私人 PDF 权限和 08:00 更新均不改动。当前已完成只读源码核验，**尚未修改代码、合并或部署本轮功能**；按项目既定“吐槽核实后由用户批准”规则，请确认是否批准这三项作为同一批次实施。如果你的目标包括任意下载目录的完全无感识别，则要另行批准扩展/本地助手方案。

## 来源与实现证据
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/open.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/local-vault.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/page.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/user-ui/library-shell.ts
- https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle
- https://developer.chrome.com/docs/extensions/reference/api/downloads

审批状态：仅核验，待用户批准。没有改变实际 PDF 文件、权限或前端功能。
