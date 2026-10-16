# 历史回溯续作｜超时恢复与新增原创研究审核

北京时间：2026-10-16T18:15:56+08:00
回复上下文：用户“消息传输超时。请重试。”，恢复 2026 年 10 月 16 日历史回溯工作
相关 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/726
学术审核合并 SHA：1968f829f9701c5d8ebe68e0a5ee33df8054638a
原上轮学术审核 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/725
原上轮 SHA：f5b8be4976b3ffae20a2228889c5f8e03cb2d5b6
记录用途：项目全局回答同步；无密钥

## 用户可见回复完整要点

已恢复上轮历史回溯任务。超时没有导致审核结果丢失。已确认 PR #725 合并，前次基线学术审核批准 232 篇、正式历史入库122篇、批准/正式账面差额110篇、原有日期争议2篇、Q3待审及日期未核11148条、全历史来源57266条、OpenAlex失败27个窗口。这些是分别读主线和 staging 的独立口径；Q3 11148 是 staging 上次生成的统计快照。

超时后继续完成另外一批原创有机合成研究的来源与双遍科学审核：JOC 4、Organic Letters 8。PR #726 专门保存冻结Crossref+OpenAlex来源Git blob、reviewer queue blob、root SHA256、原刊日期、作者与书目、第一遍实际制备研究和第二遍独立科学反证。十二篇最终 DOI：
- 10.1021/acs.joc.6c01582：烯基异氰基酯与醛在不同DBU用量/溶剂下分歧得到噁唑或噁唑啉。ACS Published Online 2026-08-27，91(36):12389–12400；不可把纸本September 11当首次在线。
- 10.1021/acs.joc.6c01132：分子内EDA光化学吲哚去芳构化螺环化。
- 10.1021/acs.joc.6c01019：脂肪醛/硫叶立德/腙三组分环丙基胺合成。
- 10.1021/acs.joc.6c01355：铜催化儿茶酚氧化偶联及α-DDB、Bicyclol的全合成。
- 10.1021/acs.orglett.6c03428：Ni催化醛/硝基芳烃还原胺化制仲胺。
- 10.1021/acs.orglett.6c03400：Cu(I)光催化烯烃/芳酰氯/CsGeBr3三组分酰锗化。
- 10.1021/acs.orglett.6c03498：铜介导六氟丙酮水合物-联吡啶加合物进行吲哚和苯胺HFIP基团官能化。
- 10.1021/acs.orglett.6c03305：PCET糖基醇活化及多种后续C–C官能团化。
- 10.1021/acs.orglett.6c03444：镍催化亚甲基环丙烷/醛开环还原偶联，控制区域和dr而非全部ee。
- 10.1021/acs.orglett.6c03047：原位N端Boc-亚胺导向肽中苯丙氨酸C–H硫化。
- 10.1021/acs.orglett.6c03023：不同工程化酮还原酶实现对映发散二羰基酯还原。
- 10.1021/acs.orglett.6c02986：PhSO2CF2I顺序产生两次自由基等价合成子构筑CF2桥连骨架。

修复过程中 CI 发现：最初候选 JOC 10.1021/acs.joc.6c00852 属已有独立Publisher online日期冲突的暂缓名单，不能因本轮重新检索就批准。保留既有未修改的历史回归，撤下该条，替换为已被ACS Article History与Crossref/OpenAlex同日证实的 6c01582，并添加必须不批准6c00852的显式回归。其他4篇新检查发现的ACS出版社页面日期一天差异也留证据不批准，不冒充正式完成。没有修改原有历史日期争议2篇或政策排除。

最初CI历史入库回归因此未通过；修正后新 head b0b23c1c5fb267dbb3537face24f32fceb8cefd5 六项必需CI最终全部成功：历史审核授权、2026Q3来源与审核隔离、历史Q3来源溯源、网站整体质量、目标期刊Tampermonkey回归、私有PDF回归。PR #726 以准确head SHA执行squash合并，main正式回读批准244、原待核2、正式文献1186篇、其中正式历史122篇，新增12篇正式上线0篇。累计审核批准与正式历史目录相差122篇，此差额需进一步经原排除名单和08:00门禁复核，不代表122篇必定可发布。

Q3 staging工作单仍显示11148条待学术核验或出版日期核实（generatedAt 2026-10-16T08:06:03.031Z，尚未因本次 PR 重算）。全历史源 DOI 57266，27个 OpenAlex 窗口因 http_401:api_key_missing仍未解决。历史前2026-07-01 metadata_only，Q3七至九月 toc_only，new=false，addedDate=""；保留唯一北京时间每日08:00正式新增窗口，严禁晚间补发；没有Cloudflare D1、TOC/PDF/正文图/SI、Today、Hot、公众号每日新增加载，也没有前台真正发布。

Git审核材料：
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-reviewed/2026-10-16-q3-twelve-acs-part1-source-two-pass.json
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-reviewed/2026-10-16-q3-twelve-acs-part2-source-two-pass.json
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-reviewed/2026-10-16-acs-online-date-route-variance-and-scope-holds.json
提交同步前学术main SHA：1968f829f9701c5d8ebe68e0a5ee33df8054638a
