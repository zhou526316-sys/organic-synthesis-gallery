# Organic Synthesis Gallery — 官方源查全与历史边界复审核验回报

时间：2026-10-12 09:16 Asia/Shanghai
任务：用户批准继续攻克尚未实查的出版社目录及高相关历史 exclude；唯一正式新文献发布仍为北京每日08:00。
GitHub Main 读取版本：审核前 main=11c7bc936c40294295e01544363aee273252e6f2，范围规则 d3507dde0d44c4482ce9866ff81c73f0f97b0a92，纠错清单74978d92a16d353271f16f111425d09e4de84f07。审核记录追加不改变源数据。

## 已发出的本对话可见答复部分

已开始执行针对性查全与复审，今天的 08:00 正式发布结果仍保持 **5 篇**，没有进行额外补发。

这轮取得了新的独立来源证据：已成功读取 **Angew、Science 和 Science Advances 的出版社官方 RSS**，不再仅依赖 Crossref/OpenAlex 判断这些期刊的发文情况。此前被网页反爬拦截的目录，已有部分可以通过官方订阅源核对。

同时，已开始扫描历史审核记录中的高相关排除项，重点检查聚合方法、选择性有机转化和电化学反应，而不是无差别重新审核全部论文。

## 完整进展与结果

1. 出版社的独立直接证据覆盖由最初**6/16刊**提升到**13/16刊具有可读取的出版社目录或官方RSS**。新增可访问的七刊为：JACS、ACS Catalysis、Organic Letters、JOC、Angew、Science、Science Advances。ACS官方RSS（`pubs.acs.org/rss/{journal_code}/asap.xml`）在本次真实抓取中四刊共观察29个DOI，全部与10月9—12日正式审计或10月11日postrelease-late review对齐，未找到未审DOI。Wiley Angew官方feed中10月10日8条EarlyView也全部可追溯。注意：官方RSS存在更新滞后、Issue重组再播，不是“全日期完整查全”；依赖DOI first-online防止旧文计为新发。
2. 25个ISSN、三种Crossref日期字段共75次核验的10月10—12日84条去重DOI，均可追溯近期正式或发布后审核。此结论仅针对当前已注册入索引的DOI，不能替代尚未入索引的出版社新发表条目。
3. 历史排除专项逐篇核查12条：基于实际文章摘要/可见正文，8条维持原排除有支持依据；4条保留未闭合的重要SI/制备证据问题（`10.1002/anie.2052342` 电化学Scholl条件切换、`10.1021/jacs.6c11537` 废PET连续脱羧、`10.1021/acscatal.6c06150` CO2耦合乙烯低聚/共聚、`10.1021/acscatal.6c07255` α,β-不饱和醛选择性氢化）。
   - `10.1021/jacs.6c11537` 的出版社支持信息目录明确列出“substrate extension”表格，因此在未读表格前不能再简单说该文绝无额外底物；具体底物、产物范围和分离数据仍未知，不凭SI目录字样直接改include。
   - `10.1021/acscatal.6c06150` 的ACS可见原文2.1部分含不同Pd配体比较、C4–C28烯烃低聚、34 mg分离的CO–乙烯交替共聚物；但是催化反应模式是否独立于已知Pd膦磺酸盐硼烷加合物、能否形成通用可推广的合成平台还未证明。不能称其只含能耗参数，也不能没有证据就补收。
   - `10.1002/anie.2052342` 的Crossref原文摘要说大部分底物能经历两条Scholl路径并报道切换条件产生不同产物，须检查全文/SI有无充分制备范围；现在不推翻原审核。
4. 其余3刊 `Chem`、`Chemical Science`、`Green Chemistry` 的完整出版社列表仍未取得；Cell页面被拦，RSC RSS/Advance Article尝试被拦/404，不能把本轮Crossref的0误报为出版社确实0。全体历史已排除2101项尚未重新逐篇实查，四条优先边界重审仍需正文/SI。因此仍不能宣布实际应收总数恰好5篇或16刊完全闭合。原有 `verifiedThrough=2026-09-18` 不擅自推进。
5. 本轮新增两份审计、没有修改生产论文、用户新文献发布卡片、TOC、媒体、正式审定结果及定时任务。2026-10-12 08:00正式发布依旧为5篇，生产总卡片964；下一次合法新增只能为次日08:00（如获审核通过）。

## 已写入并回读的审计文件

- `audit/source-completeness-publisher-rss-2026-10-12.json` — blob SHA `ed1426c9e2c78e191cb0356b2ad658050fdf2688`；GitHub提交 `05b41b2c38eafc058652b8648ae83b2e8dc16e9e`。
- `audit/scope-rechecks/2026-10-12-targeted-high-risk-exclusion-challenges.json` — blob SHA `f5656287a93e7fa8caff3b440e2b96a8e8395411`；GitHub提交 `72d509515f1cde99a7c1dbe4917a4d5d73a59fab`。
- 上轮交叉核验：`audit/source-completeness-crosscheck-2026-10-12.json`。

## 结论

**发现源核验有真实进展，但没有获得全16刊完全闭环的可验证依据。** 不能宣称已完成对所有历史错误排除的纠正；不能提前发布疑似遗漏项。本轮确认的4个证据缺口作为后续固定审核优先事项，而不是伪造pending或擅自加入生产集合。
