Beijing date: 2026-10-06
Context: China-first PDF Vault architecture review
Related architecture commit: da382dcc954bead26800730c2f06570a927d0f9d

我已经按“主要用户在中国”重新审核，并把架构定稿为 **China-first PDF Vault v1**。这次不是在上一版上小修，而是调整了默认优先级。

最大的修正有五个：

1. **桌面真实本地文件夹优先，OPFS 退为兜底/缓存。** 对中国科研用户，Windows + Edge/Chrome 是最可靠的长期文献管理环境。支持目录选择时，让用户选择一个真实 `Organic Synthesis Gallery` 文件夹；PDF 可以被 Zotero、本地模型、同步软件直接访问。`showDirectoryPicker()` 目前仍不是所有主流浏览器统一支持，所以 OPFS 必须保留为 fallback；而 OPFS 本身受浏览器配额管理，清除站点数据会删除其中内容，因此不适合作为唯一长期副本。

2. **微信/手机不承担主要的付费 PDF 获取工作。** 手机端仍可看摘要、收藏、阅读状态和已存在的 PDF；遇到需要校园网/VPN/机构登录的文献，优先提供“待电脑获取”。用户回到学校网络或打开 aTrust/VPN 后，在电脑端继续完成。这比强迫微信 WebView 完成出版社登录和下载稳定得多。

3. **国内同步优先，不再把 Google Drive/全球 OneDrive 放在第一梯队。** 第一阶段甚至不需要任何云盘 API：用户可直接把 Gallery 本地库目录放进自己已有的同步目录。第二阶段再接国内能力，优先评估百度网盘 OAuth/API；坚果云明确提供第三方 WebDAV 应用授权，但我建议通过本地 helper/桌面桥处理，避免 Gallery 前端或服务器长期保存 WebDAV 应用密码。中国版 Microsoft 365/OneDrive 可以作为高校/机构用户选项，但它有独立的 21Vianet/中国区 Graph 与登录端点，不能和全球版当作同一套接入。

4. **现有 private PDF 系统不能直接开放给所有用户。** 现在仓库里的 `private_pdf_documents + R2 + private_pdf_read + 5 分钟读取 token + 7 天 capture lease` 是适合站长的私有链路。多用户版必须另建 `user_documents / user_document_copies / pdf_capture_sessions`，按 `user_id + DOI + copy` 做授权。普通用户的获取会话改成一次性、DOI/出版社绑定、约 10–15 分钟有效；现有 7 天 lease 只保留给你的运维/Tampermonkey 自动化。

5. **D1 只做控制面，不存 PDF，也不存大规模全文索引。** Cloudflare 当前 D1 单库上限是 10 GB，官方也建议按 user/tenant 等方式水平拆分。因此现在已有的 user-library row shadow 是正确方向，但 PDF manifest 也要按可分片方式设计，不能以后把几百万、上千万用户文献记录都压在一个不可拆的单库里。

我建议最终分成四层：

| 层 | 内容 | 中国版默认策略 |
|---|---|---|
| 公共文献层 | DOI、题目、TOC、摘要、正文图 | 现有 Hot/Archive + 公共数据 |
| 用户控制层 | 收藏、阅读状态、备注、PDF 状态、hash、版本、设备状态 | D1，可分片 |
| PDF 数据层 | PDF bytes | **桌面真实文件夹 > OPFS > 用户个人云 > 可选 Gallery 云** |
| 知识层 | 页码文本、全文索引、批注、embedding | 默认本地且继承 PDF 权限 |

卡片 PDF 按钮也不应只有“有/没有”两个状态，而应该变成：`PDF`、`PDF · 本机`、`PDF · 云端`、`PDF · 另一设备`、`PDF · OA`、`PDF · 需权限`、`PDF · 获取中`。点击时按“当前设备副本 → 用户云副本 → OA → 重新获取出版社版本”的顺序处理。这样用户换电脑时不会把“另一台电脑里有 PDF”误显示成“当前机器可以直接打开”。

中国环境下，我不建议把所有用户 PDF 默认放到 Cloudflare R2。Cloudflare 官方说明，面向中国大陆的 China Network 是单独的 Enterprise 订阅并要求 ICP；R2 虽可配合中国网络使用，但 bucket 不能创建在中国大陆，且 R2 自定义域名在大陆 China Network 中不支持，只能借助 Global Acceleration 等方案。因此当前 R2 最适合继续承载你的站长私有 PDF/海外备用，而不是所有大陆用户的默认 PDF 盘。

即便改成国内对象存储，也不能从根本上解决成本。腾讯 COS 中国大陆标准存储当前约 0.118 元/GB/月，阿里 OSS 标准存储约 0.12 元/GB/月；按平均 5 MB/PDF 粗算，1,000 人 × 500 篇约 2.5 TB，仅存储约 295–300 元/月；10,000 人 × 1,000 篇约 50 TB，仅存储就约 5,900–6,000 元/月，还没算下载流量。腾讯 COS 的公网下行当前标价约 0.5 元/GB，所以大量在线阅读时流量费用反而可能高于存储费用。这个量级说明 **local-first 不是为了省一点钱，而是决定这个产品能否规模化。**

版权/权限边界也要固定下来：OA PDF 可以经过明确 OA 验证后做公共缓存；机构订阅 PDF 永远 user-scoped。用户 A 已经获取过某 DOI，绝不能因为服务器上已有相同 hash 就让用户 B 获得读取权。跨用户 dedup 只能用于已经独立验证为开放/可公共缓存的内容。

AI 层我也做了调整。保存 PDF 后，在浏览器或桌面 helper 中用 PDF.js/Web Worker 做页码级文本抽取和本地全文索引。付费文献的全文默认仍只在本地，不自动上传。以后可以提供两种模型入口：一是 **桌面 MCP bridge**，让 Claude Desktop、Cursor、本地模型等直接读用户选择的本地文献库；二是账户级 Knowledge API，只允许访问用户明确同步到云端并授权的收藏夹/文献。这样不会因为将来换模型而重做 PDF 存储。

实施顺序也已经重新排好：

**P0**：只做数据模型和 PDF 状态机，保留现有站长 private-PDF 完全不动。  
**P1**：Windows/Edge/Chrome 真实本地文件夹 + OPFS fallback + PDF.js 内置阅读器 + “待电脑获取”。  
**P2**：Tampermonkey 改为用户一次性 DOI capture session，不传学校/VPN/出版社凭据。  
**P3**：国内跨设备方案，先 provider-neutral 同步目录，再评估百度网盘、坚果云和中国版 Microsoft 365。  
**P4**：如果确实有用户需要，再增加带配额的 Gallery 私有云备份；大陆部署时再解决 ICP、国内对象存储和数据合规。  
**P5**：全文搜索、页码引用、桌面 MCP、Knowledge API 和模型接口。

有一条我认为必须现在就定死：**“PDF 保留在卡片上”只表示这个账户知道 PDF 的位置和状态，不等于 PDF 一定存在 Gallery 服务器。** 卡片是知识入口，存储可以在本机、个人云或可选服务器上。这个抽象一旦做对，后面无论用户是 100 人还是 10 万人，PDF 容量都不会迫使我们重构整个网站。

我已经把这版规则写入 `architecture/PDF-VAULT-CHINA-V1.md`，架构提交为 `da382dcc954bead26800730c2f06570a927d0f9d`。下一步真正实施时，应从 **P0 + P1** 开始，而不是先做云存储。
