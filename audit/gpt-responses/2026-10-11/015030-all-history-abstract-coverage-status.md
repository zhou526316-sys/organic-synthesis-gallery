# Organic Synthesis Gallery — 全历史摘要覆盖状态与本轮正式验证

核验时间：2026-10-11 01:50:30（北京时间；UTC 2026-10-10 17:50:30）
仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一生产基线。
本文件是审计记录，不包含出版社原始全文、私人 Evidence 内容、API 密钥、用户数据、PDF 或图片。

## 已完成、已合并、已通过的变更

- 全历史摘要元数据独立卡片回退及严格 DOI/证据来源：PR #503；已部署。
- 出版社 DOI 身份检查、Semantic Scholar、Europe PMC 和 Springer Nature 可选官方 Meta API：PR #505/#507/#508 及后续来源补丁；均不得据此虚报已抓到摘要。
- 独立历史缺口以及全库批准解读实测：PR #513/#518/#519（均已合并）。
- Nature 公开 Abstract 区块解析及结构诊断：PR #515/#522（均已合并）。
- 本轮 Semantic Scholar 429 限流与可选身份验证：PR #531，CI 全部通过，已合并为 `ec5f88ff85c94bfeb1b70a932c2f7e22deec31c2`。仅用可选 `SEMANTIC_SCHOLAR_API_KEY` 环境秘密、`x-api-key` HTTP 头，有上限的退避，不能访问付费内容，不新增定时任务。

## 可核实的生产真实数量

- 已正式入库 DOI：**938**。
- DOI 核验通过的原始英文摘要存储：**904**（96.4%）。
- 尚无原始英文摘要：**34**。
- 上述 34 篇中仍有可用深度审核解读：**10**；原始摘要与线上可读审核解读均没有：**24**。
- 仓库批准的中英双语深度解读记录：**443**；线上逐 DOI 实测 `available=true` 的当前解读：**423**；**20** 篇当前 Evidence V2 的 `sourceHash` 与 `evidencePacketHash` 均与旧审核记录不匹配，不允许直接重新绑定旧摘要。
- 20 篇失效审核记录分布：JACS 8、CCS Chemistry 7、Nature Chemistry 3、Science 1、Green Chemistry 1。20 中 CCS 7 篇属于上述 24 篇完全无可读摘要的交集，不得重复相加。
- 上述 24 篇双缺口分布：Nature Synthesis 10、CCS Chemistry 7、Nature Catalysis 4、Chem 2、Nature Communications 1。
- 全量批准解读线上核验的成功记录：GitHub Actions [#38068558843](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068558843)。
- 旧版仅返回 `abstractExcerpt` 时是**最多200个字符且具原始来源标记的节选**，不能算公开的完整官方摘要，更不能称已经形成独立审核的完整中英双语概述。两层覆盖不得混报。

## 本轮实际补抓验收

- 由 `audit/automation-triggers/literature-abstract-incremental.json` 受控触发，GitHub Actions [#38073307466](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38073307466)，`conclusion=success`。
- 实际源尝试：34 篇，`incrementalRecovered=0`，`originalAbstracts=904`，`remainingWithoutOriginalAbstract=34`。因此**本轮没有新增摘要**，不能把任务成功误报为内容恢复成功。
- Semantic Scholar：`semanticScholarAuthenticated=false`，新版限流客户端在本轮没有收到429，但 `semanticScholarRecovered=0`。未配置可选独立 API Key。
- Springer Nature：`springerNatureMetaConfigured=false`，因此官方 Meta API 实际调用0次。官方免费基础 Metadata API 需要注册自己的有效密钥，且不保证全部 DOI 有公开可转载摘要；文档：https://dev.springernature.com/docs/api-endpoints/meta-api/
- Nature HTML：**21 个**缺项 DOI 均返回相同的约3036字节网页壳，`doiMetadataMatches=false`、`hasAbs1Heading=false`，不能用放松 DOI 核验来采集。
- Nature Communications `10.1038/s41467-026-78405-z` 跳向 `idp.nature.com` 身份验证域名，按规则停止；CCS Chemistry **10 个**页面返回 HTTP 403，按规则停止。
- 没有新抓历史正文、付费 PDF、SI、正文图；唯一正式新文献发布仍为北京时间每日08:00。夜间23:20仅补 DOI 元数据和摘要索引，不改变正式新增集合。

## 未完成与安全后续

1. 仍需可信原始摘要：34 篇。优先由已设计并通过测试的 Springer Nature Meta API、Semantic Scholar 官方API或作者公开版本等**真实可用且授权的来源**补齐。API Key 必须由仓库所有者通过 GitHub Actions Secrets 设置，绝不能粘贴到公开代码或日志；没有配置时不可宣称补齐。
2. 仍需有效审核解读的复核：20 篇。必须对当前 Evidence V2 执行双遍事实核验，当前 `sourceHash` 与 `evidencePacketHash` 均不匹配，禁止只改哈希“恢复”旧摘要。可在独立经过授权的审稿流程处理，不得无视现有10月1日后深度解读范围契约。
3. 用户最终目标“未来历史文献全部有摘要”仍**未达到**。每一条未来 DOI 必须保留 `source_available`、`reviewed_bilingual_available`、`rights_status`、`pending_reason` 和展示端实际可读状态，不得凭标题生成研究数据或混淆“索引含200字符节选”与“完整审核双语摘要”。
