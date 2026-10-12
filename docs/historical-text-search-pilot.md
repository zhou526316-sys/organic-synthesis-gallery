# Gallery 历史文献轻量化全文检索 — 第一阶段（2026-10-12 批准）

## 本阶段交付与非目标

- **已经编写的独立组件**：`scripts/historical-text-source-audit.mjs`（官方 OpenAlex 元数据 DOI 逐条来源可用性探测，默认最多 50 篇）、`public/gallery-historical-text-pilot.user.js`（本机 Tampermonkey 手动导出历史文章正文文本，不与 TOC 引擎任务耦合）、`scripts/historical-text-local-evaluator.mjs`（本地 DOI/哈希核对、文本增量体积、化学主题检索新增召回率统计），以及 `scripts/test-historical-text-search-pilot.mjs` 与 CI。
- **目前不属于交付完成的能力**：未自动将历史全文接入所有用户的云端全文检索；未完成版权逐篇授权；未完成真实 50 篇出版社正文采集；未声称已补齐历史正式文献的全文或 PDF。
- 先跑官方元数据可用性审计，记录 DOI 与版本、OA、TEI 与许可证信号；**下载链接存在不等于同意再利用**。再让用户以拥有有效权利的方式手工采集部分缺项文章。双方最终进入同一结构化 DOI-章节数据模型前，逐篇核实许可和索引范围。

## 原有收录与媒体规则不变

- 历史论文只有正式通过有机合成范围与双遍证据审核、处于当前正式目录且未撤回的 DOI 才进入本地试验。23:00 历史候选仍只进 staging。
- 以 **原始发表日期早于 2026-10-01** 界定历史文本试验，而不是使用 `addedDate` 或队列获取日期。
- 2026-07-01 前仍 `metadata_only`；2026-07 至 09 月仍 `toc_only`。本试验是**单独的、手动触发且本机留存的合法正文文本检索补充**，不改变自动 Tampermonkey 生产队列，也不加入历史正文图、SI、PDF 采集义务。
- 原有 10 月 1 日及以后的图片、HTML Evidence、PDF 规则不变；曾经存储且核验成功的历史资产不删除。
- 不触发正式文献入库或出库，不改变北京时间每日 08:00 唯一新文献发布。历史采集和索引结果不会自动出现在 Today、Hot、公众号每日新增。

## 第一阶段操作

### A. 官方全文来源扫描（仅元数据）

- 现有 `.github/workflows/historical-text-search-pilot.yml` 的 `safety-regression` 执行 DOI/权限/本地捕获测试及 50 篇确定性跨期刊 dry-run。
- 在此工作流进入 `main` 后，可在 GitHub Actions 中手动 `Run workflow` 并勾选 `metadata_audit`；它会按正式 DOI 目录跨期刊取最多 50 篇历史论文，调用 **OpenAlex works metadata 单篇 DOI 查询**，不下载任何 PDF、TEI、SI 或文章正文。
- 报告仅记录 DOI、期刊、原发表日期、TEI 可用标志、OA 状态、许可证短标志和失败分类；没有全文、私钥、出版社登录凭证或带 token 的 URL。
- 若 OpenAlex 需要 key，使用原有可选 GitHub Actions `OPENALEX_API_KEY`；不在聊天或代码中传密钥。429 只进行一次有界退避，异常记录失败后继续。

### B. Tampermonkey 已授权浏览器补缺（本地，不上传）

本脚本为与现有 TOC 6.2.x／VPN Bridge 分离的独立 opt-in 脚本，故不抢占正常媒体队列：

1. 在正式 Pages 已安全发布其资源后，从 **`https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`** 安装。未验证部署前不能声称该链接已经可以安装。
2. 通过自己有合法阅读和文本处理权利的浏览器，手动进入需要补缺的历史论文出版社页面。
3. 在 Tampermonkey 菜单选择 **“Gallery：本地导出此历史论文正文（手动）”**，按提示确认来源权利。
4. 脚本核对当前出版社页面唯一 DOI 与 Gallery 正式目录 DOI、实际原发表日期，解析网页正文段落、章节、Scheme/Figure 图注、表格文本，生成 `gallery-historical-DOI.json` 下载至本机。
5. 文件含 DOI、文章 URL（无查询参数）、原发表日期、来源哈希、`rightsStatus:local_only_permission_to_be_verified`、章节及文字。**不会上传至服务器、不会请求 PDF、不会抓取图片与 SI、不会执行批量访问或绕过登录/403。**
6. 仅在文件留在自己的设备时运行本地评估，例如：

```powershell
node scripts/historical-text-local-evaluator.mjs --dir="D:\文献全文试验" --limit=100 --output="./historical-pilot-report.json"
```

默认输出是 DOI 通过数量、文件字节、相对于标题及文章 Abstract 的主题词额外命中数量与失败类别，**不包含正文原文**。请勿把本地导出的出版社正文 JSON 或私有登录态提交至公开 Git 仓库。

