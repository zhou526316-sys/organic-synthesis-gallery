# 2026-10-16 历史回溯继续｜PR #724 九篇原创研究、六组CI合并及 staging 两次回卷

- 北京时间：2026-10-16 16:08:26
- 聊天上下文：用户从2026-10-16 15:50北京时间继续 Organic Synthesis Gallery 历史回溯审核工作，`main` 唯一基线。
- 相关完整Issue回执：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6211027935
- 本次PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/724
- 合并commit：`a4b495c6728761c79588d54b4d831d3ee964ba43`
- Staging-only triggers：v25 `d939eedd8f2e6095717733739f5af2bb84b59618`；v26 `d9cc1418abed180a052c1cfae39b6f1fa4475914`

## 本次给用户的核心可见报告和最终结果（留存完整信息）

### 历史回溯续作｜10 月 16 日

已核对最新 `main` 与历史 staging。本轮起点：累计学术审核批准218篇、正式历史入库122篇、已批准尚未入库96篇、Q3未完成审核或日期核验11,157条、全历史来源DOI57,266、OpenAlex授权失败窗口27个、审核缓存状态不同步0。本次继续筛选新的原创有机合成论文，严格区分学术批准与正式上线。正式发布只能进入北京时间每日08:00的既定流程。

本次与用户说明的三篇代表性研究：
1. Organic Letters `10.1021/acs.orglett.6c02584`：醇先转为 O-烷基异脲，Ni与二芳基酮光催化协同完成Giese加成，覆盖伯仲叔醇；不能误说为未预活化游离醇直接脱氧偶联。ACS原始来源 https://pubs.acs.org/doi/10.1021/acs.orglett.6c02584。
2. Angew `10.1002/anie.1980531`：Co–Josiphos将Ar/heteroAr/alkenyl卤化物加入脂肪醛形成手性醇，Ti alkoxide辅助阳离子Ar–Co(II)生成是机理支持而非全部中间体直接观测。Wiley原始来源 https://onlinelibrary.wiley.com/doi/10.1002/anie.1980531。
3. Organic Letters `10.1021/acs.orglett.6c02393`：首次完成Notopterol、Notoptol和九种天然类似物不对称全合成，BTHL催化远程Mukaiyama羟醛关键步骤克级、>98% ee；不是片段合成。https://pubs.acs.org/doi/10.1021/acs.orglett.6c02393。

其余六篇同时完成审核：

| DOI | 官方最早在线 | 原创合成贡献 |
|---|---|---|
| JOC `10.1021/acs.joc.6c01212` | 2026-07-29 | HWE烯化/oxa-Michael合成2,6-trans-THP，50–84%收率，最高dr95:5，天然产物Diospongin应用 |
| JOC `10.1021/acs.joc.6c00807` | 2026-07-28 | Ag(I) A³三组分杂环合成，保留乙烯基C–Cl |
| JOC `10.1021/acs.joc.6c01109` | 2026-07-30 | 未保护糖Petasis+脱胺环化生成1,2-cis C-乙烯基呋喃糖，Jaspine B路线 |
| JOC `10.1021/acs.joc.6c01186` | 2026-07-30 | Ti二烯醇盐aldol/Mannich→DBU/TBD引导合成二氢呋喃、二氢吡咯、吡咯；竞争逆羟醛/逆Mannich并非只有机理 |
| Organic Letters `10.1021/acs.orglett.6c02970` | 2026-08-27 | 可见光、无外加光催化剂四组分二芳基硼自由基路线合成1,3,2-diazaboroles |
| Organic Letters `10.1021/acs.orglett.6c03286` | 2026-08-28 | H-膦酸酯/亲核试剂C60的一锅1,4-双官能化，实际多套结构分离表征，非仅材料性能 |

每篇都逐条有出版商正式Article History/First Published、书目、Crossref/OpenAlex原始冻结source root SHA256、raw Git blob、review queue Git blob及两遍科学审核。另一遍是同一助手独立写出的文章特定反证，不冒称两位人类审稿。完整证据：`audit/historical-reviewed/2026-10-16-q3-nine-acs-wiley-synthetic-originals-two-pass.json`。误称全合成/步骤收率/直接原位证实的机理均有边界警示。所有 Q3 历史稿件为 `toc_only`、`new=false`、`addedDate=""`，不新增正文图片/全文/SI/PDF。

### PR #724 已完成合并

六组CI全部为 SUCCESS：
- Historical 2026-Q3 completeness/source/review isolation regression #38870588835；
- Target journal Tampermonkey capability regression #38870589104；
- Historical reviewed archive admission authorization regression #38870588840；
- Historical Q3 reviewed-scope provenance #38870589012；
- Private PDF capture v2 regression #38870589075；
- Site quality/Playwright #38870588920。

Exact head `6464e7669140462a486d3d2770f2f5a02735b9fc` 经完整验收后合并，main merge为 `a4b495c6728761c79588d54b4d831d3ee964ba43`。累计学术批准由218→**227**，旧两篇date pending不变。未执行正式文献入库。

### Staging 实际双次回读

| 指标 | 本轮前 | 最终 |
|---|---:|---:|
| 累计学术批准 | 218 | 227 |
| Q3未完成审核或日期核验 | 11,157 | 11,148 |
| Q3批准待08入库 | 92 | 101 |
| 全历史批准待入库 | 96 | 105 |
| 历史正式入库 | 122 | 122 |
| 审核缓存不同步 | 0→首次9 | 0 |

主分支staging-only v25 trigger提交`d939eedd8f2e6095717733739f5af2bb84b59618`首次回读Q3已扣除新9篇，但因320/396来源根循环留下9条缓存状态不同步；v26 trigger`d9cc1418abed180a052c1cfae39b6f1fa4475914`完成第二次回卷，stale=0。

最终Q3同代paired `generatedAt=2026-10-16T08:06:03.031Z`：
- coverage Git blob `0c51b160d3060771cd2904c46a0e3eb4deb0d53d`;
- worklist Git blob `8f56d6757e186efce08f45b80452ba60b8f30f4a`;
- 12,286个去重Q3来源DOI、192/192个机器元数据根不变，出版社完整Research issue覆盖false。

Global ledger `generatedAt=2026-10-16T08:06:01.881Z` Git blob `8ff8b3957ee5fb5eb21f758e75f307e29859934e`，57,266来源DOI、396/3,600历史来源根完成；105 approved waiting08、缓存状态不匹配0。27个 OpenAlex `http_401:api_key_missing` 来源根均仍 `sourceCompleted=false`。

正式Main `audit/historical-reviewed/approved-admissions.json` Git blob `57acee122c38ff9c22dcc712cf721cf861631ef2`：227 accepted和原有2 pending；正式 `public/toc-demand-live.json` blob `eb5cfb953a3615db6e5756455305ee0d13c94bc0`：1,186总文献、122历史文献。227个批准中恰有122个已在正式目录，故105未正式入库；其中一条明确owner永久排除，最多104篇潜在下次正式候选，仍须通过实际发布门禁。

下一次唯一合法历史正式新增仍为北京时间2026-10-17 08:00，非18:00，无越权补发；本文本审核与staging-only动作未触及正式publication、D1、媒体、PDF、正文/SI和Today/Hot/公众号每日新增。下一步应继续Q3 11,148项的逐篇审核与16刊出版社Research目录闭环，另外27个OpenAlex API授权失败根须提供Actions secret `OPENALEX_API_KEY` 并重试才可闭合。

GitHub完整回报：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6211027935
