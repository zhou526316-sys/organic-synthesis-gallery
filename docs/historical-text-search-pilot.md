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


## 2026-10-12 — 0.2.1 全历史 DOI 来源与正文科学性修正

0.2.0 上线后经真实线上核查确认：`toc-demand-live.json` 为**媒体任务队列**，其构建器明确排除 `metadata_only` 文献，不能成为历史检索全文采集的唯一 DOI 清单。正式网站 `release-delivery.json` 含有 `architectureCatalogId` 和经版本核对的 DOI 成员；线上 `GET https://api.gczhouwld.com/api/literature/catalog-view?catalogId=...&dateTo=2026-09-30&sort=oldest&limit=100` 已证实可返回同一正式目录的有界分页。

0.2.1 因此只针对**独立历史采集批次**替换来源：
1. 先读取 Pages 正式发布版本和 DOI 成员哈希；再以该 `catalogId` 分页读取正式 D1 搜索索引，逐行比较 DOI 是否确实是正式成员、revision 是否有效，保证严格游标前进、总量、去重、每批最大数量和发布版本一致。不能在索引尚未 ready 或分页中出现错误时回退到只覆盖 TOC 的队列。
2. 只选 `firstOnlineDate < 2026-10-01` 且有核验日期的文章；发表日期未知的正式 DOI 显示待核验，不计为“正文完成”。保留既有手动本机导出的旧接口作为兼容，不把它当批量权威源。正式未来新增的 `metadata_only` 条目也可纳入历史批次，但不允许访问额外图片或 PDF。
3. 真实 Springer Nature 页面可能在 `Rights and permissions` 栏以 `http://creativecommons.org/licenses/by/4.0/` **文字**形式声明该文章 CC BY（不是带 `rel=license` 的链接）。允许把这类专属的文章授权声明**仅作为本机文本处理候选**，先确认当前出版社文章 DOI 绑定；不由 OA 元数据猜许可证，也不以通用网页脚注/参考文献里的 CC 许可误判本文。
4. 正文提取明确排除 `Rights and permissions`、`About this article`、`Author information`、`Additional information` 等法律、引用与行政信息。不得把这些长段或孤立 Abstract 当成有效 Results/Methods/Mechanism。标记 `stored` 要求至少有实质科学研究章节文字，不满足则 `body_missing`。
5. 保留与现有 TOC/正文图/PDF controller、队列、回执、上传路径完全独立，不增加 PDF 请求、正文图下载、SI 下载、服务器全文复制或全库正式发行时刻。
6. 以最新 userscript `@version 0.2.1` 显式更新，要求相应 Pages 构建与线上原始脚本版本回读；0.2.0 的成功构建不代表修订已上线。


## 2026-10-13 — 0.2.2 逐 DOI 失败详情和实时诊断（用户明确批准）

用户批准历史正文补抓沿用 TOC/正文图的诊断可靠性机制，但必须与 TOC、正文图、PDF 采集逻辑及队列完全隔离。历史正文脚本 `public/gallery-historical-text-pilot.user.js` 升级至 `0.2.2`：

