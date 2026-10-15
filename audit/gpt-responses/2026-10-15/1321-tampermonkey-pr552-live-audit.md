# 2026-10-15 北京时间 Tampermonkey PR #552 续作审计与回复存档

项目：Organic Synthesis Gallery / zhou526316-sys/organic-synthesis-gallery。对话：Tampermonkey PR552 续作与生产安装、媒体缺项、Pages CI 独立核验。本文件仅为只读证据对账、答复同步；不变更任何抓取代码、媒体、PDF、索引、发布日期或生产权限。

## 用户可见回复（内容归档）

### 已完成的 GitHub 核验
- PR [#552](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/552) 已合并，merge commit `58c9d00e10db221816fbfcadfb89156d8193573e`，头提交对应 29/29 项 CI 成功。包含 DOI 范围化库存查询、Nature 历史官方 TOC 来源核对、RSC DOI 溯源及跨批次诊断保存。
- PR [#660](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/660) 已合并，merge commit `3192c7045b94696d1c15c290abbb3024072403d7`。RSC 非 Silverchair 源仅检验一次经出版社和 DOI 核实的 listing，防止冗余 iframe 等待；Bridge 2.2.85、内嵌引擎 6.2.66，协议 6.2.20、controller 2.2.41 不变。
- 实时读取 `https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js` 与 `https://api.gczhouwld.com/gallery-vpn-bridge.user.js`，两者实际返回头均 `@version 2.2.85`、内嵌 `INSTALL_REVISION='6.2.66'`。不用卸载或清除 Tampermonkey 状态，只安装主/备其一。用户浏览器自身是否已切换至新版，仍待 `installRevision=6.2.66` 的真实诊断回执；旧上传日志为 6.2.65，不构成新版成功率证明。

### 旧批次抓取结果
诊断来源：[GitHub Actions #38678159778](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38678159778)，run 2026-10-14 03:06–07:10 UTC、scope 1,087。207 个缺项任务、访问 101 DOI、111 次尝试、43 篇完全补齐、2 篇库存已齐、162 篇未补齐；剩余需要 TOC 158、私人 PDF 6，存在交集。新保存 TOC 43、正文图暂存 2、全文证据 11。历史 820 篇只允许 toc_only，无需私人 PDF；PDF ready 255/missing 6/历史未知 820；库存核对无报错。比上轮 141 篇任务零篇补齐有进展，但两轮队列不同，不应相减估算净修复。
曝光的 100 条旧批次 RUN_DOI 中 ACS 61（37 成功/1 部分/23 失败）、RSC 29（6/7/16）、Science 9（0/0/9）、Elsevier 1（0/0/1），并非完整 162 条被阻塞 DOI 名册。

### 10 月 15 日当前正式全站 TOC 队列
来源：[TOC 刷新 #38683504830](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38683504830)，生成时间 `2026-10-15T04:50:01.849Z`，正式 DOI 总数 1151；真实无主视觉 93；有替代图仍缺官方 TOC 138；合计缺官方 TOC 231；standard 范围正文图缺项 294。二者不是旧批次 162 的同步状态，也不允许作直接加减。294 项全部关联 `mediaPolicy=standard`，不构成 7—9 月 `toc_only` 正文图补抓许可。
和旧批次 100 条 RUN_DOI 对账：43 条成功均不在当前官方 TOC 缺项队列，49 条失败中 22 条不在当前官方 TOC 缺项队列；8 条 partial 全部仍缺主视觉。因此旧日志失败不能自动转化为当前缺图，也不能直接重抓。

### 已证实的具体故障
- RSC 如 `10.1039/d6gc04087j`、`10.1039/d6gc04458a`、`10.1039/d6sc06571f`：当时未抓到可验证的官方 TOC（部分全文 evidence=stored），需要真实新版浏览器回执，而不是虚构官方图。
- ACS `10.1021/acs.orglett.6c02752` 上传阶段 Worker 返回 `409 official_toc_conflict_review_required`。源码 `cloudflare/worker/src/local-captures.js` 显示：对于 `toc_assets` 已存在可用对象、但新旧内容哈希不同的官方图，禁止盲目覆盖；返回 `localStored=true`、`productionTocStored=false`。该 DOI 已不在 10/15 官方 TOC 缺项队列，需核对已有图片的真实性、对应 DOI 与展示情况，不能关闭冲突保护。
- Pages [#38679069369](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38679069369) 的 34 个 frontend tests 中最后一项 `published DOI remains a single clickable non-wrapping identifier` 失败：`.doi .doi-link` 不可见。代码与 [PR #676](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/676) 表明，`src/user-ui/search-controller.ts` 的装饰逻辑将权威 DOI 锚点替换成 `.user-doi-link`；移动端 DOI 点击也可能被路由进摘要抽屉。这是独立前端故障，不是 Tampermonkey 或 PDF 失败。
- [正文图自动发布 #38684880871](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38684880871) 的 inspect 给出待处理 12 条图片/2 篇论文/目标 1 篇；publish/build 同样被前端测试阻断，deploy 跳过。暂存不代表生产可读。
- PR #676 在本轮末核实仍 open/未合并，关联 CI 正在进行；这属于独立前端修复，须获用户明确批准才可合并部署。本轮未修改代码、未合并 PR、未重新发布文献，08:00 是唯一正式新增槽，PDF 与历史媒体均保持原样。

### 下一步判定
1. 新版浏览器上传回执 `installRevision=6.2.66` 后，单独核查 RSC 一次扫描结果、Nature 官方来源与 ACS 冲突。失败也保留原始状态，不刷新旧凭据、不绕过 403。
2. 将当前 231 条官方 TOC 缺项与 PDF 6 条、新标准范围 294 条正文图缺项分别按 DOI 分类；旧批次 162 仍需完整 R2 清单才可逐一归因，公开日志只展示其子集。
3. 页面的 DOI 链接根因与 PR #676 已明确，等待明确前端范围批准及 CI 通过；不私自合并，不以解决页面问题名义重跑抓取或发布。

## 附录 A：231 条当前官方 TOC 缺项 DOI 清单
从版本 `public/toc-demand-live.json` 读取，按 DOI 排序；`有替代图`不应误作`完全无图`。

| DOI | 期刊 | addedDate | 媒体策略 | 当前 TOC 状态 |
|---|---|---|---|---|
| 10.1016/j.chempr.2026.103211 | Chem | 历史补录 | toc_only | 无主视觉 |
| 10.1016/j.chempr.2026.103215 | Chem | 历史补录 | toc_only | 无主视觉 |
| 10.1016/j.chempr.2026.103249 | Chem | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.5c03189 | JOC | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.6c00672 | JOC | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.6c00961 | JOC | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.6c01296 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01352 | JOC | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.6c01479 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01552 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01643 | JOC | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.6c01737 | JOC | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.joc.6c01740 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01777 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01813 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01847 | JOC | 2026-10-02 | standard | 无主视觉 |
| 10.1021/acs.joc.6c01857 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c02023 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c02068 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.joc.6c02150 | JOC | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c02479 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c02967 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c03173 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c03207 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c03221 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c03282 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c03345 | Organic Letters | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acs.orglett.6c03795 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c03859 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c03862 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c03872 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c03912 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c04101 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c04116 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c04162 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acs.orglett.6c04271 | Organic Letters | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acscatal.6c02607 | ACS Catalysis | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acscatal.6c03499 | ACS Catalysis | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acscatal.6c03761 | ACS Catalysis | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acscatal.6c04538 | ACS Catalysis | 历史补录 | toc_only | 无主视觉 |
| 10.1021/acscatal.6c06300 | ACS Catalysis | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acscatal.6c06572 | ACS Catalysis | 2026-10-15 | standard | 无主视觉 |
| 10.1021/acscatal.6c06668 | ACS Catalysis | 2026-10-15 | standard | 无主视觉 |
| 10.1021/jacs.6c02262 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c04476 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c09478 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c09649 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c09845 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c09948 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c10750 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c11377 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c11520 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1021/jacs.6c12029 | JACS | 历史补录 | toc_only | 无主视觉 |
| 10.1038/s41467-026-74319-y | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-74378-1 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75059-9 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75280-6 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75338-5 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75432-8 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75467-x | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75499-3 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75633-1 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75644-y | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75768-1 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75769-0 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75774-3 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75854-4 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75858-0 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75878-w | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75906-9 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-75992-9 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76036-y | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76124-z | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76125-y | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76150-x | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76222-y | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76235-7 | Nature Communications | 2026-09-18 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76238-4 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76282-0 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76290-0 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76455-x | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76655-5 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76749-0 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76869-7 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-76924-3 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77092-0 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77184-x | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77185-w | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77228-2 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77336-z | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77403-5 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77436-w | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77437-9 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77468-2 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77482-4 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77633-7 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77715-6 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77739-y | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77740-5 | Nature Communications | 2026-10-03 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77771-y | Nature Communications | 2026-09-29 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77774-9 | Nature Communications | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77959-2 | Nature Communications | 2026-10-06 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77981-4 | Nature Communications | 2026-09-22 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-77983-2 | Nature Communications | 2026-09-25 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78066-y | Nature Communications | 2026-09-26 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78220-6 | Nature Communications | 2026-10-06 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78226-0 | Nature Communications | 2026-10-04 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78282-6 | Nature Communications | 2026-10-07 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78297-z | Nature Communications | 2026-10-06 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78405-z | Nature Communications | 2026-10-10 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78455-3 | Nature Communications | 2026-10-09 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78459-z | Nature Communications | 2026-10-08 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78486-w | Nature Communications | 2026-10-10 | standard | 有替代图但缺官方TOC |
| 10.1038/s41467-026-78511-y | Nature Communications | 2026-10-10 | standard | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02195-6 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02204-8 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02206-6 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02212-8 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02213-7 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02214-6 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02224-4 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02227-1 | Nature Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1038/s41557-026-02228-0 | Nature Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1038/s41557-026-02231-5 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02232-4 | Nature Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1038/s41557-026-02233-3 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02237-z | Nature Chemistry | 2026-10-06 | standard | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02238-y | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02242-2 | Nature Chemistry | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02247-x | Nature Chemistry | 2026-09-24 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02258-8 | Nature Chemistry | 2026-09-22 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41557-026-02263-x | Nature Chemistry | 2026-10-08 | standard | 有替代图但缺官方TOC |
| 10.1038/s41586-026-10897-7 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-10930-9 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-10931-8 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-10933-6 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-10991-w | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-11006-4 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-11009-1 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-11043-z | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-11091-5 | Nature | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-11108-z | Nature | 2026-10-01 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41586-026-11169-0 | Nature | 2026-09-24 | toc_only | 无主视觉 |
| 10.1038/s41586-026-11242-8 | Nature | 2026-10-15 | standard | 无主视觉 |
| 10.1038/s41929-026-01557-0 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01560-5 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01566-z | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01573-0 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01576-x | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01578-9 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01579-8 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01587-8 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01589-6 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01593-w | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01600-0 | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01602-y | Nature Catalysis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s41929-026-01616-6 | Nature Catalysis | 2026-09-30 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01096-3 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01106-4 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01107-3 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01116-2 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01118-0 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01121-5 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01127-z | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01128-y | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01140-2 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01143-z | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01144-y | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01147-9 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01149-7 | Nature Synthesis | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01155-9 | Nature Synthesis | 2026-09-22 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01161-x | Nature Synthesis | 2026-09-25 | toc_only | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01162-w | Nature Synthesis | 2026-10-03 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01168-4 | Nature Synthesis | 2026-10-02 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01171-9 | Nature Synthesis | 2026-10-15 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01172-8 | Nature Synthesis | 2026-10-14 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01173-7 | Nature Synthesis | 2026-10-13 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01176-4 | Nature Synthesis | 2026-10-13 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01183-5 | Nature Synthesis | 2026-10-09 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01184-4 | Nature Synthesis | 2026-10-14 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01189-z | Nature Synthesis | 2026-10-13 | standard | 有替代图但缺官方TOC |
| 10.1038/s44160-026-01193-3 | Nature Synthesis | 2026-10-15 | standard | 有替代图但缺官方TOC |
| 10.1039/d6gc01864e | Green Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6gc02631a | Green Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6gc02989b | Green Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6gc03080g | Green Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6gc03161g | Green Chemistry | 2026-10-06 | standard | 无主视觉 |
| 10.1039/d6gc03534e | Green Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6gc03989h | Green Chemistry | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6gc04087j | Green Chemistry | 2026-10-07 | standard | 无主视觉 |
| 10.1039/d6gc04458a | Green Chemistry | 2026-10-08 | standard | 无主视觉 |
| 10.1039/d6gc04772f | Green Chemistry | 2026-10-07 | standard | 无主视觉 |
| 10.1039/d6gc05783g | Green Chemistry | 2026-10-08 | standard | 无主视觉 |
| 10.1039/d6sc02777f | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc03717h | Chemical Science | 2026-10-08 | standard | 无主视觉 |
| 10.1039/d6sc03931f | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc03998g | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc04786f | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc04861g | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc05207j | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc05410b | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc05589c | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc05630j | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc05761f | Chemical Science | 2026-10-08 | standard | 无主视觉 |
| 10.1039/d6sc05829a | Chemical Science | 2026-10-07 | standard | 无主视觉 |
| 10.1039/d6sc06200h | Chemical Science | 历史补录 | toc_only | 无主视觉 |
| 10.1039/d6sc06246f | Chemical Science | 2026-10-05 | standard | 无主视觉 |
| 10.1039/d6sc06374h | Chemical Science | 2026-10-08 | standard | 无主视觉 |
| 10.1039/d6sc06407h | Chemical Science | 2026-10-09 | standard | 无主视觉 |
| 10.1039/d6sc06421c | Chemical Science | 2026-10-06 | standard | 无主视觉 |
| 10.1039/d6sc06571f | Chemical Science | 2026-10-14 | standard | 无主视觉 |
| 10.1039/d6sc06573b | Chemical Science | 2026-10-07 | standard | 无主视觉 |
| 10.1039/d6sc06879k | Chemical Science | 2026-10-11 | standard | 无主视觉 |
| 10.1126/sciadv.aed4187 | Science Advances | 2026-10-08 | standard | 有替代图但缺官方TOC |
| 10.1126/sciadv.aeg0999 | Science Advances | 历史补录 | toc_only | 无主视觉 |
| 10.1126/sciadv.aeg4594 | Science Advances | 2026-09-26 | toc_only | 有替代图但缺官方TOC |
| 10.1126/sciadv.aeh2073 | Science Advances | 历史补录 | toc_only | 无主视觉 |
| 10.1126/sciadv.aeh8194 | Science Advances | 历史补录 | toc_only | 无主视觉 |
| 10.1126/sciadv.aej5227 | Science Advances | 2026-10-02 | standard | 有替代图但缺官方TOC |
| 10.1126/science.aec6298 | Science | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1126/science.aef0766 | Science | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.1126/science.aef3001 | Science | 2026-10-09 | standard | 有替代图但缺官方TOC |
| 10.1126/science.aef3511 | Science | 2026-09-25 | toc_only | 有替代图但缺官方TOC |
| 10.1126/science.aef5175 | Science | 2026-10-02 | standard | 有替代图但缺官方TOC |
| 10.1126/science.aeg5583 | Science | 2026-10-02 | standard | 有替代图但缺官方TOC |
| 10.1126/science.aeh7895 | Science | 2026-09-25 | toc_only | 有替代图但缺官方TOC |
| 10.1126/science.aej0194 | Science | 历史补录 | toc_only | 有替代图但缺官方TOC |
| 10.31635/ccschem.026.202607612 | CCS Chemistry | 2026-10-11 | standard | 有替代图但缺官方TOC |
| 10.31635/ccschem.026.202608090 | CCS Chemistry | 2026-10-11 | standard | 有替代图但缺官方TOC |
| 10.31635/ccschem.026.202608252 | CCS Chemistry | 2026-10-13 | standard | 有替代图但缺官方TOC |
| 10.31635/ccschem.026.202608538 | CCS Chemistry | 2026-10-15 | standard | 无主视觉 |

## 附录 B：294 条当前 standard 正文图缺项
这不是历史 toc_only 新正文图抓取授权；存在与 TOC 缺项交集。

| DOI | 期刊 | addedDate | 媒体策略 | 队列记录图数 |
|---|---|---|---|---|
| 10.1002/anie.1388948 | Angew | 2026-10-06 | standard | 0 |
| 10.1002/anie.1983055 | Angew | 2026-10-13 | standard | 0 |
| 10.1002/anie.3010868 | Angew | 2026-10-04 | standard | 0 |
| 10.1002/anie.3193418 | Angew | 2026-10-02 | standard | 0 |
| 10.1002/anie.3306470 | Angew | 2026-10-10 | standard | 0 |
| 10.1002/anie.3699223 | Angew | 2026-10-07 | standard | 0 |
| 10.1002/anie.3744091 | Angew | 2026-10-02 | standard | 0 |
| 10.1002/anie.3751201 | Angew | 2026-10-07 | standard | 0 |
| 10.1002/anie.3998761 | Angew | 2026-10-05 | standard | 0 |
| 10.1002/anie.4335022 | Angew | 2026-10-09 | standard | 0 |
| 10.1002/anie.5080799 | Angew | 2026-10-07 | standard | 0 |
| 10.1002/anie.5624001 | Angew | 2026-10-09 | standard | 0 |
| 10.1002/anie.5679433 | Angew | 2026-10-05 | standard | 0 |
| 10.1002/anie.6159381 | Angew | 2026-10-02 | standard | 0 |
| 10.1002/anie.6256116 | Angew | 2026-10-05 | standard | 0 |
| 10.1002/anie.6516584 | Angew | 2026-10-11 | standard | 0 |
| 10.1002/anie.7133146 | Angew | 2026-10-11 | standard | 0 |
| 10.1002/anie.7996981 | Angew | 2026-10-02 | standard | 0 |
| 10.1002/anie.8598826 | Angew | 2026-10-05 | standard | 0 |
| 10.1002/anie.9140489 | Angew | 2026-10-05 | standard | 0 |
| 10.1016/j.chempr.2026.103008 | Chem | 2026-10-09 | standard | 0 |
| 10.1016/j.chempr.2026.103043 | Chem | 2026-10-09 | standard | 0 |
| 10.1016/j.chempr.2026.103076 | Chem | 2026-10-11 | standard | 0 |
| 10.1016/j.chempr.2026.103282 | Chem | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c00926 | JOC | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c01012 | JOC | 2026-10-09 | standard | 0 |
| 10.1021/acs.joc.6c01017 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01138 | JOC | 2026-10-03 | standard | 0 |
| 10.1021/acs.joc.6c01159 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01167 | JOC | 2026-10-10 | standard | 0 |
| 10.1021/acs.joc.6c01172 | JOC | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c01221 | JOC | 2026-10-09 | standard | 0 |
| 10.1021/acs.joc.6c01282 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01296 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01349 | JOC | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c01409 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01435 | JOC | 2026-10-08 | standard | 0 |
| 10.1021/acs.joc.6c01479 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01481 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01491 | JOC | 2026-10-11 | standard | 0 |
| 10.1021/acs.joc.6c01500 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01504 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01506 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01552 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01554 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01558 | JOC | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c01561 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01570 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01579 | JOC | 2026-10-08 | standard | 0 |
| 10.1021/acs.joc.6c01591 | JOC | 2026-10-10 | standard | 0 |
| 10.1021/acs.joc.6c01609 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01630 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01636 | JOC | 2026-10-09 | standard | 0 |
| 10.1021/acs.joc.6c01656 | JOC | 2026-10-10 | standard | 0 |
| 10.1021/acs.joc.6c01674 | JOC | 2026-10-03 | standard | 0 |
| 10.1021/acs.joc.6c01675 | JOC | 2026-10-10 | standard | 0 |
| 10.1021/acs.joc.6c01708 | JOC | 2026-10-08 | standard | 0 |
| 10.1021/acs.joc.6c01717 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01732 | JOC | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c01736 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01740 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01760 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01769 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01777 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01792 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01796 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01813 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01847 | JOC | 2026-10-02 | standard | 0 |
| 10.1021/acs.joc.6c01857 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c01869 | JOC | 2026-10-06 | standard | 0 |
| 10.1021/acs.joc.6c01870 | JOC | 2026-10-14 | standard | 0 |
| 10.1021/acs.joc.6c01871 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01921 | JOC | 2026-10-10 | standard | 0 |
| 10.1021/acs.joc.6c01927 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c01961 | JOC | 2026-10-09 | standard | 0 |
| 10.1021/acs.joc.6c01979 | JOC | 2026-10-10 | standard | 0 |
| 10.1021/acs.joc.6c02017 | JOC | 2026-10-12 | standard | 0 |
| 10.1021/acs.joc.6c02023 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c02034 | JOC | 2026-10-07 | standard | 0 |
| 10.1021/acs.joc.6c02068 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.joc.6c02116 | JOC | 2026-10-08 | standard | 0 |
| 10.1021/acs.joc.6c02150 | JOC | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c02255 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c02908 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03200 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c03330 | Organic Letters | 2026-10-09 | standard | 0 |
| 10.1021/acs.orglett.6c03404 | Organic Letters | 2026-10-07 | standard | 0 |
| 10.1021/acs.orglett.6c03409 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03422 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03432 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03470 | Organic Letters | 2026-10-11 | standard | 0 |
| 10.1021/acs.orglett.6c03480 | Organic Letters | 2026-10-11 | standard | 0 |
| 10.1021/acs.orglett.6c03558 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03572 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03584 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03611 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03617 | Organic Letters | 2026-10-13 | standard | 0 |
| 10.1021/acs.orglett.6c03635 | Organic Letters | 2026-10-11 | standard | 0 |
| 10.1021/acs.orglett.6c03637 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c03640 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03663 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03692 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c03708 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03711 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03719 | Organic Letters | 2026-10-09 | standard | 0 |
| 10.1021/acs.orglett.6c03721 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03725 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03748 | Organic Letters | 2026-10-04 | standard | 0 |
| 10.1021/acs.orglett.6c03749 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03763 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03780 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c03795 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c03796 | Organic Letters | 2026-10-09 | standard | 0 |
| 10.1021/acs.orglett.6c03805 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03808 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03818 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03819 | Organic Letters | 2026-10-11 | standard | 0 |
| 10.1021/acs.orglett.6c03823 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03828 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03829 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03858 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03859 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c03861 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03862 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c03868 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03872 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c03874 | Organic Letters | 2026-10-07 | standard | 0 |
| 10.1021/acs.orglett.6c03881 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03882 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03886 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03893 | Organic Letters | 2026-10-13 | standard | 0 |
| 10.1021/acs.orglett.6c03894 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03899 | Organic Letters | 2026-10-09 | standard | 0 |
| 10.1021/acs.orglett.6c03905 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03907 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03908 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03912 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c03915 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03922 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c03929 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03936 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03955 | Organic Letters | 2026-10-08 | standard | 0 |
| 10.1021/acs.orglett.6c03956 | Organic Letters | 2026-10-02 | standard | 0 |
| 10.1021/acs.orglett.6c03963 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03964 | Organic Letters | 2026-10-10 | standard | 0 |
| 10.1021/acs.orglett.6c03971 | Organic Letters | 2026-10-12 | standard | 0 |
| 10.1021/acs.orglett.6c03973 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c03980 | Organic Letters | 2026-10-03 | standard | 0 |
| 10.1021/acs.orglett.6c03996 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c03999 | Organic Letters | 2026-10-14 | standard | 0 |
| 10.1021/acs.orglett.6c04002 | Organic Letters | 2026-10-07 | standard | 0 |
| 10.1021/acs.orglett.6c04009 | Organic Letters | 2026-10-11 | standard | 0 |
| 10.1021/acs.orglett.6c04010 | Organic Letters | 2026-10-12 | standard | 0 |
| 10.1021/acs.orglett.6c04027 | Organic Letters | 2026-10-13 | standard | 0 |
| 10.1021/acs.orglett.6c04036 | Organic Letters | 2026-10-09 | standard | 0 |
| 10.1021/acs.orglett.6c04038 | Organic Letters | 2026-10-13 | standard | 0 |
| 10.1021/acs.orglett.6c04041 | Organic Letters | 2026-10-09 | standard | 0 |
| 10.1021/acs.orglett.6c04044 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c04062 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c04085 | Organic Letters | 2026-10-11 | standard | 0 |
| 10.1021/acs.orglett.6c04095 | Organic Letters | 2026-10-12 | standard | 0 |
| 10.1021/acs.orglett.6c04101 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c04116 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c04136 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c04162 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acs.orglett.6c04244 | Organic Letters | 2026-10-06 | standard | 0 |
| 10.1021/acs.orglett.6c04271 | Organic Letters | 2026-10-15 | standard | 0 |
| 10.1021/acscatal.6c04883 | ACS Catalysis | 2026-10-03 | standard | 0 |
| 10.1021/acscatal.6c04942 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c04987 | ACS Catalysis | 2026-10-08 | standard | 0 |
| 10.1021/acscatal.6c05123 | ACS Catalysis | 2026-10-13 | standard | 0 |
| 10.1021/acscatal.6c05141 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c05151 | ACS Catalysis | 2026-10-03 | standard | 0 |
| 10.1021/acscatal.6c05658 | ACS Catalysis | 2026-10-08 | standard | 0 |
| 10.1021/acscatal.6c05776 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c05786 | ACS Catalysis | 2026-10-14 | standard | 0 |
| 10.1021/acscatal.6c05806 | ACS Catalysis | 2026-10-09 | standard | 0 |
| 10.1021/acscatal.6c06046 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c06048 | ACS Catalysis | 2026-10-12 | standard | 0 |
| 10.1021/acscatal.6c06050 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c06183 | ACS Catalysis | 2026-10-08 | standard | 0 |
| 10.1021/acscatal.6c06279 | ACS Catalysis | 2026-10-08 | standard | 0 |
| 10.1021/acscatal.6c06300 | ACS Catalysis | 2026-10-15 | standard | 0 |
| 10.1021/acscatal.6c06318 | ACS Catalysis | 2026-10-06 | standard | 0 |
| 10.1021/acscatal.6c06476 | ACS Catalysis | 2026-10-09 | standard | 0 |
| 10.1021/acscatal.6c06481 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c06572 | ACS Catalysis | 2026-10-15 | standard | 0 |
| 10.1021/acscatal.6c06578 | ACS Catalysis | 2026-10-11 | standard | 0 |
| 10.1021/acscatal.6c06668 | ACS Catalysis | 2026-10-15 | standard | 0 |
| 10.1021/acscatal.6c06764 | ACS Catalysis | 2026-10-07 | standard | 0 |
| 10.1021/acscatal.6c07172 | ACS Catalysis | 2026-10-10 | standard | 0 |
| 10.1021/jacs.6c07839 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c08713 | JACS | 2026-10-15 | standard | 0 |
| 10.1021/jacs.6c10578 | JACS | 2026-10-10 | standard | 0 |
| 10.1021/jacs.6c11144 | JACS | 2026-10-07 | standard | 0 |
| 10.1021/jacs.6c11855 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c12007 | JACS | 2026-10-11 | standard | 0 |
| 10.1021/jacs.6c12059 | JACS | 2026-10-02 | standard | 0 |
| 10.1021/jacs.6c13337 | JACS | 2026-10-07 | standard | 0 |
| 10.1021/jacs.6c13660 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c13713 | JACS | 2026-10-02 | standard | 0 |
| 10.1021/jacs.6c13787 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c14241 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c14243 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c14452 | JACS | 2026-10-10 | standard | 0 |
| 10.1021/jacs.6c14748 | JACS | 2026-10-08 | standard | 0 |
| 10.1021/jacs.6c14811 | JACS | 2026-10-05 | standard | 0 |
| 10.1021/jacs.6c14950 | JACS | 2026-10-10 | standard | 0 |
| 10.1021/jacs.6c15216 | JACS | 2026-10-13 | standard | 0 |
| 10.1021/jacs.6c15290 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c15392 | JACS | 2026-10-14 | standard | 0 |
| 10.1021/jacs.6c15884 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c15886 | JACS | 2026-10-11 | standard | 0 |
| 10.1021/jacs.6c15980 | JACS | 2026-10-02 | standard | 0 |
| 10.1021/jacs.6c16103 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c16251 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c16285 | JACS | 2026-10-03 | standard | 0 |
| 10.1021/jacs.6c16767 | JACS | 2026-10-10 | standard | 0 |
| 10.1021/jacs.6c16809 | JACS | 2026-10-06 | standard | 0 |
| 10.1021/jacs.6c17126 | JACS | 2026-10-13 | standard | 0 |
| 10.1021/jacs.6c17350 | JACS | 2026-10-02 | standard | 0 |
| 10.1021/jacs.6c17360 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c17387 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c17393 | JACS | 2026-10-09 | standard | 0 |
| 10.1021/jacs.6c17448 | JACS | 2026-10-10 | standard | 0 |
| 10.1021/jacs.6c17662 | JACS | 2026-10-14 | standard | 0 |
| 10.1038/s41467-026-77740-5 | Nature Communications | 2026-10-03 | standard | 0 |
| 10.1038/s41467-026-77959-2 | Nature Communications | 2026-10-06 | standard | 0 |
| 10.1038/s41467-026-78220-6 | Nature Communications | 2026-10-06 | standard | 0 |
| 10.1038/s41467-026-78226-0 | Nature Communications | 2026-10-04 | standard | 0 |
| 10.1038/s41467-026-78282-6 | Nature Communications | 2026-10-07 | standard | 0 |
| 10.1038/s41467-026-78297-z | Nature Communications | 2026-10-06 | standard | 0 |
| 10.1038/s41467-026-78405-z | Nature Communications | 2026-10-10 | standard | 0 |
| 10.1038/s41467-026-78455-3 | Nature Communications | 2026-10-09 | standard | 0 |
| 10.1038/s41467-026-78459-z | Nature Communications | 2026-10-08 | standard | 0 |
| 10.1038/s41467-026-78486-w | Nature Communications | 2026-10-10 | standard | 0 |
| 10.1038/s41467-026-78511-y | Nature Communications | 2026-10-10 | standard | 0 |
| 10.1038/s41557-026-02237-z | Nature Chemistry | 2026-10-06 | standard | 0 |
| 10.1038/s41557-026-02263-x | Nature Chemistry | 2026-10-08 | standard | 0 |
| 10.1038/s41586-026-11242-8 | Nature | 2026-10-15 | standard | 0 |
| 10.1038/s44160-026-01162-w | Nature Synthesis | 2026-10-03 | standard | 0 |
| 10.1038/s44160-026-01168-4 | Nature Synthesis | 2026-10-02 | standard | 0 |
| 10.1038/s44160-026-01171-9 | Nature Synthesis | 2026-10-15 | standard | 0 |
| 10.1038/s44160-026-01172-8 | Nature Synthesis | 2026-10-14 | standard | 0 |
| 10.1038/s44160-026-01173-7 | Nature Synthesis | 2026-10-13 | standard | 0 |
| 10.1038/s44160-026-01176-4 | Nature Synthesis | 2026-10-13 | standard | 0 |
| 10.1038/s44160-026-01183-5 | Nature Synthesis | 2026-10-09 | standard | 0 |
| 10.1038/s44160-026-01184-4 | Nature Synthesis | 2026-10-14 | standard | 0 |
| 10.1038/s44160-026-01189-z | Nature Synthesis | 2026-10-13 | standard | 0 |
| 10.1038/s44160-026-01193-3 | Nature Synthesis | 2026-10-15 | standard | 0 |
| 10.1039/d6gc03161g | Green Chemistry | 2026-10-06 | standard | 0 |
| 10.1039/d6gc03748h | Green Chemistry | 2026-10-09 | standard | 0 |
| 10.1039/d6gc03816f | Green Chemistry | 2026-10-05 | standard | 0 |
| 10.1039/d6gc04087j | Green Chemistry | 2026-10-07 | standard | 0 |
| 10.1039/d6gc04421b | Green Chemistry | 2026-10-07 | standard | 0 |
| 10.1039/d6gc04458a | Green Chemistry | 2026-10-08 | standard | 0 |
| 10.1039/d6gc04471a | Green Chemistry | 2026-10-07 | standard | 0 |
| 10.1039/d6gc04772f | Green Chemistry | 2026-10-07 | standard | 0 |
| 10.1039/d6gc05783g | Green Chemistry | 2026-10-08 | standard | 0 |
| 10.1039/d6sc03717h | Chemical Science | 2026-10-08 | standard | 0 |
| 10.1039/d6sc05041g | Chemical Science | 2026-10-08 | standard | 0 |
| 10.1039/d6sc05561c | Chemical Science | 2026-10-07 | standard | 0 |
| 10.1039/d6sc05761f | Chemical Science | 2026-10-08 | standard | 0 |
| 10.1039/d6sc05829a | Chemical Science | 2026-10-07 | standard | 0 |
| 10.1039/d6sc05973b | Chemical Science | 2026-10-05 | standard | 0 |
| 10.1039/d6sc06246f | Chemical Science | 2026-10-05 | standard | 0 |
| 10.1039/d6sc06374h | Chemical Science | 2026-10-08 | standard | 0 |
| 10.1039/d6sc06407h | Chemical Science | 2026-10-09 | standard | 0 |
| 10.1039/d6sc06421c | Chemical Science | 2026-10-06 | standard | 0 |
| 10.1039/d6sc06571f | Chemical Science | 2026-10-14 | standard | 0 |
| 10.1039/d6sc06573b | Chemical Science | 2026-10-07 | standard | 0 |
| 10.1039/d6sc06874j | Chemical Science | 2026-10-05 | standard | 0 |
| 10.1039/d6sc06879k | Chemical Science | 2026-10-11 | standard | 0 |
| 10.1126/sciadv.aed4187 | Science Advances | 2026-10-08 | standard | 0 |
| 10.1126/sciadv.aej5227 | Science Advances | 2026-10-02 | standard | 0 |
| 10.1126/science.aef3001 | Science | 2026-10-09 | standard | 0 |
| 10.1126/science.aef5175 | Science | 2026-10-02 | standard | 0 |
| 10.1126/science.aeg5583 | Science | 2026-10-02 | standard | 0 |
| 10.31635/ccschem.026.202507094 | CCS Chemistry | 2026-10-01 | standard | 0 |
| 10.31635/ccschem.026.202507282 | CCS Chemistry | 2026-10-01 | standard | 0 |
| 10.31635/ccschem.026.202607330 | CCS Chemistry | 2026-10-01 | standard | 0 |
| 10.31635/ccschem.026.202607499 | CCS Chemistry | 2026-10-01 | standard | 0 |
| 10.31635/ccschem.026.202607590 | CCS Chemistry | 2026-10-11 | standard | 0 |
| 10.31635/ccschem.026.202607611 | CCS Chemistry | 2026-10-01 | standard | 0 |
| 10.31635/ccschem.026.202607612 | CCS Chemistry | 2026-10-11 | standard | 0 |
| 10.31635/ccschem.026.202607659 | CCS Chemistry | 2026-10-04 | standard | 0 |
| 10.31635/ccschem.026.202607682 | CCS Chemistry | 2026-10-01 | standard | 0 |
| 10.31635/ccschem.026.202608019 | CCS Chemistry | 2026-10-11 | standard | 0 |
| 10.31635/ccschem.026.202608090 | CCS Chemistry | 2026-10-11 | standard | 0 |
| 10.31635/ccschem.026.202608189 | CCS Chemistry | 2026-10-11 | standard | 0 |
| 10.31635/ccschem.026.202608252 | CCS Chemistry | 2026-10-13 | standard | 0 |
| 10.31635/ccschem.026.202608392 | CCS Chemistry | 2026-10-04 | standard | 0 |
| 10.31635/ccschem.026.202608407 | CCS Chemistry | 2026-10-04 | standard | 0 |
| 10.31635/ccschem.026.202608538 | CCS Chemistry | 2026-10-15 | standard | 0 |

## 附录 C：100 条旧批次曝光 RUN_DOI 和 10/15 队列交叉核验
`旧批次结果`来自 `installRevision=6.2.65`，其他状态来自当日媒体队列。它不是旧批次全部 162 条 blocked DOI 列表，且不是运行中的新版结果。

| DOI | 旧批次结果 | 旧 TOC 结果 | 旧全文证据 | 旧 PDF 结果 | 当前官方 TOC | 当前正文图 |
|---|---|---|---|---|---|---|
| 10.1016/j.chempr.2026.103282 | failed | already_available | not_requested | not_found | 不在TOC缺项 | 有正文图缺项 |
| 10.1021/acs.joc.5c03271 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c00587 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c00772 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c00860 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01089 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01104 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01163 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01369 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01375 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01478 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01571 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01578 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.joc.6c01847 | partial | not_found | stored | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1021/acs.orglett.6c02216 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02216 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02234 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02234 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02319 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02319 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02329 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02329 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02431 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02431 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02441 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02459 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02459 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02473 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02473 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02567 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02691 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02752 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02752 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02796 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02892 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c02929 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c03173 | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c03201 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acs.orglett.6c03279 | failed | not_found | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c02698 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c02761 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c02761 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c03020 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c03020 | failed | failed | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c03124 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c03374 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c03737 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c04393 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c04411 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c04677 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c04804 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c05226 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/acscatal.6c05275 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c02262 | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1021/jacs.6c05233 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c06565 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c08244 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c08775 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c08998 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c09931 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c10775 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1021/jacs.6c11788 | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6gc01864e | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6gc02423h | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6gc02631a | failed | failed | not_requested | not_requested | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6gc02989b | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6gc03080g | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6gc03161g | partial | not_found | stored | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1039/d6gc03534e | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6gc03989h | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6gc04087j | partial | not_found | not_requested | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1039/d6gc04772f | partial | not_found | not_requested | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1039/d6sc02716d | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6sc02777f | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc03931f | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc03998g | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc04572c | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6sc04627d | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6sc04786f | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc04861g | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc04876e | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6sc05170g | success | stored | not_requested |  | 不在TOC缺项 | 未列正文图缺项 |
| 10.1039/d6sc05207j | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc05410b | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc05589c | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc05630j | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc05829a | partial | not_found | stored | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1039/d6sc06200h | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1039/d6sc06246f | partial | not_found | stored | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1039/d6sc06421c | partial | not_found | not_requested | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1039/d6sc06573b | partial | not_found | stored | already_stored | 缺主视觉 | 有正文图缺项 |
| 10.1126/sciadv.aeg0999 | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1126/sciadv.aeg4594 | failed | not_found | not_requested |  | 缺官方TOC | 未列正文图缺项 |
| 10.1126/sciadv.aeh2073 | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1126/sciadv.aeh8194 | failed | not_found | not_requested |  | 缺主视觉 | 未列正文图缺项 |
| 10.1126/science.aec6298 | failed | not_found | not_requested |  | 缺官方TOC | 未列正文图缺项 |
| 10.1126/science.aef0766 | failed | not_found | not_requested |  | 缺官方TOC | 未列正文图缺项 |
| 10.1126/science.aef3511 | failed | not_found | not_requested |  | 缺官方TOC | 未列正文图缺项 |
| 10.1126/science.aeh7895 | failed | not_found | not_requested |  | 缺官方TOC | 未列正文图缺项 |
| 10.1126/science.aej0194 | failed | not_found | not_requested |  | 缺官方TOC | 未列正文图缺项 |
