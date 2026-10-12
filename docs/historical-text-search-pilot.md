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

默认输出是 DOI 通过数量、文件字节、主题词额外命中数量与失败类别，**不包含正文原文**。请勿把本地导出的出版社正文 JSON 或私有登录态提交至公开 Git 仓库。

### C. 验收指标

先跨期刊验证 50–100 篇：`formalDoiMatch`、`preOctPublication`、`extractionCompleteness`、`sourceSha256`、`rightsStatus`、`localOutputBytes`、`bodyOnlyHits`（标题不含某术语但正文检出）、抓取失败具体原因。由真实浏览器和真实源报告汇总，不以测试夹具数量冒充真实覆盖。

只有经授权能够持久化和提供适当检索片段的 DOI 才能进入后续 **独立 D1/FTS5 章节级检索表**；受限内容在服务端不得仅因管理员可访问而存为公开全文。公开层显示的中文概述必须另做双遍事实校验。后续如需对用户账号提供私人索引，也必须设计鉴权和许可边界。

## 不改变的安全与成本约束

- 本阶段公网写入字节=0，历史 PDF 新抓取=0，历史正文图片/补充材料新抓取=0；无新增 Cron 或外部付费机器。
- 使用已有 GitHub Actions 进行只读来源扫描，不占用腾讯 256 MiB/月 PDF 阅读网关预算，不在 2GB 腾讯 VM 上做批量 OCR/GROBID。
- 后续需要权利明确的服务器端持久化之前，再按实际内容大小和 D1/R2 配额测算，而不能从 PDF 平均大小猜测真实索引成本。