- Gallery 首页历史正文面板提供「失败详情」和 DOI/失败原因筛选。每个历史记录显示 DOI、期刊、失败阶段、状态代码对应的明确含义、尝试时间及 HTTP 状态是否真正已观察，避免把没有出版社回复的 `timeout` 假称 403/版权问题。尚未上传的记录也可在当前浏览器本地查看。
- 「服务器报告」供授权管理员查询独立的 `GET /api/admin/historical-text/reports`，**未经管理员 Bridge 写入密钥授权不能访问**。该诊断服务严格区别于 `/api/media/tampermonkey-reports`，不借用媒体控制器、队列或报告索引。
- 「配置诊断上报」允许管理员在浏览器**仅输入一次**其现有 Bridge 写入密钥（只保存在此独立 Tampermonkey 脚本的 GM 本地存储）。该凭证不自动跨 Tampermonkey 脚本读取，不能在聊天、GitHub、图片或任何诊断上传数据中复制。未配置时 UI 必须标记「未配置密钥」，报告留在本机待发送，不能宣称服务器收到了。
- 仅上传 `historical-text-diagnostic-v1` 中固定字段：DOI、任务标识、脚本版本、阶段、失败代码、实证 HTTP 状态（未知一律 null）、科学正文部分字数／段数、时间。**禁止正文、PDF、图、SI、登录凭证、Cookie、完整用户当前 URL、原始异常堆栈**，服务器拒绝任何未知字段及非法状态。
- 近实时上报：每篇事件首先持久化到独立 `gallery-historical-text-batch-v2:diagnostics-outbox-v1:` 命名空间；Gallery 页面每约 10 秒检查最多四个待发事件，只有服务端返回 `stored=true` 且 eventId、DOI、jobId 回执严格相符才删除本机待发事件。网络故障、401、503、假的成功响应均保留，待管理员修复密钥或网络后重传，服务端基于 eventId 幂等去重。**上报失败不得阻断正文捕获**。
- 可靠落盘：IndexedDB 请求成功但整个事务 abort 不再记为成功；哈希不匹配独立标记为 `response_hash_mismatch`，与真正 `storage_failure` 区别。失败按 DOI 存本机 `attempts`，保留时间、原因、阶段、已知 HTTP 和服务器回执关联。
- 「复查受阻项」由管理员单独手动触发，允许复查明确许可不明、正文不足、身份受阻等项，但绝不能绕过登录、验证码或反爬限制。一般一键任务不再统一冻结 24 小时：`timeout`、出版社标签失败与本机存储失败下轮可重试，未知许可证和已明确访问限制的项默认跳过。HTTP 403/429 只能在有真实状态码证据时显示与保护性拦截。
- 当前浏览器关闭后不会在云端继续访问出版社，但已经保存的待发送诊断仍留在本机；下次从 Gallery 首页打开自动检查发送（已配置密钥时）。离线本机报告不是公开全站全文检索。
- 后端 `cloudflare/worker/src/historical-text-diagnostics.js` 在现有 `env.DB` 中创建独立的历史诊断表；GET/POST 都经现有 `BRIDGE_WRITE_TOKEN` 管理员授权。与媒体 R2 报告、TOC 控制器、每日 08:00 正式发布隔离，只有轻量失败诊断数据。正式 Worker 部署验收要求匿名 GET/POST=401、授权真实报告 POST=200 回执、授权 GET 可查，未真实跑用户浏览器前不得伪称全部历史论文已有完整失败原因。


## 2026-10-13 — 0.2.3：HTTP 误分类、服务器归并与许可证异步页面诊断

用户明确批准针对 0.2.2 真实批量报告（72/743、2新增、46许可待核验、24其他受阻）的以下三项独立历史正文修复，**本次不调整 TOC、正文图、PDF 抓取或每日08:00发布**：

