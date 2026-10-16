# 历史回溯续作｜2026 年 10 月 16 日

- 北京时间记录：2026-10-16T17:19:21 +08:00
- 对话标识：2026-10-16 历史回溯续作，PR #724 后 Q3 学术审核及 #725 入库隔离
- 关联合并提交：f5b8be4976b3ffae20a2228889c5f8e03cb2d5b6
- 响应同步标记：项目全局 GPT 回复归档（不含任何密钥）

## 已确认基线及上一条线的新进度

已接续 `zhou526316-sys/organic-synthesis-gallery` 最新 `main` 和 `staging/historical-archive-nightly`。
用户提供的起点为历史批准 218、正式入库 122、差额 96、Q3 未审与日期待核 11157、全源 DOI 57266、OpenAlex 鉴权失败 27、审核缓存不同步 0。
PR #724 在当前回读前已合并，新增9篇 DOI 精确双遍原创学术核验：218→227。正式入库仍122，差额105。

## 本轮原创论文双遍审核：5 篇

已建立并完成 [PR #725](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/725)，新增5篇，累计学术批准 227→232。逐篇冻结 Crossref+OpenAlex、原始 Git blob/review queue Git blob 与 SHA256、作者和书目信息、出版社在线日期与独立撰写的第二遍科学反证。

| 期刊 | DOI | 官方首次在线 | 方法学贡献 |
|---|---|---|---|
| Angew | 10.1002/anie.2368387 | 2026-09-04 | 镍/光氧化还原烯烃双碳官能团化；底物是酮衍生二氢喹唑啉酮，含不对称变体 |
| Organic Letters | 10.1021/acs.orglett.6c02295 | 2026-07-31 | 二价铁/氧化还原活性配体的醇脱氢酰胺化，明确使用甲氧胺盐酸盐氮源 |
| Organic Letters | 10.1021/acs.orglett.6c02476 | 2026-07-31 | 光催化氰基迁移、HAT及自由基环化；不是协同 Diels–Alder |
| JOC | 10.1021/acs.joc.6c00411 | 2026-07-27 | 机械化学硝酮–马来酰亚胺环加成，底物控制非对映选择性 |
| JOC | 10.1021/acs.joc.6c00523 | 2026-07-27 | B(C6F5)3 Lewis酸催化萘醌稠合多环含氮杂环的[4+2]制备 |

原创证据文件：
`audit/historical-reviewed/2026-10-16-q3-five-acs-wiley-original-preparations-two-pass.json`
回归测试：
`scripts/test-historical-q3-five-acs-wiley-originals-20261016.mjs`
历史学术核验、来源隔离、站点质量、目标期刊 Tampermonkey 和私有 PDF 等 **6 组 PR CI 成功**，PR #725 按准确 head SHA 合并至 main，commit
https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/f5b8be4976b3ffae20a2228889c5f8e03cb2d5b6。

## 正式发布与剩余阻断

合并后直接读取 main 发现学术批准232，正式历史文献122，账面差额110；原有两个来源日期冲突 pending 未改变。110 不是100%可发布数，须经独立政策排除和唯一北京时间08:00发布门禁。
main `public/toc-demand-live.json` 总文章1186、历史122，本批五篇 formal 0；没有 D1、正式目录、媒体、Today/Hot、微信公众号日更或晚间发布写入。2026-Q3 历史条目的捕获策略 `toc_only`、`new=false`、`addedDate=""`。
staging Q3 源队列（生成于2026-10-16 08:06 UTC）原地维持 11148 项待审核/日期核验（上一已确认11157减少9，未在此次 PR 后自动重新生成）；全历史不同 DOI 57266。27 个历史 source roots 的 OpenAlex 查询仍因 `openalex:http_401:api_key_missing` 阻断；这属于来源获取未完成，不可虚报全部期刊创刊以来审核完成。审核缓存不同步0。
严格不触发北京时间每日08:00以外的正式文献发布；下一次正常窗口2026-10-17 08:00 +08:00，仍须经过独立发布验收。

## 给用户的最终新增说明

本轮五篇已通过全部六组 CI 并合并为学术审核记录，不代表当日新增卡片。请以学术批准232、正式历史122、差额110作为最新两条独立口径；Q3 待审的 staging 统计须等其独立重算后才作进一步减量更新。OpenAlex 的27个401窗口保留失败状态，不将Crossref单源候选冒充全源完整。
