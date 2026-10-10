# PDF verification coverage: all DOI inventory, no overclaiming full readability

- Beijing time: 2026-10-10 15:00:12 +08:00
- Context: Architecture/PDF project chat, user reports several manually tried Tencent PDFs work and asks how to know all do
- This turn: read-only source audit and proposed acceptance plan. No production/data/authorization changes, no bulk requests or 256MiB quota impact
- Main source inspected: `cloudflare/worker/src/private-pdf.js`, `cloudflare/worker/src/private-pdf-processing.js`, `scripts/private-pdf-readable-verifier.mjs`, `deploy/pdf-gateway/gateway.py` on PR420 branch, `public/pdf-gateway-routing.json`

## User-visible partial answer

**不能只凭这几篇成功，就判断所有 PDF 都能打开。** 要得到可信的结论，需要建立一套覆盖全库、逐篇记录结果的自动验收机制，而不是让用户手工打开几百篇论文。

我核对了系统：后台只有 `active=1` 且 `processing_state=ready` 的 PDF 才会被选为可阅读文件。入库时已有文件内容/哈希/页数和身份验证，但这不代表实际网络传输与浏览器阅读成功。腾讯网关有 `256 MiB/月` 的保守月度保留额度，不能对成百上千篇文献重复下载 1MiB+ 的前后分段或整份 PDF。应采用全库轻量检查、大文件分层实测、真实浏览器抽样，且未测试文献不可计为验收成功。

## User-visible terminal answer

我核对了接口设计，实际上已有两块可复用的基础：管理员的 PDF processing/status 能返回 `ready/failed/active` 等库存汇总，已授权采集者的私有 PDF inventory 接口可一次提交最多 80 个 DOI 并返回逐篇 `ready/pending/failed/missing`。但这只是库存，不证明 100% 能读。

建议新增内部（仅管理员可见）的全量验收报表，覆盖以下四个不同维度：

1. **全库库存对齐（100% DOI）**：以网站实际 DOI 为分母，按 `ready/pending/failed/missing` 逐篇列出；10月1日之后作为单独重点分组，也保留早期已入库文献。去重版本并匹配有效内容 SHA-256、字节长度和后端 PDF 解析证明。没抓到 PDF 的论文不能纳入“已通过”。
2. **已入库文件逐篇做低流量真读**：有权会话对每篇 `ready` 文献独立请求授权，读取极短头部和末尾数据，验证真正的 GET、206、Content-Range、完整响应体和 PDF 结构；HEAD/HTTP200/只检查 metadata 不算读取成功。并验证 `401/403` 不越权。整个过程限速、记录每篇耗时和明确的失败类型、重试次数、最近验证时间，绝不打印票据、Cookie 或 PDF 字节。
3. **分层大段/整页验收**：按期刊、出版社、大小、线性化情况和近期失败率选样，逐个实测 1MiB 前段+末尾段，使用受控的真实 Edge/安卓手机网络加载第1、2页并连续滚动；对超时的 DOI 定向重跑。全库 R2 侧已有文件强哈希/PDF.js 检查可避免腾讯全量外发大文件。计量前先核查月度网关剩余额度，预留给正常读者。100 篇若每篇实际外发头尾约1MiB，按网关 1.2x pessimistic reserve 已几乎吃掉 256MiB 月配额，因此不可无界跑。
4. **发布与日后追踪**：每天北京时间 08:00 正式新增之后按入库完成进度增量扫描新 DOI，历史文献分批轮换抽测；失败自动归类并推送管理员，不让 1 条网络异常拖死所有文章。报表统计分母、ready、逐篇真读通过、实际第1/2页通过、未测、异常和最近时间。不同账号权限和中国运营商/手机浏览器分开测试。

准确的目标不是“所有网络、任何时刻保证100%成功”，这是第三方网络无法保证的。可以建立“截至某时间全库100%纳入核查、已入库逐篇完成指定真读，未通过逐篇列出”的可复核证据。腾讯当前是反代 Cloudflare Worker/R2，并非在腾讯主机永久存储所有 PDF，因此 Cloudflare 上游整体异常时仍可能失败。

目前从当前聊天与公开 GitHub 没有获授权读取 D1 全部论文的实际库存统计，**不能凭之前的几篇成功编造全库成功率或 ready 数量**。我尚未执行全库账号授权测试，也没有用完月度配额，更未打开全站自动回退。新建这种全库自动验收属于新的反馈工作批次，依项目规则需用户明确批准后实施，并会复用现有安全清单/管理员接口。确认后实施自动验收并交付真实逐篇失败清单，不改变已验证的 PDF 连续滚动和画质。

### Proposed succinct closing user prompt

如果你批准，我将以现有已入库 DOI 为全集，搭建全库 PDF 自动验收报表：每篇可查，异常列明，新增每天自动补验，并严格限制腾讯流量；不会靠抽样结果宣布全库可读。
