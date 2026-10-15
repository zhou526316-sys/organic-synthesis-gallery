# 2026-10-15 北京时间约 19:44 | 历史回溯续作：Chem PR #694 / #695 + Q3 Staging 实际复算

项目：抓取有机合成文献并持续更新网页。对话上下文：用户“继续”，承接上一轮已合并 #686/#687/#688/#691 与正式08:00唯一发布门禁，继续全部16刊Q3历史回溯。记录此次聊天已送达用户的结果与验收闭环；无 API Key、私密PDF或其他秘密。

## 第一段已向用户报告的成果——新增 Chem 审核

重新读取 main 与独立 Q3 staging，交叉核查四篇 Chem 历史候选的真实出版社类型、首次在线日期和冻结 Git 源 DOI：
- Chem `10.1016/j.chempr.2026.103244`，*Synthesis and optimization of ionizable lipids for RNA delivery*，**2026-09-24**，官方 **Review**。内容总结已有离子化脂质头基、连接臂、尾基的合成，不可凭含“synthesis”认作此DOI独立原创方法。
- Chem `10.1016/j.chempr.2026.103254`，*Opportunities for merging biosynthesis and biocatalysis*，**2026-09-25**，官方 **Perspective**。综述真正原始酶催化研究但其本篇不是独立新反应。
- Chem `10.1016/j.chempr.2026.103264`，*The recycle reality: A process-level perspective on catalytic CO2 hydrogenation to methanol*，**2026-09-24**，官方 **Perspective**。工业循环气、催化剂评价与技术经济模型为主要贡献，不能误认为普适有机制备方法。
- Chem `10.1016/j.chempr.2026.103199`，*Single-catalyst operando photoluminescence spectroscopy of perovskite quantum-dot-driven photoredox reactions*，**2026-08-13**，官方原始 **Research Article**，不同于冻结源错误卷期哨兵 `2026-08-01`。C–C偶联和C(sp³)–H溴化是真实有机反应的验证实例，但此独立 DOI 新意在单量子点 operando 光致发光、电荷转移与Pb还原失活机制，而非新通用制备方法，经过两遍单篇审查属于 Gallery 科学范围排除；不是 Review，不是用户永久排除，也不否认存在真实有机化学。

这些结果都逐DOI、标题、来源 SHA、原始 review Git blob 绑定，源分片不动。不能把评述引用的独立原始文献错判、错排或错收。

## 第二段已向用户报告的成果——PR #694 成功合并

GitHub PR https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/694 全部 **6/6 必需 CI SUCCESS**，按实际 head SHA 租约合并到 main，提交 **`5441d45bdbaa0c7fed0b3b2f8494cd77fc0fb3fc`**：
- 3篇 Review/Perspective 分类和已核实的真实 first-online 日期入 `audit/historical-reviewed/q3-publisher-nonresearch-exclusions.json`，其原始官方PII是 `S2451929426003104`, `S2451929426003207`, `S245192942600330X`。
- 103199 官方 Article PII `S2451929426002652` 与 8/13首发独立日期证据及科学两遍scope排除。
- 代码区别“已核实首发日期匹配原冻结日的官方Review/Perspective”与“冻结 issue-month sentinel 但二级文章真实在线日未知”；允许 Elsevier PII末位X的源精确匹配，不关闭fail-closed。
- 新增回归包括 DOI/title/type/日期/来源根哈希/反例篡改，不更改正式目录、D1、媒体或公众号。此合并不是当日发布，也不是完成季度重算。

## 第三段已向用户报告的成果——PR #695 全部 CI 通过并合并

