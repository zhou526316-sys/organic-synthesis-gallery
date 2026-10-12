# PDF Vault: actual file not found after authorized-folder search — read-only diagnosis

- 北京时间：2026-10-12, 08:54:53
- 对话工作线：本地 PDF 直读功能 / 用户截图后反馈
- 涉及 DOI：`10.1021/acscatal.6c06048`
- 生产仓库：`zhou526316-sys/organic-synthesis-gallery`（`main`）
- 批准状态：**未批准本次新反馈的修复；仅只读诊断，未修改功能代码、未合并部署**
- 截图显示：已选择下载目录；浏览器显示“已检查授权目录，未找到首页 DOI 匹配的正文 PDF”；当前有“更换下载目录”“重新搜索已下载 PDF”等控件。截图未包含本地真实文件夹路径、文件名或文件字节，因此不能断言是哪一个具体 PDF 解析失败。

## 源码核查

1. `src/pdf-vault/download-discovery.mjs` 的 `readCache` 会持久保留 `status = 'unknown' / 'unreadable' / 'ambiguous' / 'supporting'` 等负结果；检索时如果文件的 `size` 与 `lastModified` 未改变，就直接复用旧记录，`identify()` 不再次运行。即使点击“重新搜索已下载 PDF”，`src/pdf-vault/open.mjs` 的 `manuallyScan()` 仍调用同一函数，未清理该负结果。**这是可确定的代码缺陷**，可解释“PDF 明明在目录内，却反复匹配不到”的一类情况；但尚不能证明该用户具体文件就是这一原因。
2. `collectFiles()` 只检查授权目录及一级子目录，深度超过一级的目录没有遍历；因此其中文件可能完全不进入候选集，仍出现 `not_found`。截图不能确认实际文件所处层级。
3. `src/pdf-vault/reader.mjs` 和 `doi-identity.mjs` 仅使用 PDF 元数据及首页拼接文本，要求唯一可确认 DOI；真实 ACS PDF 中换行、字符分段、多个 DOI、SI 提示等可能导致 `unknown`、`ambiguous` 或 `supporting`。这是一项尚未以用户真实 PDF 重现的适配风险。
4. `tests/pdf-vault-local-browser.mjs` 的自动发现回归使用带明确 `DOI: ...` 文本的自造双页矢量 PDF，并非真实 ACS Catalysis 排版，故“36/36 通过”不能证明该 DOI 的真实下载文件可被自动识别。
5. `open.mjs` 的 `not_found` UI 没有列出发现的 PDF 数、读取失败数、已缓存负结果数、超层级遗漏或实际 DOI 检测结果，容易误导用户将“匹配失败”理解为“文件不存在”。

## 用户可见回复正文（包含先前已展示的部分）

核查正式版源码后，确认自动检索存在一个实际缺陷。

**程序会把一次失败的 PDF 识别结果长期缓存。** 如果某个文件第一次解析超时、无法提取 DOI，或被判定无法识别，只要文件大小和修改时间没有变化，后续点击「重新搜索已下载 PDF」也可能直接使用上次的失败结果，而不重新解析。

因此，**文件确实在你授权的目录里，网页却反复提示找不到，是完全可能发生的**。目前的提示还无法区分“没有扫描到文件”和“扫描到了，但 DOI 校验未通过”。

这属于此前上线的自动发现功能没有处理好的情况。

进一步确认了两处相关限制：当前代码只遍历授权文件夹及其一级子文件夹；对 PDF 的身份判断只用元数据和第一页提取文字，而目前通过的浏览器测试使用的是预先写有清晰 DOI 的合成 PDF，不能充分覆盖真实 ACS Catalysis 文献版式。

从截图只能确认程序返回了“未匹配”，**无法确定该文件是否实际进入过扫描、哪一步识别失败**。因此不应把它简单归咎于你选择了错误文件夹。

**建议修复范围：** 让“重新搜索”强制重试此前未识别/失败的目标 PDF，而不是永久复用负缓存；将授权目录深层子文件夹纳入有界、可继续的增量遍历；提高 ACS PDF 的 DOI 提取容错性（但仍禁止将不同 DOI 的 PDF 错配）；在页面显示本地扫描文件数和失败原因，而不上传文件路径或内容。再增加接近 ACS 正文排版的 DOI 识别回归，并保持原始文件和账号权限不变。

**暂时的处理办法：** 你可以在这篇文献的页面点击「手动选择或更换 PDF」，直接选择电脑上的原文件。如果成功，说明文件可读，而自动索引/目录发现这条路径需要修复；如果仍提示 DOI 不匹配或无法识别，则更可能是论文 PDF 解析问题。不要清除浏览器网站数据，避免丢失已有的本地关联和授权。若愿意提供这篇 PDF 的文件名、所在子目录截图或将该 PDF 上传到聊天，可进一步核实具体文件，但这不是确认代码缺陷的必要条件。

按此项目既定的“反馈先核实、用户批准后修改”规则，本次**尚未改动或部署代码**。**是否批准按上述方案修复这次“已下载却找不到”的问题？**

## 源文件

- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/download-discovery.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/open.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/doi-identity.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/pdf-vault/reader.mjs
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/tests/pdf-vault-local-browser.mjs

响应同步记录仅作证据归档，**不得标记本反馈“已修复”**。
