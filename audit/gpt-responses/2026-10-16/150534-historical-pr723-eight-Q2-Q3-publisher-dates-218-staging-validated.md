# 历史回溯继续｜PR #723 八篇原创合成、出版社首发日更正、两次 staging 验收

- 归档北京时间：2026-10-16 15:05:34
- 对话：用户在“抓取有机合成文献并持续更新网页”项目历史回溯工作线回复“继续”，要求沿用全部已确认约束、继续实际审核/提交/验收。
- 初始 main: 210 approved, 2 pending, 1,186 formal paper/122 historical; 88 approved not formal.
- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/723
- Merge commit: `2acb533e4a9d781f2f59d43131ec7ad9b694bbf5`
- Staging refresh: `a806e187427ad2a5041f4c5bb925fd6b91b93645` (v23), `cbe34c0c089167648c81f841bb177a31eed7b96f` (v24)
- Issue #498 complete readback: https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6210043968

以下保存本轮用户可见回复的实质完整内容（中途进度信息另以审计记录和CI/Actions核查）。

## 历史回溯续作｜10 月 16 日

已重新核对 `main` 与历史 staging。上一轮 210 篇学术批准、122 篇正式历史入库的结果仍然有效，Q3 未完成审核或日期核验数为 11,165，审核缓存不同步为 0。

本轮查出 CCS Chemistry 的一组首发日期误归类，需要在继续审核时同步纠正：

| DOI 尾号 | Staging 日期 | 出版社首次在线日期 |
|---|---|---|
| `202607709` | 2026-07-01 | **2026-05-07** |
| `202607340` | 2026-09-01 | **2026-05-14** |
| `202607308` | 2026-09-01 | **2026-04-04** |
| `202607664` | 2026-09-01 | **2026-07-13** |

前三篇应按 Q2 历史论文处理，第四篇仍属于 Q3，但应使用 7 月 13 日作为首次发表日期，而非 9 月期次日期。来源 DOI 原始记录冻结不改，只在论文级别留下正式首发日及根 SHA 的纠偏证据。Q3 的 192/192 元数据根完成不等于出版日期全部准确。

## PR #723 已通过全部六组 CI 并合并

[PR #723](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/723) 的六组检查全部成功，合并提交为 [`2acb533e`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/2acb533e4a9d781f2f59d43131ec7ad9b694bbf5)。

本次新增 **8 篇经双遍审核的原创合成论文**，其中 **5 篇属于 Q3**，**3 篇由于官方首次发表日期更正而归入 Q2**。学术批准清单由 210 篇提高至 **218 篇**，原有 2 篇日期待核保持不变。本次合并仅涉及审核证据、日期核验、支持 RSC 的严格 DOI URL 校验以及回归测试；没有提前发布历史文献或获取历史正文、SI、PDF。

| 期刊/DOI | 正式在线 | 科学方法学与边界 |
|---|---|---|
| CCS `10.31635/ccschem.026.202607790` | 07-03 | 光/Ni/Cu多催化烯烃双官能团化建立1,3非相邻立体中心；ee与dr及反应自由基推断区分 |
| CCS `10.31635/ccschem.026.202608043` | 08-22 | 借氢–三烯胺接力不对称Diels–Alder活化跳跃式二烯醇；原有出版社日期待核已用新证据解决 |
| Chemical Science `10.1039/d6sc02950g` | 07-31 | 光诱导亚甲基环丁烷开环1,4双官能团化C–N/C；原始E/Z分布和后期去磺酰基产物区别 |
| JOC `10.1021/acs.joc.6c00992` | 07-30 | I₂/DMSO多组分捕获构筑吲唑稠合氮杂环，40例；光物理数据非分离收率 |
| CCS `10.31635/ccschem.026.202607664` | **07-13**（来源期次09-01） | 工程化细胞色素c催化真实C–Ge键合成，QM/MM理论模型不能冒充直接观察 |
| CCS `10.31635/ccschem.026.202607709` | **05-07**（来源期次07-01） | 手性配体丙二腈分子间去对称化合成非芳香性吡咯异构体，Q2 metadata_only |
| CCS `10.31635/ccschem.026.202607340` | **05-14**（来源期次09-01） | Pd反式选择性[7+4]环加成构筑手性张力环烯烃及后续骨架异构化，Q2 metadata_only |
| CCS `10.31635/ccschem.026.202607308` | **04-04**（来源期次09-01） | DKR/不对称氢化–内酯化制备α,β,γ-三取代γ-丁内酯，Q2 metadata_only |

证据文件：`audit/historical-reviewed/2026-10-16-eight-crossjournal-publisher-dated-ccs-rsc-joc-two-pass.json`；每 DOI 分别有出处、原始来源 Git blob SHA、审核队列 Git blob SHA、source SHA256、书目信息和文章特定双遍合成范围质疑，非两个人类独立同行评审。相关 RSC 官方 ArticleLanding URL 严格核对 publisher host + journal code + DOI suffix，错误来源/日期需 fail closed。六组 CI 均成功：
- Historical source #38863918774
- Historical scope provenance #38863918754
- Historical admission authorization #38863918792
- Tampermonkey capability #38863918784
- PDF regression #38863918765
- Site quality/Playwright #38863918759

## 历史 staging 双次复算完成

| 指标 | 本轮前 | 本轮后 |
|---|---:|---:|
| 历史累计学术批准 | 210 | **218** |
| Q3 未完成审核或日期核验 | 11,165 | **11,157** |
| Q3 已批准待正式入库 | 87 | **92** |
| 全历史已批准待正式入库 | 88 | **96** |
| Q3 来源中核实属于其他季度 | 11 | **14** |
| 来源日期差异记录 | 26 | **30** |
| 审核缓存状态不同步 | 0 → 首次8 | **0** |
| 正式历史入库 | 122 | **122** |

最终 Q3 coverage 与 review worklist 的 `generatedAt` 均是 `2026-10-16T07:03:20.448Z`。SHA:
- Q3 coverage `cdd5264256c13a2cf4fb239fa74700a308aeee90`
- Q3 worklist `2ea3787acd888b93cc0c34ca35ee36e77f20e6a2`
- Global ledger `5850b61f4fe89184042966503cf92119da863f30`, `generatedAt=2026-10-16T07:03:19.205Z`.

全球历史来源 DOI 57,266、完成来源根396/3600；Q3 来源 DOI 12,286，机器元数据根192/192；publisher original Research目录全收录仍未闭环。27个OpenAlex因缺`OPENALEX_API_KEY` 401的根仍为sourceCompleted=false，未虚假关闭。正式main manifest SHA `bb45bb726b88eb4393c5cf9a72ced1cfe2c03486` 已有218学术批准、2待核；正式 `public/toc-demand-live.json` SHA `eb5cfb953a3615db6e5756455305ee0d13c94bc0` 仍1,186张（历史122张）。

96篇批准未入库中包含1篇受既有明确owner排除，最多考虑95篇进入下一合法槽，但必须届时通过发布门禁，不能虚报未来上线；下一次唯一正式新增为北京时间**2026-10-17 08:00**，无18:00、不启动补发。7-9月仅TOC、7月前metadata_only、全部历史new=false/addedDate=""、无新正文SI/PDF、无D1、无Today/Hot/公众号每日新增污染。

## 提交与验收
- [PR #723](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/723)
- [合并提交](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/2acb533e4a9d781f2f59d43131ec7ad9b694bbf5)
- [Issue #498本轮审计](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6210043968)
