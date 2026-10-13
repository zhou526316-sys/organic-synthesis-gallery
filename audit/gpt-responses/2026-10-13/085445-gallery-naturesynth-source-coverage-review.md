# Organic Synthesis Gallery：Nature Synthesis 漏收与16刊发现覆盖核查
北京时间：2026-10-13 08:54:45（Asia/Shanghai）
任务：10月13日08:00发布后，用户展示 Nature Synthesis 10月12日氧杂环丁烷→硫杂环丁烷论文截图，并指出“漏抓了，起码nat.syn.就少抓了一篇，更不用说其他的期刊”。
项目：zhou526316-sys/organic-synthesis-gallery；main；只允许北京时间每日08:00正式新增。

## 已发送的事实与结论
1. DOI `10.1038/s44160-026-01189-z`，Nature Synthesis，2026-10-12，*One-step skeletal editing of oxetanes to thietanes using thiourea*。10月13日08:00已发布7篇、历史补录8篇、生产总库979篇，但这篇未纳入。
2. 完整机器候选 `audit/unresolved-latest.json` 已包含该DOI；正式 `audit/review-2026-10-13-0800.json` 将其记为 pending，下一审查槽为10月14日08:00。不是没有抓到DOI，而是因官方内容证据抓取失败而在科学复核环节漏收。
3. 当时 compact 的 `abstract=""`，审核记录注明 Nature IDP 阻断。后续可从 Nature 官方搜索索引取回公开摘要及图题，明确指出硫脲介导一步 O→S 四元杂环骨架编辑、broad substrate scope、functional group tolerance、复杂药物样分子后期应用；Fig.3为底物范围、Fig.4为合成砌块、Fig.5为后期编辑。强烈支持按已发表一般有机制备方法纳入。注意：直接文章页仍可能因IDP无法打开；不可声称已直接读取全部正文/SI。
4. Nature Synthesis 出版社2026-10-12研究论文目录3篇，机器候选3篇、正式接受2篇、暂缓1篇。Organic Letters当天出版社ASAP列表3篇，机器候选3篇、接受1篇、排除1篇、暂缓1篇。二者没有发现该日期的 DOI discovery 漏项，但审核环节确实存在漏收。
5. 16刊 `sourceChecks` 结果：完整出版社核验0刊；blocked 3；unavailable 13。机器审计4项跨源覆盖警告（Chem、Chemical Science、CCS Chemistry、Green Chemistry），另有5项闭合日覆盖警告，不能证明其他14刊没有漏抓。
6. 5篇 pending：CCS Chemistry三篇、Nature Synthesis一篇、Organic Letters一篇，不能把待审零差额等同全部合格文献均已上线。
7. 已创建证据 Issue #559：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/559 ，状态 awaiting user decision，未修改正式审核/生产数据/发布日程。

## 建议且待用户明确批准的修复范围
A. 为 Nature Synthesis 此 DOI 使用正式可核验的出版社摘要、图题及用户截图，生成文章特定的双遍复核证据与 `scopeAssessment`，保留原日期、旧pending和IDP错误记录，审核结果经下一合法08:00槽执行；不得槽后补发。
B. 对16刊在每日发布前交叉核对出版社按日在线目录与Crossref多ISSN online/published/created/deposit、OpenAlex及正式DOI，自动列出出版社有而机器union没有的 DOI；被阻断/未知单独标记，不填0；按三天主窗口、七天救援尾扫及 verifiedThrough 缺口执行。
C. 高合成相关且 compact 摘要为空时，依法从出版社公开索引、摘要、图题/正文及合法已有证据取回原文；仍缺证时只保留该DOI pending，不因IDP/403而默认排除、不虚构范围/收率。核验门禁的“来源健康≠目录完整”。
D. 整个项目仍只在北京时间08:00由既有授权writer准入新DOI；不得补发或设置18:00任务。已发布的7篇/979篇不做未经授权的改动。需要用户批准上述特定修复批次后才修改代码。

来源：
- https://www.nature.com/articles/s44160-026-01189-z
- https://www.nature.com/natsynth/research-articles?year=2026
- https://pubs.acs.org/journal/orlef7
- GitHub issue https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/559
- 固定同代审计/正式review的blob：latest 3599d16cc219e011f506fb9495367eb5feffcbf2; compact 4810c4df492a7aae48777f61341e4a79ffa79b18; review 1256941dd50fad6aa0d7bdc452e686b04286c3b2。

审核结论：发现并核实一个应纳入但待定的 Nature Synthesis 案例；其他期刊发现完整性尚未得到全部出版社目录证实。当前仅证据文档化/等待批准，未修改生产和发布。