# Organic Synthesis Gallery｜2026Q3 历史回溯第二批真实执行记录

- 日期：2026-10-13（北京时间）；范围：2026-07-01 至 2026-09-30；唯一正式生产基线 main。
- 范围依据：PROJECT_RULES.md、docs/literature-scope-contract.md、docs/historical-2026-q3-catchup-contract.md、audit/historical-reviewed/approved-admissions.json 和 GitHub staging 季度审计。范围规则 Git blob SHA d3507dde0d44c4482ce9866ff81c73f0f97b0a92，纠错清单 blob SHA 74978d92a16d353271f16f111425d09e4de84f07，一致性已复核。

## Q3 来源核对基线
- 来源窗口 192/192，已去重来源候选 12,286，已知 Q3 API 日期 11,372，发表日期未确认或歧义 914，其中跨窗口日期冲突 82。该数值仅证明历史元数据来源扫过，绝不表示出版社 Research 逐期完成或文章均符合合成范围。
- 首次季度审计中未完成学术审核或日期核验 11,521；正式 Q3 文献 743；正式目录总计 984（本轮合并后回读仍为 984），不能按 1000 篇指标强凑论文。
- 来源问题热点：Chemical Science 来源候选 530，日期待核 529，正式 Q3 0；Green Chemistry 来源候选 305，日期待核 303，正式 Q3 0；JOC 来源候选 477，正式 Q3 49；ACS Catalysis 531，正式 55；Organic Letters 719，正式 294。来源与正式数量差距绝非合格漏文数。

## 第二批 DOI 逐篇两遍审核（4 include，0 exclude，0 新 pending）
以下均经过标题、出版社公开摘要、在线 Article History / 引文信息和 Crossref/OpenAlex staging 分窗双源对应核验，单篇第一遍化学成键/合成实用性审核与第二遍反向适用范围挑战，均记录五字段 scopeAssessment、实际作者和期刊引文。未获取受访问控制保护的全文或 SI，未编造底物数与实验条件。
1. 10.1021/acscatal.6c02698｜ACS Catalysis｜首次在线 2026-07-27｜手性双功能NHC促进氧杂Michael加成，肟/烯酮共轭加成获得手性β-肟基酮，并展示分子内环醚化；确认是有机制备方法学，不把模型计算当作已证实唯一机理。include。
2. 10.1021/acs.joc.6c01163｜JOC｜首次在线 2026-07-30｜芳基亚胺与DMSO电化学偶联合成β-氨基亚砜；存在真实有机产物及底物范围，不把提出的自由基机理当作直接捕获证据。include。
3. 10.1021/acs.joc.6c01089｜JOC｜首次在线 2026-07-31｜使用Evans手性辅基完成(+)/(−)-Asenapine两种对映体全合成；不是催化不对称全合成，不能把单一步骤dr/ee扩大至全流程。include。
4. 10.1021/acs.orglett.6c03391｜Organic Letters｜首次在线 2026-08-31｜镍催化不对称氢膦化制备P-手性双膦衍生物、脱保护配体；不能凭配体获得推断后续催化性能已验证。include。

## GitHub 可追溯证据、CI 与正式生产隔离
- 首次审计 #38343305627：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38343305627。
- 本轮 PR #590：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/590，最终合并 commit cabf907e69c945681eaba231ce30c11a92707cf2；仅更改 audit/historical-reviewed/2026-10-13-q3-acs-four-publisher-two-pass.json、audit/historical-reviewed/approved-admissions.json、scripts/test-historical-admission.mjs。
- 完整四类 Actions 成功：历史准入 #38351699556、Site quality gate #38351699629、Tampermonkey #38351699465、PDF #38351699445。Site gate 第1次 Playwright 的 Angew 图片回归 9/10 通过但单项失败，按作业级重试后所有作业与汇总门禁均为 success；未绕过测试。
- 审核 manifest 实际回读：checked 29 / include 27 / pending 2 / published 8 / sourceCollision 0；历史已审未发 19；本轮 4 个 DOI 均出现在 main accepted 且均不在 public/toc-demand-live.json；正式目录 984、Q3 743 保持不变。Q3 已审核待正式入库为 13（先前 9 + 本轮 4）。
- 仅 GitHub review / audit / tests。未访问生产 Cloudflare D1、未写 API / R2 / PDF、未触发正式发布或新增定时槽位；Q3 仍执行 toc_only，不追加正文图、SI、PDF；排除历史回补进入 Today/Hot/公众号每日新增。

## 保留的日期争议与未完成项
- 10.1021/acs.orglett.6c02374：ACS DOI 文章路径公开索引显示 Sept 1，而 ACS 期号文章路径显示 Sept 8，历史来源批次为 Sept 8；需进一步核对 publisher Article History / 版本与来源字段。继续 pending。
- 10.1021/acs.joc.6c01483：ACS Article History 索引 Sept 11 vs staging Sept 10；继续 pending，不用论文排版日期、源 createdDate、issue 日期冒充首次在线。
- Chemical Science、Green Chemistry 年份级别日期严重缺口需优先审官方 Advance Articles、Research/issue 和 article landing 的 'First published'，独立出版社逐期目录覆盖及 Q3 完整 DOI 对账仍未完成。320 行首轮清单只是可审核样本，不等于全部 12,286 已双遍审核。
- 用户已设原 23:40 北京时间历史回溯验收任务仍启用；正式发布由北京时间 08:00 的新定时任务独占，旧版本正式发布任务停用，本轮没有修改任何任务。下一轮只有原 08:00 writer 可实际入库并按 DOI 对账完成生产/部署/Archive 检索验收。

## 可验证入口
- 第一轮合同与审计参考：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/historical-2026-q3-catchup-contract.md。
- 详细四篇独立复审：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-reviewed/2026-10-13-q3-acs-four-publisher-two-pass.json。
- 日期缺口和进度跟踪 issue #498：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6138932299。
