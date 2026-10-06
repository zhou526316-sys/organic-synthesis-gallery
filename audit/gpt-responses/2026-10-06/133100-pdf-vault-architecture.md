Beijing time: 2026-10-06 13:31 +08:00
Context: PDF Vault / personal knowledge base architecture advice

我建议做，而且我认为这可以成为 Gallery 从“文献发现网站”升级为“个人科研知识库入口”的核心功能。但架构上不要做成“所有用户下载的 PDF 都进入 Gallery 服务器”，而应该做成一个 **Local-first / User-owned PDF Vault**。

你描述的交互可以保留，但名称上我建议把“请求出版社权限”理解为“获取 PDF”。出版社通常并不存在一个统一的“向 Gallery 返回是否有权限”的 API；真正决定访问权的是用户当前的校园网/IP、VPN、出版社账号或机构登录状态。Gallery 不应该接触、代理或保存用户的学校账号、出版社 Cookie 或 VPN 凭证。普通网页也无法可靠读取另一个出版社域名页面最终是否下载成功，因此全自动链路需要浏览器辅助层——你现在已有的 Tampermonkey 路线正好可以继续承担这一职责。

我建议卡片上的 PDF 按钮采用状态机：第一次显示“PDF”；点击后优先检查这个用户是否已有本地/个人云端副本，有则直接打开；没有则打开出版社 PDF 获取流程。成功获取后提示“仅本次打开 / 保留到本机 / 保留到个人云盘”。以后卡片可以显示“PDF ✓ 本机”或“PDF ☁ 云端”。“保留在卡片上”实际只保存一个 PDF locator、内容 hash 和状态，不把 PDF 塞进卡片数据。

存储架构建议如下：

| 层 | 保存内容 | 建议位置 |
|---|---|---|
| 公共文献层 | DOI、题目、作者、期刊、TOC、摘要等 | 现有 Gallery / D1 |
| 用户文献状态层 | 收藏、阅读状态、PDF 是否拥有、PDF provider、hash、大小、版本 | D1，数据量极小 |
| PDF 文件层 | PDF 原始 bytes | **默认 OPFS 本机；其次用户自己的云盘；R2 只作为可选私有备份** |
| 知识层 | PDF 文本、章节、页码映射、批注、标签、全文索引、未来 embedding | 优先本地/用户私有存储，可按需同步 |

浏览器的 OPFS 很适合第一阶段：它属于网站自己的高性能私有文件系统，目前主流浏览器已经广泛支持；可以用 navigator.storage.persist() 请求持久存储。缺点是它属于当前设备/浏览器，用户清除站点数据仍可能删除，所以界面必须明确显示“本机保存”，并提供备份/迁移能力。citeturn807594search0turn807594search1turn807594search7

这意味着一个普通用户保存 500 篇 PDF，哪怕占 3–5 GB，**你的服务器仍然只保存几百 KB 到几 MB 的索引和个人状态**，真正的几 GB 在用户电脑里。因此用户从 100 人增加到 10 万人，Gallery 的 PDF 存储压力不会同比增长。

第二层我建议做“用户自带云盘”，优先 Google Drive / OneDrive，后面再考虑 WebDAV、Dropbox 等。这样用户换电脑后仍能看到“PDF ☁”，点击直接从自己的云盘读取。Gallery 只保存 provider + fileId + DOI + hash，不承担 PDF 容量。对于高校科研用户，这种模式尤其合适。

Cloudflare R2 可以保留，但不要作为普通用户默认存储。你现在仓库里的 private_pdf_documents + R2 + 短期访问 token + Range 读取已经是一套可用的“站长私有 PDF”基础设施，建议继续保留给你自己和未来明确选择“Gallery 云备份”的用户，不要直接扩展成所有用户共享的 PDF 池。R2 本身倒不是容量瓶颈：2026-10-01 的官方价格是 Standard $0.015/GB-month，10 GB/月免费，R2 直接出站流量免费。按平均 5 MB/PDF 粗算，1,000 人各保存 500 篇约 2.5 TB，单纯存储约 $37.5/月；10,000 人各保存 1,000 篇约 50 TB，则约 $750/月，另外再加请求费用。也就是说，真正需要优先防范的不是“服务器磁盘会不会爆”，而是长期成本、权限隔离和版权/授权边界。citeturn226714view0

版权和权限这里需要设一条硬规则：**开放获取 PDF 可以做公共缓存；需要机构权限获取的 PDF 必须永远是 user-scoped。** 用户 A 获取过某 DOI，不能因此让用户 B 直接获得该文件。即使二者 PDF hash 完全相同，也不要把“服务器已有文件”等价成“另一个用户有阅读权”。这样你的产品逻辑是“帮助用户管理其自己取得的合法副本”，而不是建立出版社 PDF 的公共镜像库。

你现在的 Tampermonkey 支线其实非常适合下一步升级。完整链路可以变成：

1. 用户在 Gallery 点击 PDF；Gallery 创建一个一次性 capture session，只包含 userId/DOI/sessionId，不包含学校凭证。
2. 打开出版社页面；用户自己的校园网/VPN/机构登录决定是否可以访问。
3. Tampermonkey 检测到真实 PDF 后，在用户浏览器里完成校验（PDF magic、DOI、大小、hash）。
4. 根据用户设置，把文件写入“本机 Vault / 用户云盘 / 可选 Gallery 私有云”；成功后只把 locator、hash、版本、大小同步到 Gallery。
5. 卡片立即变为“PDF ✓”；以后点击先查 Vault，不再重新从出版社下载。

如果没有安装 Tampermonkey/浏览器助手，就降级为普通模式：打开出版社 PDF，用户下载后可以把 PDF 拖回卡片或点击“导入已下载 PDF”。这样整个功能不会因为辅助脚本不存在而不可用。

更重要的是，你后面提到的 AI。这部分我建议现在就预留，而不是以后再改数据库。PDF Vault 的每个文件应生成统一的 DocumentManifest：userId + DOI + contentHash + sourceVersion + pageCount + storageProvider + assetLocator + extractedTextVersion。然后用 PDF.js 在浏览器端提取文字，建立页码—文本映射和全文搜索。这样以后无论你自己开发模型，还是用户把文献库接给 ChatGPT、Claude、Gemini 或本地模型，模型层都不需要知道 PDF 存在 R2、Drive 还是 OPFS，只调用同一套 Document API。

长期我甚至建议 Gallery 提供一个用户授权的 **MCP/Knowledge API**，例如 search_library、get_paper、get_paper_text、list_collections、get_notes。用户可以只授权“我的课题”收藏夹给外部模型，而不是把整个账户暴露出去。这会让你现在做的收藏夹、阅读状态、私人备注、全文和 PDF 真正汇合成一套个人科研知识库。

实施顺序上我建议非常明确：**第一阶段先做 PDF 按钮 + OPFS 本地 Vault + D1 manifest，不改现有站长 private-PDF 链路；第二阶段把 Tampermonkey capture 改成面向登录用户的一次性 capture session；第三阶段加用户自己的 Google Drive/OneDrive；第四阶段再提供可选 R2 云备份和配额；第五阶段做全文索引与 MCP/模型接口。**

我不建议现在直接做“所有用户 PDF → R2”。先把 local-first 的数据模型定下来，后面无论用户达到 1 万、10 万还是更多，都不会因为 PDF 数量而被迫推翻架构。这个方向也和我们现在正在做的三个月 Hot/Archive 分流理念一致：**公共站点保持轻，重数据按用户、按需加载。**
