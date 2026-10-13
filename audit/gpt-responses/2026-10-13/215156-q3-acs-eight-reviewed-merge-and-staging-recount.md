# Organic Synthesis Gallery — 历史回溯继续执行：2026Q3八篇ACS双遍审核与重算
北京时间 2026-10-13 21:51:56。会话上下文：抓取有机合成文献并持续更新网页 / 接续用户2026-10-13夜间Q3完整性核查。仅存用户可见结果、外部证据引用与GitHub提交，绝不储存凭证。

## 历史回溯：已恢复工作基线
已通过 GitHub 连接重新核对历史审核记录、收录范围契约、main及独立历史 staging。
本轮开始前历史累计审核通过 **74篇**，已审待正式入库 **66篇**，Q3尚待处理 **11,465条**。这三个指标与10月13日21:13生成的季度审计一致。
并行中的出版社目录审核（未由本聊天擅自合并）：[PR #612](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/612) Nature Synthesis 2026年7—8月；[PR #608](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/608) Nature Catalysis 2026年9月。
严格遵守：历史审核不直接写入生产目录、不触发媒体抓取，不更改北京时间唯一08:00发布机制。

## 新一批8篇论文已完成双遍审核并合并
[PR #615](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/615) 包含8篇逐篇ACS原始期刊证据、首次在线日、冻结的Crossref/OpenAlex批次SHA、真实书目、中文标题、独立第一遍和第二遍科学审核、边界挑战及回归测试。
| 期刊 | 首次在线 | DOI | 科学审核贡献 |
|---|---|---|---|
| JACS | 2026-07-08 | 10.1021/jacs.6c06565 | 四组分羰基化胺化Suzuki–Miyaura偶联制备酰胺 |
| JACS | 2026-08-08 | 10.1021/jacs.6c10775 | (+)-CC-1065汇聚式完成全合成 |
| JACS | 2026-08-12 | 10.1021/jacs.6c08998 | Pd催化不对称形式交叉[4+2]环加成 |
| Organic Letters | 2026-07-27 | 10.1021/acs.orglett.6c02441 | CPA催化不对称去芳构化[4+3]环化 |
| Organic Letters | 2026-09-01 | 10.1021/acs.orglett.6c03102 | CPA催化偕二氟螺环不对称Pictet–Spengler环化 |
| JOC | 2026-08-18 | 10.1021/acs.joc.6c01375 | Au(I)/Au(III)分歧合成酮萘，并应用于两种全合成 |
| JOC | 2026-08-20 | 10.1021/acs.joc.6c01369 | 光催化双C–C断裂交叉偶联 |
| ACS Catalysis | 2026-08-03 | 10.1021/acscatal.6c04411 | Ni催化炔烃三官能团化构建B–N轴手性桥环 |

本次对8篇分别限定直接获得的论文证据与不能外推的机理/选择性；未访问付费正文、SI、PDF；旧媒体仅允许官方TOC。主支对应学术归档为 `audit/historical-reviewed/2026-10-13-q3-eight-acs-independent-two-pass.json`。

## PR #615 已通过全部门禁并合并
[合并commit 93bfdc7bdcd76e499b4d02b2e71096283adbd0d4](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/93bfdc7bdcd76e499b4d02b2e71096283adbd0d4)；以下四组CI全部 completed/success：
- [历史准入回归 #38406773218](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38406773218)
- [全站质量门禁 #38406773658](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38406773658)
- [Tampermonkey回归 #38406773852](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38406773852)
- [PDF回归 #38406772814](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38406772814)

main 回读审核通过 **82篇**（74→82），已完成审核 **84篇**（76→84），学术已审待正式入库 **74篇**（其中Q3 68篇，7月以前6篇），仍有 **2篇**原权威日期争议；另1篇`10.1021/acs.orglett.6c03028`因出版社7月30/31首次在线日期矛盾独立暂扣，未入权威pending或include。PR只修改审核记录和测试，网站正式目录在此次历史审核未新增，原正式目录 **984篇**、Q3 **743篇**。已审待入库仍需原08:00 writer单独复核，不代表现在可在网页查询。

## 最新Q3复算已成功
沿用现有staging-only工作流触发文件 `audit/automation-triggers/historical-review-triage-bootstrap.json`，commit `d9f5960790258a2f467c68733e95507657fc6626`；未更改定时任务。
[staging复算 GitHub Actions #38407967644](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38407967644) completed/success。
两份审计文件同一 generatedAt=`2026-10-13T13:49:57.896Z`（北京时间21:49:57）：
- `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob `ee398befc790d8b90abf0d163676f5b86e62d34b`
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` Git blob `0f5ac4fad9f26a629624be6a4b81a0703611557f`

| Q3指标 | 上轮 | 本轮 |
|---|---:|---:|
| 来源窗口完整 | 192/192 | 192/192 |
| Crossref/OpenAlex去重候选 | 12,286 | 12,286 |
| Q3已审待08:00入库 | 60 | **68** |
| Q3未审或日期待核 | 11,465 | **11,457** |
| Q3正式已入库 | 743 | 743 |

工作流保留`publisherIssueResearchReconciliationComplete=false`。尚未取得16刊所有出版社逐期 Research DOI 与 online-first 日期完整验收；914个源候选的原始日期未明/歧义不能全部等同符合范围的论文。仍需独立核实RSC真实首次在线日并双遍审核剩余候选。不能把12,286篇来源候选或11,457条待核当成符合收录条件论文的总数，也不将“1000篇/季度”变为收录配额。

所有这些步骤均未从历史链路访问生产Cloudflare D1，也未新建正式发布任务，没有增加18:00发布、篡改TOC/正文图/PDF/SI、或者进入Today/Hot/公众号每日新增。记录同步至 [Issue #498](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498)。
