# Organic Synthesis Gallery — 摘要统一采集接续与最新核验（北京时间 2026-10-11）

对话上下文：摘要统一采集工作线，承接 2026-10-11 全历史摘要审计及相关已批准工作。仓库 main 是唯一正式生产基线。

已承接此前的实施记录、审核规则、历史回溯约束及最新验收数据。工作目标是：现在与未来正式收录的所有有机合成文献，取得 DOI/来源/版本核验的真实原始英文摘要，并逐步完成有证据依据、独立两遍科学审核的中英双语概述。不能把 200 字符原文节选、私人原文库存、或旧 approved 标志冒充线上可读的完整双语摘要。

## 最新实际基线
- 正式 DOI 938。
- DOI 验证的原始英文摘要 904（96.4%）；缺原始摘要 34。
- 443 份曾获批准的双语深度解读，其中 423 份线上可读；20 份 sourceHash 和 evidencePacketHash 均与当前 Evidence V2 不匹配，必须重新对当前正文证据独立双遍复核，不能只换哈希。
- 缺原始摘要的 34 中，10 篇另有可读审核解读，24 篇缺原始摘要且缺线上可读审核解读。按至少有原摘要或可读深度解读定义，当前 914/938（97.4%）有来源/解读覆盖，但这绝不意味着已经完成 914 篇正式完整双语摘要。
- 双缺的24篇：Nature Synthesis 10、CCS Chemistry 7、Nature Catalysis 4、Chem 2、Nature Communications 1。
- 20 份证据变化的旧审核解读：JACS 8、CCS Chemistry 7、Nature Chemistry 3、Science 1、Green Chemistry 1；其中 CCS 7 与24双缺相交，不得简单累加。
- 上述 counts 出自 audit/gpt-responses/2026-10-11/015030-all-history-abstract-coverage-status.md，全量审计 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068558843 。

## 核实的仓库实现
- PR #503、#505/#507/#508、#513/#518/#519、#515/#522，以及 #527、#529、#531 均已合并，相关规则记录于 docs/all-history-basic-abstract-contract.md。
- #527 针对曾因 Evidence 重新打包而不可读、但源文字指纹不变的78篇提供严谨的内容等价性复核；#529 保留正文确实变化的20篇 DOI 级复核队列。
- PR #531 已合并；GitHub Actions #38073307466 对34个缺原摘要执行真实补抓，新增0。Semantic Scholar 本轮无 429，但无合格摘要；其可选密钥未配置。Springer Nature Meta API 已实现但 SPRINGER_NATURE_API_KEY 未配置，不能视为实际调用成功。Nature 21个失效官方网页只返回约3036字符、无 DOI/Abstract 的壳页面；CCS 官方页有403。
- 官方 Springer Nature Meta API / Meta DOI 元数据来源可通过 dev.springernature.com 申请/订阅适用密钥，须遵守网站当前条款、DOI严格验证和版权限制；原始摘要私人索引存在不等于可整段向公众转载。
- 23:20 GitHub Actions metadata-only recovery 为已有任务，不新增重复 cron；未来已获学术审核正式入库的历史 DOI 同样进入缺摘要索引。历史候选、pending 不算正式入库。
- 实际查询用户现有 Scheduled Tasks：每日12:00“Gallery 摘要发布”当前 is_enabled=false；不可把它当成仍在执行。未经恢复前所涉故障和凭据安全核查，不擅自重启。
- 历史回溯 Issue #498 仍为 open，工作线需把“历史发现 / 审核准入 / 摘要索引 / 双语审阅 / 公开可读”分成独立状态。

## 下一步执行顺序和不变约束
1. 由仓库所有者在 GitHub Actions Secrets 中安全设置 SPRINGER_NATURE_API_KEY（Semantic Scholar 可选），不向聊天/Git日志粘贴。此连接器不提供 Actions Secrets 的写入能力，本轮无法代为配置。
2. 配置后复用现有增量摘要任务；用实际报告新增 DOI 数、原摘要34缺口变化、内容完整性与逐 DOI 线上读取核验；不能凭任务 success 宣称修复。
3. 20篇证据实质变化解读从当前 Evidence V2 重新双遍科学核对，旧稿仅作比对参考，不改旧证据哈希。
4. 对其余所有已收录与未来历史 DOI，按元数据真实来源完成独立双语审核，并分别统计原始全文摘要、200字符摘录、基础双语概述、深度 Evidence 解读、有效在线可读率；无源保留pending/rights状态，不凭标题编造反应条件和机制。
5. 每日正式新增仍为北京时间08:00唯一槽；2026-07-01之前历史metadata_only，7—9月toc_only；摘要元数据补抓不能衍生历史正文图、付费PDF/SI采集；10月1日后媒体规则由Tampermonkey专线保持，摘要管线不越权。
6. 核查到旧12:00摘要任务配置含应安全处理的私钥材料；本记录不复制或披露它们。恢复任务前建议先移除任务正文中的密钥并以凭据托管/密钥轮换取代。当前未改自动任务。
7. 本轮仅核实、承接并记录，没有生产摘要新增、重新审核发布、密钥配置或定时任务更改。