后续依赖于已通过的#694分支 PR https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/695，所有**6/6 CI SUCCESS**（Q3 root/provenance, admission isolation, TM, PDF, Site/Playwright），lease-safe merge **`e356f6ec62f11cb8fe0fd85f1fab12352748df4b`**：
- Chem `10.1016/j.chempr.2026.103074`，*Cluster-enabled control of single-electron photoredox catalysis in reticular frameworks*，原始 Research Article 官方 first-online **2026-06-02 = Q2**，不是冻结源 2026-09-01 的 Q3；原文报道TiFe₂ MOF催化脱羧Giese C–C成键，Q2学术范围需单独证据审查，不按 MOF 关键词自动排除。
- Chem `10.1016/j.chempr.2026.103136`，*Direct conversion of N2 and CH4 to valuable N-containing compounds via a plasma-activated catalytic process*，官方首发 **2026-07-10 = Q3**，冻结源 07-01；Ni/SiAlO+非热等离子体由 N₂/CH₄ 直接得到甲胺、乙胺和氨，C–N成键属真实化学制备。公开的生产速率（胺0.88、NH3 6.43 mmol gNi⁻¹h⁻¹）不是独立分离收率，缺乏跨底物范围、产物分离/物料衡算时**科学证据待核**，不是自动exclude/include。
- Chem `10.1016/j.chempr.2026.103194`，*Phosphate group-assisted interfacial proton diffusion facilitates direct ethylene electro-oxidation to ethylene glycol*，官方首发 **2026-07-30 = Q3**，冻结源 07-01；乙烯->乙二醇真实C–O键构建。AgPd/植酸界面FE **40.8% at 100 mA cm⁻²**、EG生成速率 **758.6 μmol/h**，不能等同分离收率或烯烃双羟化的已证实通用底物范围，**科学证据待核**。
- 分开的日期证据、两个独立科学pending proof和 fail-closed 测试接入原有 `runQuarterAudit`，没动受保护正式 DOI 数据、永久排除、D1、媒体、PDF、Today/Hot/公众号或唯一08:00发布槽。

## 第四段已向用户报告的成果——真实 Q3 Staging 复算

通过原有正式授权 GitHub staging-only 触发文件 `audit/automation-triggers/historical-review-triage-bootstrap.json` 在 main 提交请求 **`636f00781bf165c3685b7935b2239284928eeac6`**，沿用现有流程，没有新增任务或任何正式文献发布。实际 GitHub Actions run **https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38729025555** 结果 **SUCCESS**。

真正重读单独 staging 分支 `staging/historical-archive-nightly` 上两份审计文件，而不是臆测工作进度：
- `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob **`27004b45ff285ec4351bc4b394019e1069aa5c3f`**。
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` Git blob **`d5f29ea30a19f2aca3df69900f3c8bff7b67c737`**。
- 两者严格相同 **`generatedAt = 2026-10-15T11:41:09.082Z`**，即北京时间 **19:41:09**。

本轮前 -> 本轮后：
| 审计指标 | 旧快照 | 新快照 |
|---|---:|---:|
| 16刊唯一来源DOI | 12,286 | 12,286 |
| 192个Q3来源窗口 | 192/192 | 192/192 |
| Q3正式收录 | 851 | 851 |
| 未完成候选 | 11,254 | **11,247 (-7)** |
| 期刊原文确认非原创 | 94 | **97** |
| 科学范围双遍排除 | 49 | **50** |
| 独立科学证据待核 | 8 | **10** |
| 出版社首发日期差异 | 20 | **24** |
| 出版社确认真实 Q3 之外 | 9 | **10** |
| 已审待唯一08:00正式发布 | 8 | **8** |

真实 staging worklist 确认 `103199` 8月13日Q3，`103074` 6月2日Q2，`103136` 7月10日Q3，`103194` 7月30日Q3；后两篇拥有独立 `evidenceNeeded`、`nextAction`，非旧正规manifest日期pending。所有 source DOI 不丢失、冻结原始卷期记录未被重写。生产保护文献 blob 仍与合规发布授权相同 `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`；最新复算未改变1,151篇全站正式文献。

**重要：16刊出版社官方 Research 目录季度闭环标记 `publisherIssueResearchReconciliationComplete=false`。** 11,247是候选元数据未审数量，不代表真有这么多有机合成论文漏收，1,000/季度只是召回警告假设，不是配额。16刊已发现来源分账耗尽的期刊并不保证官方全部 Online-first DOI 收全。

## 下一步及边界

继续16刊官方 Research DOI TOC和 Online-first真实日期逐篇校验；优先高权威原始方法学及高漏检风险，严禁单凭标题/关键词批量exclude或纳入。现有旧快照来源未完成按大类：Nat. Communications 3,158、Angew 1,648、JACS 1,269、Science Advances 1,154、Nature 1,098（这些数字仅元数据未分类，并非合格漏收数）。Q2 的 `103074` 独立审查；有真实有机制备但制备证据未明的 `103136`、`103194` 继续有针对性看 SI/正文范围，不把FE当分离收率。所有历史正式入库仍只在北京时间每日08:00统一已有合法发布槽执行，历史条目不得进入Today/Hot/微信公众号每日新增。

真实本轮证据和审计更新已经写入 Issue #498：
https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6191219896

此文件记录对应本聊天全部用户可见重要结论与合并、CI、回算和审计链路，作为多窗口项目持续工作永久上下文，禁止冒称之前未实际通过的效果。