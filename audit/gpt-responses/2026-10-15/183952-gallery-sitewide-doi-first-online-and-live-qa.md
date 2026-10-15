# Gallery 全站 DOI 链接及首次在线日期修复：本聊天完整回报

北京时间：2026-10-15 18:39:52+08:00
项目：抓取有机合成文献并持续更新网页
上下文：用户2026-10-14/15截图的 JOC、Chemical Science、Nature 日期待核实、DOI Error/断行、Nature 主视觉占位；用户多次要求继续、全站处理而非逐篇补丁。

## 本次用户可见报告（含分阶段更新）

### 第一阶段：根因及执行
已查明，这不是某一篇文献的孤立问题，而是三处相互关联的故障：

1. **DOI 链接：** 卡片和用户交互模块可能重复改写跳转地址，导致点击 DOI 或“打开原文”时未按预期进入出版社文章。
2. **发表日期：** 一些论文只有 Crossref 登记日期，没有经过出版社首次在线日期核验。此前的逻辑会把这两类日期混在一起，因此出现“日期待核实”或日期不准确。
3. **部署一致性：** 10 月 15 日已发布的文献数据曾出现发布后修改，造成文件哈希与正式发布记录不一致，影响后续修复部署。

已找到覆盖全站 **1,151 篇文献**的修复 [PR #688](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/688)，同时处理 DOI、Nature/JOC/RSC 日期和受保护数据一致性。

### 第二阶段：PR CI、具体 Nature 证据
PR #688 已合并到 `main`，全部 **30 项 CI 检查通过**，包括重试后通过的 Chromium 分页测试（无需放宽或取消测试）。

截图中的 Nature 论文由出版社官方页面 https://www.nature.com/articles/s41586-026-11242-8 核实：
- DOI: `10.1038/s41586-026-11242-8`
- 首次在线: **2026-10-14**
- 作者: Hayato Fujimoto; Masayuki Mizutani; Kazuya Imachi; Teruki Nishioka; Reona Ikeda; Mamoru Tobisu。

修复为 DOI+标题+期刊+入库日绑定的只读展示校正，不直接篡改冻结的 08:00 文献原始字节。五篇 JOC 日期分别有 ACS 10 月 15 日正式发表证据，十篇 Chemical Science/Green Chemistry 由 RSC 官方 First published 确定（原始证据在 audit/publisher-date-evidence/）。Nature DOI 路由按其官方文章编号打开 nature.com，并且卡片和用户交互层共享同一 publisherArticleHref，避免二次 DOM 装饰重新破坏 DOI 链接。其他未知 DOI 不被虚构为官方页面。

### 第三阶段：全库回归及日期队列
[完整 DOI/date CI #38718802848](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38718802848) 成功；完整 1,151 篇 DOI 格式、受保护文件 SHA、链接生成、日期显示逐项核验，非临时日期 1,151、待核实展示 0、非法原始日期 0。这个结果不等于对 1,151 篇每篇逐一核验了官方首次发表日。

[出版社日期复核 #38718803234](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38718803234) 成功把 `audit/publisher-date-evidence/pending-latest.json` 更新为 1,151 篇、unresolvedPublisherFirstOnlineDates=0、issues=[]。正式 08:00 文献目录未增删，`public/rolling-supplement.json` 恢复冻结 blob `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`。

### 第四阶段：实际网站上线
[Pages 部署 #38718803061](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38718803061) **success**；文献授权、所有构建与浏览器验收、部署全通过。正式域名 `https://gallery.gczhouwld.com/` 和 Pages 对照入口的 live delivery verifier 返回 productionCards=1151，markerBlobSha=`cd56d8ecbda84df374603d1e8b455160ab8921a5`、datasetSha256=`4bde3d419437fe380888663a2e62cce24d8de273c93b44d8d19583ae8e7bcf99`、chineseTitlesVerified=true。

`audit/literature-update-state.json` 已回写 lastWebsiteSync.verification.pagesRun=38718803061、galleryDois=1151，状态 synced_with_pending，原有未审核 backlog 不丢失。

### 第五阶段：实际检索索引及线上浏览器
[目录索引同步 #38720754831](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38720754831) **success**。D1 活动索引 1,151/1,151 导入，rowParity checked 1151、mismatched=0；searchParity 40 查询、mismatched=0；viewParity 13 种场景、mismatched=0；摘要拓展完成且 Crossref/OpenAlex 请求错误各为 0。架构/catalog.mjs 内部使用与卡片一致的 correctedPublisherDateForDisplay，不会出现展示日期修好了但搜索索引仍保留旧日期的问题。

[线上检索与浏览器验收 #38721475965](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38721475965) **success**；公共接口和桌面 1280 px、手机 390 px 两组真实浏览器验收均成功。

### 边界及未完成的独立问题
- Nature `10.1038/s41586-026-11242-8` 的原始 TOC/主视觉**仍未采集完成**。从 `public/toc-demand-live.json` 直接回读该 DOI 状态 `no_visual`，figureGap=0 figures；该问题属于独立 Tampermonkey/VPN Bridge 正式图像采集线，不能把占位图声称为已补齐的出版社原图。
- 当前 scope 仍有 4 个 DOI 待审核（主线 `synced_with_pending`）；独立全库文献质量门禁 #38718802997 因未结案 DOI 及缺源日期而失败，绝不能把日期展示队列 0 当作所有候选范围审核已闭环。保留 `verifiedThrough` 和待审清单。
- 对其他期刊返回 doi.org 的正确规范地址，静态检验验证 DOI 形态和 URL 身份，不主张已经逐个验证所有出版社外部站点可访问性、开放权限或临时网络问题。

**完成结论**：针对用户截图和全站已收录 1,151 篇的 DOI 链接生成与可见发表日期待核实问题，正式仓库 PR、出版社证据、CI、Pages、目录 D1 索引、移动/桌面线上验收均完成。Nature 主图采集尚未完成，应在 Tampermonkey 线继续补抓；这不是 DOI/日期代码修复的成果。

## Git SHA
- Publisher/date/DOI/frozen corpus repair merged #688: `a44c01e4f3a9cb1f2a91906ef378fe0782956485`
- Original release marker: `cd56d8ecbda84df374603d1e8b455160ab8921a5`
- Protected rolling restored: `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`
- Deploy source: `a44c01e4f3a9cb1f2a91906ef378fe0782956485`
