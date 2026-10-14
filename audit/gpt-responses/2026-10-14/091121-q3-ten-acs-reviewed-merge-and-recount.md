# Organic Synthesis Gallery — 2026Q3 历史回溯继续执行：10篇ACS双遍审核、合并、复算

北京时间 2026-10-14 09:11:21，ChatGPT项目“抓取有机合成文献并持续更新网页”，用户回复“继续”。本文件同步用户可见成果、真实Git SHA和Actions结果；不包含API密钥、付费正文、SI、PDF、原始全文摘要或图片。

## PR #622：10篇原始ACS论文，合并成功

[PR #622](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/622) 于全部四类CI通过后合并到唯一基线main，commit [7caf171771f06d9cb4e454452a01fd548f65ef3a](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/7caf171771f06d9cb4e454452a01fd548f65ef3a)。逐篇从ACS官方Article History核对Published Online首次在线日，对齐两类Crossref/OpenAlex冻结来源及原始Git blob SHA、书目作者卷期页，实际起始物→产物的制备证据、独立第一遍范围审查和具体第二遍挑战。审核归档：[十篇逐篇学术证据](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-reviewed/2026-10-14-q3-acs-ten-original-two-pass.json)。

|期刊|首发日|DOI|主要原创合成贡献|
|---|---|---|---|
|JACS|2026-07-08|10.1021/jacs.6c09478|Glutinosasins A–E分歧式不对称合成、Baran还原偶联与retro-Claisen骨架构筑|
|JACS|2026-08-06|10.1021/jacs.6c04476|异硫脲催化对映选择性Sommelet–Hauser重排，DFT与交叉实验支持离子对快速复合而非严格确定的协同通路|
|JACS|2026-07-04|10.1021/jacs.6c09845|NaCl、CPA/PTC双催化结合交替极性电解不对称氯化半频哪醇重排|
|JACS|2026-08-06|10.1021/jacs.6c09948|Venezuelaene A首次不对称全合成：TEMPO氧化Nazarov环化和串联复分解|
|ACS Catalysis|2026-07-16|10.1021/acscatal.6c03499|Rh(III)催化吲哚C2–H活化、烯烃chain-walking、不对称1,1-碳胺化|
|ACS Catalysis|2026-08-18|10.1021/acscatal.6c03761|Cu催化炔丙基[3+2]环化/酸促进芳构化，获得对映富集含氧/含氮杂螺烯|
|ACS Catalysis|2026-08-10|10.1021/acscatal.6c04538|S(VI)磺酰亚胺酰氟与脂肪醇氢键诱导SuFEx动力学拆分，不是假称去外消旋|
|Organic Letters|2026-08-22|10.1021/acs.orglett.6c03345|Ni/光双催化β-硼基NHPI酯脱羧、自由基1,2-硼迁移与SH2单氟甲基化|
|JOC|2026-07-10|10.1021/acs.joc.6c00961|Pd交叉偶联合成芳基/杂芳基重氮膦酸酯及独立后续Rh环丙烷化|
|JOC|2026-09-18|10.1021/acs.joc.6c01352|Ni–BINAM配合物直接可见光敏化C(sp2)–N偶联，无外置光催化剂，脂肪胺可双重兼任配体|

重要的波形证据：JACS 10.1021/jacs.6c09845公开0.3 mmol实验采用2 mA、低频方波AC 0.0017 Hz、NaCl 3 M水相、CPA 5 mol%和PTC 10 mol%。AC主要缓解电极沉积/过氧化，ee由手性催化剂/相转移体系协同控制；不能称AC本身直接给出ee。原文：[ACS](https://pubs.acs.org/doi/10.1021/jacs.6c09845)，[NLM开放原文](https://pmc.ncbi.nlm.nih.gov/articles/PMC13383718/)。所有实验数字均严格保留底物/场景限制，不凭空推测全体产率、ee、规模或机理。

四项CI均真实completed/success：
- [历史准入 #38493336862](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38493336862)
- [全站与Playwright #38493336826](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38493336826)
- [Tampermonkey #38493336844](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38493336844)
- [私人PDF #38493336875](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38493336875)

合并前重读main：10个DOI均无学术清单或正式卡片冲突，三个ACS双官方Published Online日期冲突 DOI 10.1021/acs.orglett.6c03028、10.1021/acs.orglett.6c02707、10.1021/acs.joc.6c00852 未被自动放行。合并后main回读：历史审核通过101（原91）、已审总103（原93）、原权威pending仍2。全部新增是historical_backfill、toc_only、new=false、addedDate空，不抓历史正文图、SI、PDF，不进入Today/Hot/公众号当日新增。

## 正式与待入库的边界

北京时间2026-10-14 08:00原正式writer已发布此前已审批的全部91篇历史文献。正式目录现1091篇，其中Q3实际820篇，2026-10-14每日正常新增24篇。旧91篇全部与正式文献目录按DOI、日期及媒体政策对齐；PR #622本轮新增10篇尚未进入正式网页或生产D1，只能等待原2026-10-15北京时间08:00唯一正式发布程序再次独立校验。历史审核清单内遗留summary.published=8是旧基线，不应解释为今日已正式入库数量。

## staging-only季度复算

复用已有触发文件更新commit [6d7619532138037c7d9605111ff29881d2830991](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/6d7619532138037c7d9605111ff29881d2830991)，并未新建/改动正式发布任务，也未访问生产D1。真实[GitHub Actions #38494020825](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38494020825)成功完成。两份staging审计generatedAt严格相同2026-10-14T01:08:10.581Z（北京时间09:08:10）：
- quarter-2026-q3-coverage.json git blob a62bebc7a90aa6c6585c473d77e7a02fac82a448
- quarter-2026-q3-review-worklist.json git blob 98da7b655d3c6af172862f3518832699b96fccdd

季度未审或日期待核来源候选11,448→11,438（-10）；Q3已审待下次08:00正式入库0→10；Q3正式820不变；来源去重DOI 12,286不变，完整Crossref/OpenAlex来源窗口192/192不变；本轮Q3来源候选正式收录827。PublisherIssueResearchReconciliationComplete仍false，无法把元数据来源窗口完成误称16刊出版社Research逐期目录和有机合成学术范围完整。11,438条混合领域候选不是11,438篇合格有机合成漏收论文。

## 出版社目录下一阶段

已只读核对旧[Nature Synthesis 7–8月PR #612](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/612)的出版社目录Research 13+13 DOI，26篇其期号文章列表Published日期均在2026年7月之前，说明7–8月期号月份不等于7–8月首次上线日期，且逐篇publisher landing first-online尚未独立核验。旧[Nature Catalysis 9月PR #608](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/608)按出版社Research段已有10 DOI核验。两个PR原CI绿灯但均停留旧base，静态正式目录成员快照仍在984篇时代，不能当成当前1091篇生产完整性验收；本轮未直接把旧分支强制合并。后续应重新对账当前Catalog、逐篇首发日和Publisher Research DOI，再通过独立CI合并。

本轮里程碑同步[历史追踪Issue #498](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6158610008)，长期规则保持唯一08:00正式新增、历史补录从不进入当日新增、7–9月只抓官方TOC。
