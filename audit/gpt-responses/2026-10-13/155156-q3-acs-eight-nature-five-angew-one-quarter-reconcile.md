# 2026Q3 历史文献回溯｜2026-10-13 实际完整工作与用户可见回复归档

北京时间：15:51:56，任务上下文：ChatGPT项目《抓取有机合成文献并持续更新网页》用户“继续”，对2026年7月1日—9月30日16刊完整性优先审计。main是唯一正式基线。本审计文件包含本轮用户可见重要结论与执行证据；不包含凭证、付费原文、私有密钥或PDF。

## 用户已经收到的第一阶段可见信息：Q3新一轮核对发现非原创 DOI 的漏审原因

在320条待审清单中，至少五篇以有机合成为标题的Nature文章被出版社明确标记为非原创研究，不应当因为Heck偶联、CO2羧化、吡咯合成、环加成、氮杂环丙烷开环等化学关键词而当作原创工作。五篇具体是：
- Nature Catalysis `10.1038/s41929-026-01597-6`：News & Views；真实原文 `10.1038/s41929-026-01579-8`。
- Nature Synthesis `10.1038/s44160-026-01160-y`：News & Views；真实原文 `10.1038/s44160-026-01161-x`。
- Nature Synthesis `10.1038/s44160-026-01174-6`：Research Highlight；追溯真实原文 Angew `10.1002/anie.8203203`，2026-09-08。
- Nature Chemistry `10.1038/s41557-026-02201-x`：News & Views；被讨论的原研究 `10.1038/s41557-026-02167-w` 初次发表2026-06-05（不是Q3）。
- Nature Chemistry `10.1038/s41557-026-02246-y`：Research Briefing；原研究 `10.1038/s41557-026-02247-x`。
对这些 exact DOI 执行出版商页面Article Type确认与文章级独立第一遍/对抗第二遍审核，严禁按标题关键词把真正原始研究排除或重复建卡。原文章DOI只有在独立学术证据通过后入Gallery。

## 已完整通过CI并合并的八篇 ACS 研究

