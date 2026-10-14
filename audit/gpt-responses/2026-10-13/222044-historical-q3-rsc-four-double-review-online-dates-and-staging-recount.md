# Organic Synthesis Gallery — 历史回溯继续执行：Q3 RSC四篇双遍审核+原始首发日核验+GitHub staging复算
北京时间：2026-10-13 22:20:44。会话场景：抓取有机合成文献并持续更新网页／用户“继续”。此条为面向用户的完整成果记录，不能视为正式网站已发布内容。

## 承接及核对
重新读取main的PROJECT_RULES.md、docs/literature-scope-contract.md、docs/historical-2026-q3-catchup-contract.md、audit/literature-update-state.json、历史审核approved-admissions和独立staging，以及开放PR。此前历史累计82篇通过、84篇已审、权威pending2、已有8篇历史正式入库、Q3未审核或日期核实11,457。正式目录984/Q3正式743。2026 Q3 16刊Crossref/OpenAlex来源完整窗口192/192、去重来源候选12,286，但仍不代表出版社逐期目录/真实合成范围审核完成。并行Nature Synthesis #612、Nature Catalysis #608目录审核未占用或修改。
出版社Research目录闭合标志仍是false。

## 四篇RSC Q3原创合成研究：逐篇首发日和学术双遍审核
| DOI | 期刊 | 首次在线 | 来源等级 | 真实合成贡献及挑战 |
|---|---|---|---|---|
| 10.1039/d6sc05170g | Chemical Science | 2026-07-09 | NLM期刊Epub DOI（[PMID 42459919](https://pubmed.ncbi.nlm.nih.gov/42459919/)）及通讯作者柏林工大Advance Article一致；非期刊2026-09-02编期日 | 镍/光催化α-氯苄基硅烷/锗烷与芳基溴化物对映汇聚交叉亲电偶联；不得忽略硅环丁烷取代偏好、TMS/TBDMS失效和锗烷效率较低 |
| 10.1039/d6sc05630j | Chemical Science | 2026-08-21 | NLM原期刊aheadofprint [PMID 42630991](https://pubmed.ncbi.nlm.nih.gov/42630991/)，RSC原始在线页面无法直接读回日期；不能冒称官网首发日直接已见 | 镍催化α,β-不饱和酯基膦酸酯不对称氢化，作者最高99%收率/99%ee及S/C=1000，DFT与实验支持Ni-H插入模型不可升级为唯一直接证实机理 |
| 10.1039/d6gc01864e | Green Chemistry | 2026-07-31 | [RSC原出版社Article History](https://doi.org/10.1039/d6gc01864e)标明First published | Co(II)/萘醌本征光化学促进苯甲酰胺C–H活化螺环化；循环使用溶剂6次和计算生物筛选不是底物拓展或临床药效证据 |
| 10.1039/d6gc03080g | Green Chemistry | 2026-09-17 | [RSC Article History](https://pubs.rsc.org/gc/article/doi/10.1039/D6GC03080G/1357474/am/Solvent-and-catalyst-free-mechanochemical)直接First published，有别于09-16 Accepted | 次磺酰胺（sulfenamide）球磨胺化形成伯亚磺脒（sulfinamidine），无外加溶剂/催化剂不等于无碱：K₂CO₃计量使用；一锅二步S(VI)衍生化是附加合成价值 |

冻结来源对应4个Crossref-only stage batch原始记录，其出版日均为year-only或空值；不得从源root窗口、createdDate反推Online。逐篇字段primaryContribution/preparativeTransformation/generalityEvidence/sourceEvidence/boundaryChallenge、firstPass与独立challenge双遍审查，真实中英标题/作者/DOI/引文，正文与SI/PDF、历史图均不抓、不转载原始全文摘要。
另DOI `10.1039/d6sc05552d` RSC[官方首发日2026-09-29](https://pubs.rsc.org/sc/article/doi/10.1039/D6SC05552D/1362728/Engaging-Native-Carboxylic-Acids-via-Solvent-Gated)已核对，但当前仅可取得更早的2026年5月ChemRxiv预印本摘要，不能假称最终出版版本实验内容不变。放入独立的`audit/historical-reviewed/2026-10-13-q3-chem-sci-d6sc05552d-publisher-date-scope-hold.json`，未假入approved或已存在的2篇权威pending；Org Lett `10.1021/acs.orglett.6c03028`独立日期矛盾保持暂扣。

## PR与四门禁
- [PR #617](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/617) 已正式**合并至main**，合并SHA [`9beae7ef5b21e63178674e6cecfa09db4f15808e`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/9beae7ef5b21e63178674e6cecfa09db4f15808e)。
- 四类专项CI全部completed/success：[历史准入 #38410859144](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38410859144)；[Tampermonkey #38410858974](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38410858974)；[私人PDF #38410859051](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38410859051)；[全站含Playwright #38410859251](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38410859251)。修改提交期间自动取消的旧commit对应CI不计新commit验收失败。
- 审核main回读：历史学术批准86篇，已审88篇，权威pending2，历史正式已入库8，**78篇审核通过待原08:00正式writer独立放行**，其中Q3待08:00共72篇，前7/1历史仍6篇。所有Q3新增只允许`toc_only`，`new=false`，无历史PDF/正文图/SI抓取。并无正式文献新增部署，不影响Today/Hot/公众号文献日报。

## 独立staging复算
- 更新既有staging-only GitHub复算触发文件，commit [`fada7d003402aac7de739fc264ef4ea8bfb24db4`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/fada7d003402aac7de739fc264ef4ea8bfb24db4)，没有新增/修改定时发布任务，不通过本历史管道读写生产D1。
- [真实GitHub Actions #38412137297](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38412137297) completed/success；两份季度文件生成时间均`2026-10-13T14:18:19.550Z`，即北京22:18:19。
- staging branch `audit/historical-staging/quarter-2026-q3-coverage.json` blob `c22775026510aa9f20f7a369d35dffd403e6c577`；`audit/historical-staging/quarter-2026-q3-review-worklist.json` blob `741f6725ea626eed9018492882cef6171d352065`，完整时间匹配，queue与coverage计数一致。
- Q3剩余未审或日期待核从**11,457→11,453**（真实减少4），Q3已审待08:00从**68→72**，正式Q3保持743；12,286去重元数据候选、192/192来源窗口不变；**914原始未明日期**与**82跨源窗口日期冲突**不能将candidate count冒充有机合成学术批准数。
- `publisherIssueResearchReconciliationComplete=false`，接下来继续16刊逐期Research DOI/online-first对账、RSC有法律来源的首次在线日核对以及剩余Q3候选逐篇两遍审查，而不是为了“1000篇/季度”虚假凑数。
- 追踪[Issue #498](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498)评论6147675053，完全没有历史夜审直接写入生产、没有18:00发布恢复。
