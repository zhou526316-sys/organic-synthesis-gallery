# 本次用户回复同步：2026-10-14 历史全库科学正文采集与索引继续工作
- 北京时间：2026-10-14 10:29:04 Asia/Shanghai
- Conversation: 抓取有机合成文献并持续更新网页／历史正文独立补抓用户“继续”，承接截图527/527、0成功和项目专项批准。
- Main唯一基线，安全不存正文/XML/PDF、Cookie、管理员私钥。
- 生产0.2.7线上实际读回；已合并历史Publisher callback PR #624、全正式目录OA PR #625。
- GitHub PR #633 已合并，SHA 13c5f27f5d30409d2419c1aff63011c2b537090b；所有必要CI包括网站质量、TM、PDF、Worker、正文检索通过。仅增加每次最多20DOI的GitHub Actions生成代次限制与审计文件触发，无新Cron。
- 官方首窗旧1087/1091不同目录代次已检测并丢弃跨代次拼接；当前 catalogId f263e943427a16c8fa52c828d786fb90fc7366d6e01bd74e1b2b1bd148d69870，正式1087，历史有日期826，无日期10。
- 正式OA五窗真实运行：#38499910931（0）、#38500108635（20）、#38500247352（40）、#38500454607（60）、#38500747243（80），每20 DOI均成功，相同 catalogId，0原始XML保存或正文导入；100篇状态9可审候选/21许可限制/41 Europe PMC OA缺/28元数据DOI缺/1许可不明；下一offset100。
- Immutable审核归档：
  * audit/historical-body-review/2026-10-14-formal-oa-windows-0-79.md (commit 77e5929d9176b9f97bee1cd876f8bb9e5cd869e7)
  * audit/historical-body-review/2026-10-14-formal-oa-window-80-99.md (commit 305354fd43f264d299bb2456ce2e1ee01d5bac21)
  * audit/historical-body-review/2026-10-14-formal-oa-checkpoint.json (commit 086819908d5ed045b3191e37c84e9f06740baba4)
  * NatureChem first pass file commit 6ef61f5107a96ca4a623dbce5ebc55dc87877e22
- Science first-pass on NatureChem 10.1038/s41557-026-02206-6 via primary publisher article, scope, control failures, ReactIR/DFT mechanistic proof labels, DPPH reagent collision warning; not SI/second pass; no false complete/auto import.
- From user's local browser to ChatGPT no direct account/local Tampermonkey access; 0.2.7 eight DOI pilot requires user to run on Edge/Chrome with existing login/GM token. Live success not invented.

## Earlier user-visible partial answers in this turn

(1) 已核实PR #624 0.2.7 publisher callback 修复和PR #625 正式OA全目录扫描合并，189条ACS真实尝试中178条无回执；新增至多8篇回执核验；独立公有章节FTS默认关闭。
(2) 首个旧代次的1091与新代次1087不同，禁止混合；新代次重算。
(3) 当前1087 DOI/826明确历史/10历史未定，首20篇1候选、8限制、5 PMC OA缺、5 DOI元数据缺、1许可未知，成功读取无公共导入。
(4) 60/826篇5候选，两个进一步来源窗口#38500108635和#38500247352。
(5) 100/826篇9候选，5窗状态21限制41 PMC缺28元数据缺1未知，NatureCatal 10.1038/s41929-026-01576-x 44 sec/9 fig/1 table，结构候选不等于科学审阅合格。

## Terminal user-visible reply
## 本轮继续执行的结果

**已完成可审计的正式历史正文来源核查 100/826 篇；得到9篇待独立科学/版权审核的开放全文候选。** 这不是公共全文正式收录数，公共章节 FTS 的实际新导入仍是 **0**。

通过 [PR #633](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/633) 合并了可断点续跑、带正式目录代次校验的 OA 来源审计。基于当前 **1087篇正式 DOI**、**826篇有确切日期的历史 DOI**（10篇历史日期待核验），已经真实扫描0–99的五个20篇窗口。分类为：可继续审核9、限制性许可21、Europe PMC未提供符合当前条件的OA全文41、该来源 DOI 未匹配28、许可证不明1。五个窗口均确认相同catalogId，下一安全游标是 **offset=100**。

已把逐窗口来源和9篇候选的SHA/章节结构归档在 [100篇扫描检查点](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-14-formal-oa-checkpoint.json) 和 [详细候选审计](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-14-formal-oa-windows-0-79.md)。Nature Chemistry `10.1038/s41557-026-02206-6` 的[主文科学初审](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-14-naturechem-02206-science-first-pass.md)也已完成：其DPPH是**O-diphenylphosphinylhydroxylamine胺化试剂**，不能误标成常用的DPPH自由基捕获试剂；作者的ReactIR/DFT证据支持aziridinium途径，但尚非分离中间体的直接实证。SI、第三方图表许可和第二遍科学审核仍待核实，未授权公开全文导入。

**527/527复查、0篇新增**的浏览器回执问题仍是独立故障。线上已核实 [0.2.7脚本](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)，它提供「出版社回执核验（最多8篇）」比较出版社直达与 DOI Resolver，但没有你本人Edge/Chrome新一轮8篇的真实报告，不能宣称该故障已经修好。你只需在原浏览器更新同一个脚本，刷新 Gallery，点这项8篇核验；完成后使用已保存密钥「立即上传待发诊断」，再查看「服务器报告」。**不要重新跑527篇。**

下一阶段有两个独立且必要的完成条件：从 `offset=100` 继续已批准正式 DOI 的合法 OA 来源审核；对9篇候选逐篇做SI/全文章节、出处和版权复核，只有真实通过的正文才进入独立章节FTS。尚未提供可合法共享原文的文章保留元数据检索与合法私人检索，不能靠HTTP200或阅读权限直接公开。原有TOC、正文图、PDF及每天唯一08:00正式发布未改变。