[PR #597](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/597) 全CI成功，squash merge `1c54da7af28d0f4c95ce55fab66c7b5aea351f57`；学术审稿材料 `audit/historical-reviewed/2026-10-13-q3-eight-acs-original-two-pass.json`。
- JACS `10.1021/jacs.6c08244` 2026-07-31，π扩展Co红氧活性配体催化烯烃不对称cis硼基环丙烷化；该方法提供立体保持的硼酸酯衍生能力，不把通常>99%ee当成全部底物。
- JACS `10.1021/jacs.6c11788` 2026-07-29，Pd/P,N配体芳炔-炔烃[2+2+2]不对称构建轴手性联芳基（多种C–C/C–N/C–B轴）。
- ACS Catalysis `10.1021/acscatal.6c03737` 2026-07-23，光/Co协同醛分子内不对称烯基化形成6–10元环状烯丙醇。
- ACS Catalysis `10.1021/acscatal.6c04804` 2026-08-24，Co不对称芳基化与螺缩酮化串联生成双手性中心[5,5]螺缩酮。
- Organic Letters `10.1021/acs.orglett.6c03121` 2026-09-06，环硫鎓盐与有机碘化物的电化学Ni交叉亲电偶联（C(sp3)–C(sp3/sp2)）。
- Organic Letters `10.1021/acs.orglett.6c02892` 2026-07-30，Cu催化环丙醇/N-磺酰亚胺不对称开环加成γ-磺酰胺基酮。
- Organic Letters `10.1021/acs.orglett.6c03201` 2026-08-29，Ag催化水相C–Se交叉偶联制备手性(杂)芳基/烯基硒糖苷。
- JOC `10.1021/acs.joc.6c01478` 2026-08-26，Tacaman单萜吲哚生物碱三种完成全合成、另两种是**形式全合成**，二者不可混为五种全部全合成。
每篇核对官方ACS Article History在线首次日期、题目、作者、公开摘要、卷期与页码、Crossref/OpenAlex staging source及Git blob SHA，真正两遍合成范围审核。PR只改审稿+测试，无正式出版。

## 5篇 Nature 非原创及其真正原文的分流

[PR #598](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/598) 全部CI成功、合并 `6f0230563d5da751ec2514d23527016a32d0e42c`。引入单独的 publisher-nonresearch exclude ledger `audit/historical-reviewed/q3-publisher-nonresearch-exclusions.json` 和验证/分流程序；来源DOI总量仍计入五篇，但它们不再冒充‘未审核有机合成研究候选’，不修改用户永久指定排除名单，也不能扩张成所有News&Views通用自动排除。
正式源码解读与二次评论DOI严格区分。进一步更新 Research Highlight的原始Angew DOI到main，commit `4aa9f566f4023f2c9a4d842d316fc4bcfabddf98`。

## Angew 真正原始吡咯合成论文

回查 Nature Synthesis 2026-09-28 Research Highlight `10.1038/s44160-026-01174-6` 发现另一个DOI原文：`10.1002/anie.8203203`，原题“**Sustainable Access to N-Heterocycles: One-Pot Cascade Synthesis of Pyrroles From Bio-Derived Furans**”。
Wiley Angew首次在线 **2026-09-08**，作者Haifeng Qi, Germán López Robledo, Jianglin Duan, Yujing Ren, Kathrin Junge, Matthias Beller。历史Crossref/OpenAlex实际批次 `2026-09-08_2026-09-14_angew`，Git blob `162e2cc6724fd2e87dd5ca5300bcbdbea06edc37`。双功能Pt簇/Brønsted酸HY分子筛在常压H2下促进硝基芳烃选择性还原与生物质呋喃开环缩合形成N-取代吡咯；Wiley公开原始摘要有>30例、最高97%产率与真实抗分枝杆菌药物候选制备，符合真正合成方法学而非只有催化材料表征。催化结构与反应机理的推断强度同实际制备数据分开。
[PR #599](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/599) 已经历史准入/站点质量Playwright/Tampermonkey/PDF全部success后合并，commit `26c4e81dae891ea154c1d8adc649a5c7d020d408`；专门审稿记录 `audit/historical-reviewed/2026-10-13-q3-wiley-pyrrole-original-two-pass.json`，不存在正式卡片且不提早发布。

## 真实季度来源复算（只读GitHub staging，0生产D1）

原有安全触发文件 `audit/automation-triggers/historical-review-triage-bootstrap.json` 经SHA对比后更新 main commit `c3f429963a26e6621eec3ac537808b353139013b`，触发真实 [GitHub Actions #38365119113](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38365119113)，状态 `completed/success`，不是假定触发成功。实际报告 `staging/historical-archive-nightly/audit/historical-staging/quarter-2026-q3-coverage.json`、`quarter-2026-q3-review-worklist.json`，generatedAt **2026-10-13T07:49:33.374Z** (北京时间15:49:33)，后向GitHub成功回读。
- 来源根完成192/192；来源DOI出现12368次、unique12286、跨窗口重复82、原始API Q3日期11372、日期来源不明或歧义914、日期冲突记录82。
- SourcePublished计数750与已存正式Q3计数743是不同类别，不能互相替换。
- 按正式文件日期统计 Q3正式收录743、正式全站984；Q3从历史审核通过但**尚未发布**32；明确保留2篇原始ACS日期争议pending。
- 5篇出版社证实的非原创DOI单独记为`sourcePublisherNonResearchExcluded=5`，另有`sourceExplicitlyExcluded=4`是与历史源Q3匹配的用户纠错集合，必须分开计数。
- 尚需Q3学术审核或者出版日期核对候选 **11493**（之前11507，减少8篇新增ACS+1篇新增Angew+5篇非原创审实排除；不是有机合成合格论文数），总36页可轮换，每页320。五篇排除DOI不再出现在page0工作清单。
- main学术准入名单回读 `checked=48, include=46, pending=2, published=8`；其中Q3 40篇已审通过=此前已经正式Q3入库8+待08入库32；2026-07-01前审核通过6篇亦待唯一正式槽；所有历史学术待08共**38**。
- 真实Q3出版社逐期Research目录验收仍`publisherIssueResearchReconciliationComplete=false`；API 192窗口完成不能当作出版社全刊闭合；约1000篇/季度仅预警参考，不能强行收录。

## 生产隔离与后续

本轮只对main的历史审稿、分流代码、测试和response audit写入；没有触发任何新正式发布或18:00旧槽。所有符合条件的历史通过记录仅等次日北京时间08:00原有writer二次正式校验。Q3旧文献仅补出版社官方TOC，7月1日前仅 metadata_only；历史不进入 Today/Hot/微信公众号每日新增；不抓取旧正文、SI、PDF，不消耗Cloudflare生产D1。
两个原有日期争议仍 pending：`10.1021/acs.joc.6c01483`和`10.1021/acs.orglett.6c02374`。下步优先16刊Q3逐期Research DOI覆盖核验、最早在线日期证据溯源、低关键词论文实际学术双遍审核。
追踪现已写入 Issue [#498 的新证据评论](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6140912440)。

### 最终用户报告核心内容
Q3第二阶段核验完成：8篇ACS原创+1篇Angew原创论文逐篇双审并在CI全部通过后合并；5篇Nature非原创研究评论单独证明并从待审论文表剔除，但仍计入source DOI total。真实Q3报告为192/192，独立来源DOI12286，日期不明914，已审Q3待唯一08为32，另外2个ACS日期争议pending，未审或日期待核11493，季度出版社目录尚未闭合；历史46篇审核通过、38篇已审核未正式上网；正式网页984篇，Q3 743篇，未提前发布。下一步出版商逐期研究目录与独立合成科学判断继续，不凑参考1000篇。