1. **保留真实 HTTP 错误。** 旧 `BATCH_ERRORS` 未包含 `page_http_error` 与 `page_access_blocked`，把出版社真实403/429错误回执变成 `invalid_response`。修正原因枚举，并将网页HTTP错误、登录/人机挑战、网页未准备好都映射至 `publisher_page`；没有实际浏览器响应状态时必须显示 `HTTP 未知`。不得从 `timeout` 或 `license_not_verified` 推测403/429。
2. **服务器日志按实际尝试归并。** 后端已在独立私有报表中保存 `doi/jobId/kind/httpStatus`，0.2.3 的历史正文面板一次只读查询最近100条，按 `DOI + jobId` 聚合，优先显示 `final_result`，展开可查看 `failure_checkpoint` 和最终阶段；明确“事件数／尝试数／不同 DOI 数”三类指标。展示实际 HTTP 数值、未知情况、英文故障代码及中文说明，不再把同 DOI 连续两个事件算成两个独立失败；仍需已有管理员密钥，不能对全站公开或抓取带正文的私有日志。
3. **分辨尚未就绪的页面与无法确认授权。** 仅在当前任务 DOI 精确匹配时，检查真正正文节点、浏览器文档加载状态和出版社文章级许可声明；如果页面仍在动态渲染，以限定约3.2秒的总探测预算监听**相关 DOM 改动**，不增加 PDF/正文/网络请求，也不采用固定长时间冷却；稳定的已加载页面找不到许可就快速标记 `license_not_verified`（不等于“无阅读权限”），缺少完整文献页标记 `page_unavailable`，观察到登录/人机验证时标记 `page_access_blocked`。只有文章版本真实许可与实质科学正文双重证据成立，才写本机可检索正文。
4. 已储存在本机的成功正文和服务器旧报告不删除，新报告继续依照专用 outbox → 管理员专用 D1 接口 `stored` 回执流程上报。不重传正文、PDF、图片、SI、Cookie、Token 或出版社原文 URL。
5. 本项**只修改历史用户脚本、Pages 版本约束与独立测试**；此前 0.2.2 私有 Worker 报告接口不改变，专属事件 schema 不新增字段。CI 要验证 mock403/429、登录挑战、异步许可延后出现、稳定页面没有CC授权、按 DOI/jobId 展示HTTP与事件类型，并确保已有独立 TOC/正文图/PDF 回归通过。

现网安装前先待 GitHub PR 合并、正式 Pages 发布成功和实际 installer `@version 0.2.3` 回读。此版本通过模拟不等于用户真实 Edge/Chrome 抓到所有历史正文，也不自行让受限全文获得服务器传播权限。

## 2026-10-13 — 0.2.4：持久化诊断凭证的使用体验与版本证据

- 诊断密钥仍单独保存在 **当前 Tampermonkey 脚本的本地 GM 存储**；不跨浏览器、脚本、插件或配置文件共享，也不会传给公开 Gallery 前端、日志、GitHub 或第三方。
- 已经保存的密钥应显示为「诊断密钥：已保存」，原入口变为「更换诊断密钥」。**仅首次配置或管理员主动更换密钥时需要输入**。不回显凭证或在原密码框自动填充。
- 新增「立即上传待发诊断」：使用已保存的凭证，对现存独立 outbox 至多四项发起一次人工重试；自动约十秒轮询、幂等回执、失败保留和服务器鉴权维持不变。点按钮不会立即打开出版社页面、不重新抓历史正文。
- 私有服务器报告如果返回 HTTP 401，应明确提示「已存密钥未通过验证」，而不是误认为未保存；也不删除本地密钥。其他故障仍保留待诊断。
- 诊断 `scriptVersion` 与安装脚本的实际 `@version 0.2.4` 保持一致，修复此前 0.2.3 仍标注 0.2.2 的取证混淆。升级后旧事件不能自动更正。
- ACS 论文页面版权声明可能在 DOI 所属文章信息中以完整纯文字标注 CC BY（无 `rel=license` URL）。本版仅在已验证 ACS DOI 的当前文章区域发现**逐字匹配的 ACS 作者版权声明 + CC BY 3.0/4.0 授权句**时，认可相应文章许可证；普通「Open Access」标签、推荐文章、页脚、CC BY-NC-ND、ACS 专属公共使用许可及其他不明授权一律不能触发自动正文保存。由公开的 ACS Publishers 权益指引核对，未绕过任何访问或网络控制。
- 0.2.4 仅修改历史独立脚本、测试、文档和 Pages 安装器版本断言；不改变媒体 TOC、正文图、PDF、正文/许可证许可边界、用户登录或正式 08:00 发布。
- 上线必须先通过历史 VM/Chromium 回归与完整质量门禁，合并后正式 Pages 部署和安装器 URL 真正读回 0.2.4。**上线不等于 743 篇历史正文已真实抓取完成。**
