# 历史回溯续作｜2026 年 10 月 16 日晚间

- 北京时间：2026-10-16T22:57:52+08:00
- 对话：用户“继续”历史回溯工作
- PR #727：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/727
- 学术审核合并 SHA：66f16ab5d35543e807330714fa561609b91595c8
- 本文件用于跨窗口回复审计同步，不含任何密钥

## 先核对的历史状态（用户可见第一部分）

读取 GitHub main 和 staging 时，学术批准244、正式历史文献122、第三季度待审核或日期待核11148、全历史来源DOI57266、OpenAlex未完成窗口27。三篇原始候选已经正式收录，无须再审核：10.1021/acs.orglett.6c03062、10.1021/acs.orglett.6c02881、10.1021/acs.orglett.6c02944。

## 本轮新增完整十篇：双源 DOI、出版社在线日和真正原始制备贡献

Organic Letters 五篇：
1. 10.1021/acs.orglett.6c02582，2026-07-29：异头端原位溴化后Ni催化部分保护糖与活化烯烃还原C-烷基糖苷化，不是裸异头羟基直接镍偶联。
2. 10.1021/acs.orglett.6c02743，2026-07-30：环丙醇和邻二胺的分歧关环；HFIP促1,5-苯并二氮杂卓，DMSO促进进一步氧化重排成喹喔啉-2-甲醛。
3. 10.1021/acs.orglett.6c02778，2026-07-28：低价磷、炔烃生成两性离子磷茚后对环醚C–O σ键跨环加成构筑环番。
4. 10.1021/acs.orglett.6c02806，2026-07-29：可见光乙烯基叠氮与α-溴丙二酸酯经亚胺自由基1,6-HAT构筑四氢吡啶，不能误称协同[3+3]。
5. 10.1021/acs.orglett.6c02645，2026-07-27：α-CF3烯烃与醇，经光催化剂/气氛/溶剂选择性切换保氟氢烷氧基化、脱氟酯化和有氧羟基烷氧基化。

JOC 五篇：
6. 10.1021/acs.joc.6c01268，2026-07-25：恒电流非隔膜电解烯基苯磺酰胺分子内碘胺化（C–N和C–I），非交流电。
7. 10.1021/acs.joc.6c01384，2026-07-27：β-CF3烯酮与脒的碱促进形式[3+3]成环，形成含CF3四取代碳的二氢嘧啶，不默认有ee。
8. 10.1021/acs.joc.6c01526，2026-08-27：布朗斯特酸切换下偶氮呋喃与醇或胺骨架编辑成烷氧基或胺基γ-内酰胺。
9. 10.1021/acs.joc.6c01408，2026-08-27：Cs2CO3介导O-Ts羟胺/3-羟基吲哚酮的分歧[3+2]/[4+2]关环得到不同螺吲哚酮，主要dr不是ee。
10. 10.1021/acs.joc.6c01759，2026-09-21：吩噻嗪型光催化剂EnT驱动分子内芳烃去芳构化[2+2]，三重态激基复合物证据以DFT支持。

每篇第一遍分析真实制备变化、底物和产物、适用范围，第二遍独立写机制与概念反证；非两名人类审稿者。出版社ACS Article History日期、作者、卷期页与冻结Crossref/OpenAlex时间一致；原始raw Git blob、review queue Git blob、source root SHA256均在逐篇原始审计中。无原始全文/PDF/SI/TOC下载或版权摘要复制。Q3旧文献仍toc_only、new=false、addedDate=""。

审计材料：
- audit/historical-reviewed/2026-10-16-q3-ten-source-verified-originals-part1-orglett.json
- audit/historical-reviewed/2026-10-16-q3-ten-source-verified-originals-part2-joc.json
- scripts/test-historical-q3-ten-acs-originals-20261016.mjs
- 历史审核强制 CI workflow 已包含测试

## CI 和合并

PR #727 的准确 head 4ec69686e82b5b9f13374ede4097cd50047f41a8 六项必需检查全部成功。初次 Site quality gate 唯一失败：WebKit测试“visible pending TOC is rechecked after five minutes without a page reload or new publisher visit”中DOI 10.1039/d6gc05783g 的data-state期望not-yet-available实际idle；它与本批历史论文审计无代码因果关系，失败任务未跳过并重新运行，第二次完整Site quality gate所有检查成功。未以此宣称修复了潜在前端BUG。期间另一条Tampermonkey线路同步更改main toc-demand-live目录，已在合并前再次确认没有新的10篇DOI发布或历史manifest冲突。

CI全绿后PR #727 squash合并，准确合并SHA 66f16ab5d35543e807330714fa561609b91595c8。合并后main回读历史学术批准254、原有日期争议pending2、正式全站文章1186、正式历史入库122、本批10篇正式入库0。账面批准与正式历史数量差额132，不自动等于可发布篇数，仍需独立政策排除及08:00入库保护。Q3 staging最后生成于2026-10-16T08:06:03Z，仍显示11148待审或日期核验，尚未对新批重算，不能在旧快照上机械减10。57,266历史来源DOI尚不能代表完整创刊以来所有合格有机合成文献；OpenAlex 27失败窗口未经本轮解决。

用户最终可见要点：本轮 +10 审核通过（Organic Letters 5/JOC 5），累计254，正式历史122，差额132，来源及版权边界安全。唯一正式发布仍北京时间每日08:00，禁止夜间正式新增。审计SHA如上。本回复与工作均不触发正式发布。
