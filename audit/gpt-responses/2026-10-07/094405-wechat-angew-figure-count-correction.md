# Angew figure-count correction

Beijing time: 2026-10-07T09:44:05+08:00
Context: User asks「这篇angew哪里有这么多配图？」after the prior report of 30 images.
Read-only evidence: user-uploaded Angew PDF (12 pages), and current main audit/wechat-working/anie3699223-r1-checkpoint.json, blob 97abb6e89d03b7aa99aa6f074d00ee3a9ceedafd.
Original main-text figures: Fig.1–6, plus Table1. Crop-record counts by parent: Fig1=3, Fig2=3, Fig3=7, Table1=1, Fig4=4, Fig5=7, Fig6=1, selected SI figures=4. Total 30 crop records, not 30 original figures or a final insertion quota.
Runtime check: /mnt/data/wechat-editorial/anie3699223-r1 does not exist in the current runtime. Do not infer currently accessible or publish-ready image bytes from the checkpoint's historical hash/approval assertions. No production manifest or publisher trigger changed in this turn.

## Final reply

**原文没有30张独立配图。正文是6幅图（Fig.1–6），另有1张表（Table 1）。** 我上一条把“裁切后的素材文件数”说成了“配图数量”，没有区分清楚。fileciteturn18file2L54-L56 fileciteturn18file2L202-L207 fileciteturn18file2L311-L314

刚核对了上批保存的清单，“30”是这样累计出来的，并不是论文的原图数量：fileciteturn19file0L2-L2

| 原始来源 | 上批清单中的裁切块数 |
|---|---:|
| Fig.1 | 3 |
| Fig.2 | 3 |
| Fig.3 | 7 |
| Table 1 | 1 |
| Fig.4 | 4 |
| Fig.5 | 7 |
| Fig.6 | 1 |
| SI Fig.S35、S37、S38、S39 | 4 |
| 合计 | 30 |

**问题不只是汇报用词，也在于我把部分图拆得过细。** 尤其Fig.3和Fig.5，原文各是一幅完整的大图，我却分别拆成7块，把反应通式、少量底物等局部也单独计数。你要求的是正文图尽量完整覆盖、配合叙述适当拆分，不是把图切得越多越好。

后续排版应保留原图的逻辑分组，只在手机端确实看不清或需要分开解释时拆图；底物范围不遗漏，但不把两三个底物单独切成一张来增加篇幅。**这30项只能作为中间素材清单，不能直接当作最终推文要插入的30张图。**

另外，刚检查时，上轮记录的本地图片目录在当前工作区已不存在；目前能确认的是Git中的裁图记录，不能仅凭清单继续声称30张图片本体都已保存、可以直接上传。这一交付状态也需要更正。
