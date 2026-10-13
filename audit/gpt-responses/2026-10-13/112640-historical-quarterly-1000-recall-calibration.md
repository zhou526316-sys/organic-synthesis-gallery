# 历史回溯季度1000篇估计：来源核查与非强制完整性基准

北京时间：2026-10-13 11:26:40。任务：抓取有机合成文献并持续更新网页／历史回溯季度篇数核验。
用户说：“我觉得每三个月有1000篇左右符合要求的文献”。

## 对用户的完整答复草稿

这个估计有合理依据。以目前16本期刊的规模和有机合成收录范围来看，每三个月约1000篇可以作为历史回溯的**参考基准**，甚至可能偏保守，但还不能当作已经核实的真实篇数。

我核对了正式目录按首次发表日期分布：2026年7月196篇、8月113篇、9月434篇，**7—9月共743篇**；10月1—12日有227篇正式目录记录。按1000篇/季度的参考值，7—9月相差**257篇**。这并不证明恰好漏收257篇：16刊分批加入日常监测，正式收录仍可能有未定案 DOI，部分历史来源首次在线日期尚未核验；10月初12天亦不能简单线性外推成整季的可靠平均。

最值得警惕的是结构性空白：Chem、Chemical Science、CCS Chemistry、Science Advances、Green Chemistry、JOC 在2026年7月、8月的正式目录均为**0篇**。但独立 GitHub 历史来源里，JOC 2026年7月1—7日已有40条 DOI 候选，8月1—7日有47条，其中包含“Total Synthesis of Scytonemin and Reduced Scytonemin”（DOI 10.1021/acs.joc.6c00860）。这些是来源候选，不是全部符合收录范围的论文；但足以证明这些月份不能当作没有论文。Chemical Science 和 Green Chemistry 的相关旧批次还有创建日期不等于正式首次发表日期的精度问题，不应按错误日期硬凑月度篇数。

如果16刊达到成熟、稳定的全面监测范围，1000篇/季度约为333篇/月、11篇/天。当前的薄弱环节不是 Crossref/OpenAlex 完全找不到文献：2026年7—9月共192个期刊×日期来源API根窗口已经扫描完成，而 DOI 科学双遍审核与首次在线日期核对落后很多。现有历史 staging 已有55,708个2025—2026不同窗口的唯一来源候选 DOI，但**不能把55,708篇都算作符合范围的有机合成论文**。

建议将“现代16刊合计约1000篇/季度”作为**漏收预警基准、不是自动纳入配额**。优先核查2026年7—9月，按16刊逐月核对来源 DOI、官方出版社 Research／article 列表、第一次在线日期、底物到产物的实际合成贡献；对高/中/低关键词候选进行分层审核，并严格独立完成科学范围双遍判定。若最终真实符合的只有900篇，就收录900篇；若有1500篇，就必须尽量收齐1500篇，绝不能为了达到1000篇而放松标准或在1000篇停止。创刊早期只有部分期刊存在，也不能一律套用现代16刊的季度数量。

已将本次核验和用户的估计作为**待验证而非强制目标**记录在[历史完整性跟踪 Issue #498](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6137516102)。本次只读取 GitHub 静态目录和历史 staging；不使用生产 Cloudflare D1 额度，也不更改正式08:00发布规则。

## 核验参考

- 正式目录 GitHub: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/public/toc-demand-live.json
- 来源阶段历史游标: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/staging/historical-archive-nightly/audit/historical-staging/state.json
- 历史去重统计: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/staging/historical-archive-nightly/audit/historical-staging/global-coverage-ledger.json
- 2026-08 JOC首周47 DOI候选: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/staging/historical-archive-nightly/audit/historical-staging/batches/2026-08-01_2026-08-07_joc.json
- 2026-07 JOC首周40 DOI候选: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/staging/historical-archive-nightly/audit/historical-staging/batches/2026-07-01_2026-07-07_joc.json
- 现阶段科研范围契约: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/literature-scope-contract.md
- No change to source collector, review include/exclude, 08:00 release, D1 or media permissions. Audit only.
