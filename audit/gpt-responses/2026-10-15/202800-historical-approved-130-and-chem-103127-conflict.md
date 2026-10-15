# 2026-10-15（北京时间）历史回溯：累计批准 130，正式入库 122，Chem 103127 跨来源日期闭环

Project: 抓取有机合成文献并持续更新网页
Conversation context: 用户 “继续，现在总共回溯了多少篇纳入文献？”
Repository: zhou526316-sys/organic-synthesis-gallery; main sole production authority, staging/historical-archive-nightly independent candidate branch.

## User-visible initial result (actual DOI-set readback)
截至本轮最新 main 的 `audit/historical-reviewed/approved-admissions.json` 与正式 `public/toc-demand-live.json` 对比：
- **历史累计批准 130 篇**（accepted.length = 130），独立原始日期待定 **2 篇**不计入。
- **历史回溯正式已入库 122 篇**：在 main 正式1,151 DOI中的实际集合交集122，且 ingestionChannel `historical_backfill` 的正式文献也正好122。
- **已审核待唯一北京时间08:00入库 8 篇**：Chem5、Nature Communications3，不冒充线上成果。
- Q3 2026（7–9月）批准124：正式入库116、待入库8；2026年1–6月批准6：全部入库。
- 按期刊累计批准：JOC31、Organic Letters21、JACS20、ACS Catalysis16、Chemical Science15、Chem8、Green Chemistry7、Science Advances3、Nature Chemistry3、Nature Communications3、Nature Synthesis2、Angew1，总数130。
- 全站正式文献1,151，Q3在库总851。这两个值不代表回溯批准，不能把851全部算作历史新增。

## Continued actual audit and repair
用户要求继续历史回溯，本轮读取了官方 Chem 出版社原始 Article（ScienceDirect https://www.sciencedirect.com/science/article/pii/S2451929426001932），核实 `10.1016/j.chempr.2026.103127` `Germanium ligand redox cooperativity: A key to ambiphilicity and switchable two- and four-electron transfer` 首次在线 **2026-07-06**。

同一 DOI 真实冻结来源冲突：OpenAlex July01-07记录 July06, source SHA256 `341f127a8b9fe6f24c4e882a4da89caeb04b8335bc32803fe664ee67cb51059f`，reviewGit `3116998c73fb18fd49f2abbabac0b026796c1dc3`，rawGit `2efb3dc9219a5d244f34db3aff9aa2edfe4c45f7`; Crossref August01-07记录 Aug01, source SHA256 `26770f50e9727826aa1d8171817c7f6ad3ff27376721eb2684efd2d94e2a50aa`，reviewGit `e51ea4a4f2650a1f705ee640b1e7bdc3acdd6cfe`，rawGit `6ea589ffc11c757ffd5e72b02d931e88e4778b68`。两份原始元数据保持只读，不误将Aug1当真实首发，不混合第三季度不同期刊。

该原始 Research Article 有真实主族Ge 2e/4e协同和邻二卤有机底物还原脱卤生成烯烃/炔烃实例；但通用有机合成底物/分离收率/Ge当量及周转尚未取得充分证据，同一助手两遍独立观点与反向挑战得出 **science evidence-pending**，不自动include/exclude、不永久封禁。

**PR #696** https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/696 通过**5/5 CI**（历史Q3来源、科学溯源、Tampermonkey、PDF安全、Site quality gate+Playwright），最终合并main提交 `4a50e702b4ad953ed724ee3ad415a955ada0f37a`，新增单篇DOI/PII/date固定官方证据、两个源根证据、独立学术待核、来源冲突保留型复算与负向篡改测试。没有向正式目录添加或删除DOI。

**实际staging复算**：在main更新现有审计trigger提交 `ed28e5f6a20b61ce21e4f1ba39e701ab1695df56`；GitHub Actions https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38734565194 SUCCESS。直接从 staging 分支重读两份季度文件：

- `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob `bdba4a87d14e04a341aeea2a5e223178c06ec2ed`
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` Git blob `c2025f6d7717094f02237feb2ec6adfc563824ba`
- 同一个 `generatedAt = 2026-10-15T12:26:10.685Z`（北京时间20:26:10）。

本轮之前/现在：
| 指标 | 之前 | 现在 |
|---|---:|---:|
| 历史批准 | 130 | **130** |
| 正式历史回溯 | 122 | **122** |
| Q3真实元数据来源 DOI | 12,286 | 12,286 |
| Q3元数据来源根 | 192/192 | 192/192 |
| Q3正式在库 | 851 | 851 |
| Q3未完成原始候选 | 11,247 | **11,246** |
| 仍保留原始来源日期冲突 | 82 | **82** |
| 官方核实解决跨来源冲突 | 0 | **1** |
| 学术适用性独立待核 | 10 | **11** |
| 官方刊物Research全季度目录完成 | 否 | **否** |

本次只把一篇“两个源日期矛盾”的源DOI转入“出版社日期确认、科学范围待核”，不删除原始DOI或虚增 approved=130。虽然 192 个Crossref/OpenAlex来源窗口完成，16刊官方Research目录/Online-first逐期全面核验仍未闭环，11,246是不同学科元数据候选，不代表这么多确认合格漏收有机合成论文。

## Further review leads (no new admissions)
- `10.1016/j.chempr.2025.102904`：Lockhart等 Chem triplet radical-polar crossover氮杂环方法，是真实原创合成。Oxford University Research Archive https://ora.ox.ac.uk/objects/uuid%3A25c61d3e-cce1-4005-89d1-30d4b48b5510 给出2026-02-18出版日期；ScienceDirect 2026-07-09为卷期日期，精确出版社 first-online仍待DOI级二次核验，不能自动纳入 Q3/归入Q1或改原冻结来源。
- `10.1016/j.chempr.2026.102946`：磷氧化物PCET阴极还原单一骨架最多90%产率，有异构底物无活性；首先在线日期不等于7月刊期，通用性另审。
- ACS 原始 manifest 日期待定二项 `10.1021/acs.joc.6c01483` 与 `10.1021/acs.orglett.6c02374`：ACS官方 JOC article Published Online Sept11 vs staging Sept10；OrgLett DOI article 页面有Sept01而同一官方卷期文章页面显示Sept08，均不能未经独立publisher记录 reconciled便强行入库。二篇不是130批准的一部分。
- 下一阶段优先16刊官方 Research DOI目录与真实首次在线日期闭环，逐篇两遍有机合成科学范围审核。仅当前合法北京时间每日08:00唯一正式新增，历史补录不进入 Today/Hot/公众号日报。

## Audit and security
Issue #498 artifacts:
- https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6191932328 （先前批准统计+Chem冲突/先例）
- https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6192027067 （合并/复算最终验收）

Protected `public/rolling-supplement.json` Git blob `f0e4b18a3be71e52fb07e84e291f51f652cd03ae` 与合法授权发布标记匹配。无 D1 请求、无受限PDF/SI/媒体抓取、无额外写入者/18:00发布、无 Today/Hot/WeChat 历史混入。源码/统计/学术范围均按实际CI与staging验收结果区分。