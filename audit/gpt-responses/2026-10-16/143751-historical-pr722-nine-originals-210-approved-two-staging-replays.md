# Organic Synthesis Gallery 历史回溯｜PR #722 合并与 staging 两次复算｜项目对话完整回复归档

- 北京时间：2026-10-16 14:37:51
- 任务：接续历史回溯及 PR #719 201批准基线，核对正式库和 Q3 staging，新增9篇 Q3 论文双遍审核并合并，做两次 staging-only 复算。
- 审核合并 commit: `77b92f931220d3962a7e7f12b0fb80d681e039e6`
- 复算触发 commits: `51b4059c99b21711dfb2f15a33bd5a5bbe655b6d` / `1f7f23a30a1eb4eac898cb67c319279e6513b7a2`
- GitHub 反馈: https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6209650770
- 本对话之前的详细PR719归档：`audit/gpt-responses/2026-10-16/140726-historical-pr719-201-reviewed-staging-validated.md`
- 说明：以下保留当轮已发送给用户的主要可见回复与最终后续结果；前段指标为合并前基线，后段为最终实测。

## 历史回溯续作｜10 月 16 日

已接续 `zhou526316-sys/organic-synthesis-gallery` 的历史回溯工作，并通过 GitHub 连接核实 [PR #719](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/719) 确实已于北京时间 10 月 16 日 14:00 合并，提交为 `f9d5c2f9`。

| 基线阶段 | 篇数 |
|---|---:|
| 累计学术批准（此前） | 201 |
| 正式历史入库（此前） | 122 |
| 批准待入库（此前） | 79（含 1 篇明确排除） |

这三个数字分别表示不同阶段，不能合并统计。审核批准不代表正式上线，也不能绕过已有 DOI 排除规则。

### Q3 staging 已复核

直接读取 `staging/historical-archive-nightly` 后，确认配对文件仍对应上一轮验收：

| 项目 | 接续前核对 |
|---|---:|
| Q3 去重来源 DOI | 12,286 |
| Q3 元数据完成窗口 | 192/192 |
| Q3 尚待审核或日期核验 | 11,174 |
| Q3 已批准待入库 | 78 |
| 全历史来源 DOI | 57,266 |
| 全历史已完成来源窗口 | 396/3,600 |
| OpenAlex 授权失败窗口 | 27 |
| 审核缓存状态不同步 | 0 |

自动生成的 Q3 学术预筛含160条候选，但它们不能凭标题评分视为学术通过。审核缺口主要是逐篇证据和出版社原始研究目录覆盖。

### 新一批 9 篇论文已完成证据整理

[PR #722](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/722) 已建立并完成分支学术审核证据。

| 期刊 | DOI | 核心合成贡献 |
|---|---|---|
| Organic Letters | 10.1021/acs.orglett.6c02334 | Fe-LMCT 羧酸脱羧氟磺酰化，DABSO/NFSI |
| Organic Letters | 10.1021/acs.orglett.6c02414 | NUSIOC-Phos手性单齿膦参与 Pd 不对称芳基乙烯基化 |
| Organic Letters | 10.1021/acs.orglett.6c02330 | 喹啉导向 Cu 不对称次磺酰胺 S-苄基化，硫亚胺产物最高99% ee |
| Organic Letters | 10.1021/acs.orglett.6c02710 | 电化学重氮底物双烷氧基化合成缩酮 |
| Organic Letters | 10.1021/acs.orglett.6c03033 | Pd 催化三唑并哒嗪 C3–H 芳基化 |
| JOC | 10.1021/acs.joc.6c00990 | 通过调节配位促进 Pd 催化氮杂稠环芳烃合成 |
| JOC | 10.1021/acs.joc.6c00158 | Ag(I)/Rh(III) 接力催化亚砜亚胺发散合成 |
| JOC | 10.1021/acs.joc.6c00634 | HFIP 促进Nenitzescu制备5-羟基吲哚，含Umifenovir关键中间体形式路线 |
| Angew | 10.1002/anie.2349367 | Mn催化HAT引发哌啶C–H不对称氧化 |

每篇均有出版社首发日、冻结来源raw+queue SHA、root SHA256、两遍科学审核与反向质疑。没有复制受限摘要或下载历史正文、SI、PDF。未纳入负例 JOC `10.1021/acs.joc.6c01623` 为计算机理分析，无独立新制备方法依据，不伪称永久用户排除。

### CI 与合并结果

完整六组CI均成功：historical admission #38861153212、Q3 source/review #38861153271、reviewed provenance #38861153190、Tampermonkey #38861153290、private PDF regression #38861153246、Site quality Playwright #38861153236。回归初次失败是测试未提供旧owner排除的显式 veto 回执；已修复测试并保留真实排除规则。还主动修正术语：“次磺酰胺／硫亚胺”与“亚砜亚胺”不可混同，“5-羟基吲哚”不能误写成“五羟基吲哚”。

PR #722已合并至main：
https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/77b92f931220d3962a7e7f12b0fb80d681e039e6

本次新增9篇真实审核批准，正式审核清单 **201→210**，原有日期 pending **2** 未变化。main正式public目录仍 **1,186**，其中历史正式入库 **122**，所以批准未入库 **88**（含1篇既有owner政策排除）。

### Staging 双次复算验收完成

| 指标 | 接续前 | 最终 |
|---|---:|---:|
| 累计学术批准 | 201 | 210 |
| Q3 未完成审核或日期核验 | 11,174 | 11,165 |
| Q3 批准待正式入库 | 78 | 87 |
| 全历史批准待正式入库 | 79 | 88 |
| 全历史审核缓存状态不同步 | 0→首次9 | 0 |
| 正式历史入库 | 122 | 122 |

第二次复算 Q3 coverage/worklist 同代 `generatedAt=2026-10-16T06:35:01.984Z`：
- Q3 coverage SHA `89394d2913c64b0f7f63de2b546211f1239ca18e`
- Q3 worklist SHA `d1ead7b5ad75f3773c90f8977109470a0bac0e19`
- Global ledger `generatedAt=2026-10-16T06:35:01.125Z`，SHA `c8fa7cd67a5844680896f19869a7352d0d6dc6d4`
- Q3来源 DOIs 12,286，元数据根192/192，全球历史DOIs 57,266，完成根396/3600；未改变冻结source内容。
- 27 个OpenAlex `openalex:http_401:api_key_missing` deferred窗口必须保持未完成；尚未修复源API授权。
- 正式目录Git blob `eb5cfb953a3615db6e5756455305ee0d13c94bc0`，仍1186总文献/122正式历史。
- 出版社Research期次逐期闭环仍为false，不能以元数据窗口192/192替代。
- 下一次唯一正式入库仍为北京时间2026-10-17 08:00；最多87篇非已明确排除的待发布候选还须届时重新接受门禁，不能保证全部发布。没有新建晚间发布槽、越时发布、D1改动、Today/Hot污染、10月前历史正文/图片/SI/PDF抓取。

### 审计链接
- 完成PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/722
- 历史连续Issue：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6209650770
- 本记录完整正文作为该project GPT回复永久Git归档，不冒充正式发布。