### C. 验收指标

先跨期刊验证 50–100 篇：`formalDoiMatch`、`preOctPublication`、`extractionCompleteness`、`sourceSha256`、`rightsStatus`、`localOutputBytes`、`bodyOnlyHits`（标题不含某术语但正文检出）、抓取失败具体原因。由真实浏览器和真实源报告汇总，不以测试夹具数量冒充真实覆盖。

只有经授权能够持久化和提供适当检索片段的 DOI 才能进入后续 **独立 D1/FTS5 章节级检索表**；受限内容在服务端不得仅因管理员可访问而存为公开全文。公开层显示的中文概述必须另做双遍事实校验。后续如需对用户账号提供私人索引，也必须设计鉴权和许可边界。

## 不改变的安全与成本约束

- 本阶段公网写入字节=0，历史 PDF 新抓取=0，历史正文图片/补充材料新抓取=0；无新增 Cron 或外部付费机器。
- 使用已有 GitHub Actions 进行只读来源扫描，不占用腾讯 256 MiB/月 PDF 阅读网关预算，不在 2GB 腾讯 VM 上做批量 OCR/GROBID。
- 后续需要权利明确的服务器端持久化之前，再按实际内容大小和 D1/R2 配额测算，而不能从 PDF 平均大小猜测真实索引成本。

## 2026-10-12 用户修订：一键全量历史正文补抓（隔离模式）

用户明确要求：**不逐篇手动抓取，而是在网站上多一个按钮，一键补抓所有需要的历史正文；绝不能干涉已有 TOC、正文图及私人 PDF 的采集。** 该要求覆盖上文“仅支持逐篇手动导出”作为默认入口的旧描述，但不扩大对出版社全文的复制、存储或公开传播权限。

### 用户操作

- 更新独立的 `gallery-historical-text-pilot.user.js` 至 **0.2.0** 后，在 Gallery 正式域名页面左下角看到「历史正文 · 独立补抓」浮动小面板，主按钮「**一键补抓全部缺项**」，同时提供暂停和本机正文检索框。
- 首次点击主按钮会读取 `toc-demand-live.json` 的当前**正式 DOI** 集（不碰 23:00 staging），仅选原发表日期在 2026-10-01 以前的论文，去重后按期刊轮询，一次确认即可自动完成本批，不需要对每个 DOI 手工打开页面。
- 一次只启用**一个后台论文标签页**（利用 Tampermonkey `GM_openInTab`，而不是启动另一个媒体 controller）；论文页严格核验唯一 DOI 与任务票据/有效期，检查许可证信息，并只在找到 **CC BY 3.0/4.0 或 CC0 1.0** 的明确本文许可证时提取结构化段落、图注与表格文字。没有明确可采集授权、页面无法访问、DOI 不匹配、挑战/登录、只有 Abstract 或正文不足均跳过并计入真实失败分类；不绕过登录或扩张自动抓取许可。非免费许可出版社条目不能因为校园 VPN 可阅读就自动复制进入公共库。
- 成功项通过专属 `gallery-historical-text-batch-v2:` GM 临时跨标签通信写入**当前 Gallery 浏览器同源 IndexedDB**；该数据可在浮动面板本机全文检索，但**不能自动等同于全站在线 FTS5 已收录**。先前成功捕获的数据再次点击会跳过，失败项在有界间隔后才允许重试；可以暂停，然后再次点击继续未完成项。关闭浏览器不会云端继续运行。
- 任务不抓 PDF、不抓 SI、不抓正文图片、不触碰现有 `osg-toc-v6:` 队列、原有 Tampermonkey controller、`/api/article-summary/fulltext/import` 或私人 PDF 接口。不追加每日 08:00 以外的正式文献发布任务，不要求安装第二台服务器。
- 当前采用严格的、单页面低并发访问节奏，约每 DOI 完成/失败后留 2 秒间隔；跨脚本排队不会共享锁。网络带宽及同出版社并发访问存在现实竞争，不能将“不修改媒体队列”误报为“任何情况下不会占用出版社资源”；如媒体采集出现访问限制，可主动暂停本独立批次。
- 逐条 `sourceSha256`、`publication`、`rightsBasis`、`licenseUrl`、`sourceUrl` 留在浏览器本机供核验；上传原始全文、给其他用户展示正文和生成正式深度双语解读仍需独立许可证及来源审核后才能推进。

### 真实验收

由专属 `scripts/test-historical-text-batch.mjs` 测试历史 DOI 去重、有效年月、CC BY/CC0 来源、非商业禁止修改条款、不明许可、跨标签串扰与不触碰已有媒体接口。网站真实版本必须经正式 Pages 构建/部署并通过 URL @version 0.2.0 回读才能说已经可安装。用户浏览器实际运行（开启授权院校访问环境等）需要另行验收，不能把 CI 模拟当作真实跑完全文。
