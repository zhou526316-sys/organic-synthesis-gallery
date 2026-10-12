# Gallery 全历史轻量化正文检索：第一阶段续办及正式脚本交付

- 北京时间：2026-10-12 13:17:15（Asia/Shanghai）
- 任务上下文：用户已批准“OpenAlex 官方开放正文优先、Tampermonkey 对旧文献本机合法文本补缺、不保存旧 PDF”第一阶段后要求“继续”
- 仓库：`zhou526316-sys/organic-synthesis-gallery`，`main` 唯一生产基线
- 实现：[PR #545](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/545)，通过所有必要 CI 后于北京时间 13:00 附近 squash 合并为 `cea8b113e18fad29af4bccaebf631f2e3ebce693`
- 关键文件：`.github/workflows/github-pages.yml`，`.github/workflows/historical-text-search-pilot.yml`，`docs/historical-backfill-media-contract.md`，`docs/historical-text-search-pilot.md`，`public/gallery-historical-text-pilot.user.js`，`scripts/historical-text-source-audit.mjs`，`scripts/historical-text-local-evaluator.mjs`，`scripts/test-historical-text-search-pilot.mjs`
- CI 专项：[PR historical safety #38205633290](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205633290)，6项独立测试全部通过；全站 Required quality gate、Playwright、Frontend build、Worker、media/PDF 兼容、production API检查均 success。只有 PR 期间必须跳过的官方元数据 audit job 为 skipped，合并后真实执行。
- 真正官方来源审计：[run #38206086450](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086450) = success；真实正式 DOI 样本50（14刊），OpenAlex DOI verified50、TEI `has_content.grobid_xml` + `content_urls.grobid_xml` 20，`byState.verified=50`，`licensedTei=0` 表示尚未经特定 TEI来源版本许可核验，非“无任何版权许可”。
- TEI候选的OpenAlex best OA location许可元数据：CC BY 10、CC BY-NC-ND 5、unknown 5；**不能把这10篇自动视为可公开索引的全文**。
- 机器报告：[完整临时审计 artifact #11727601175](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086450/artifacts/11727601175)，已下载到当前会话工作区并验证ZIP JSON包含50条；永久聚合摘要：[audit/historical-fulltext-pilot/2026-10-12-openalex-source-metadata-audit.md](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-fulltext-pilot/2026-10-12-openalex-source-metadata-audit.md)，main commit `0fca6da3c8c388350405a5f4bf82c88c8b97fe8d`
- 期刊样本 TEI: ACS Catalysis0/5、Angew4/4、CCS Chemistry0/3、Chem0/1、JACS0/4、JOC1/4、Nature1/4、Nature Catalysis3/4、Nature Chemistry2/4、Nature Communications4/4、Nature Synthesis2/4、Organic Letters1/4、Science2/4、Science Advances0/1。非全历史代表性推断。
- 出版社版权二次核查：`10.1038/s41929-026-01560-5` 官方 Nature Catalysis 页实际为 subscription preview，虽 OpenAlex 标记 best OA CC BY；故必须绑具体 TEI/作者稿/出版社版本来源，不可自动作为可复用的出版社全文。官方 CC BY4.0 直接核实：`10.1038/s41929-026-01616-6`、`10.1038/s41467-026-77771-y`、`10.1038/s41586-026-11108-z`、`10.1038/s41929-026-01600-0`、`10.1038/s41467-026-78066-y`，但 TEI底本、全文版本、署名与第三方材料仍待确认；其他来源例如 `10.1021/acs.orglett.6c02234` 机构条目提供 CC BY 许可提示，不等于出版社版本相同。
- Pages正式部署：[run #38206086655](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086655) = `completed/success`；包含 `literature_authorization`、`build` 和 `deploy` success。旧前一轮 Pages并发运行未取消，新部署等其完成后才执行。
- 真实线上 URL：`https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`。web 普通读取和当前执行容器 DNS 不可用，但连接的网页读取能力实际成功返回文件，确认了用户脚本头部 `// ==UserScript==`、`@name Gallery Historical Text Search — Local Pilot`、`@version 0.1.0` 与正文内容；此外 Pages build 的 `test -s dist/gallery-historical-text-pilot.user.js`、语法检测、固定安全标志检查通过。
- 安装后操作：在 Edge/Chrome Tampermonkey 安装该试验脚本；手动打开自己有合法文本处理权限的、已在Gallery正式入库且最初发表于2026-10-01之前的论文出版社正文页；点击Tampermonkey菜单“Gallery：本地导出此历史论文正文（手动）”；确认合法使用权；仅导出本机 `gallery-historical-DOI.json`，包含章节/段落/Figure、Scheme图注和表格文本及 `sourceSha256`。没有自动批量打开旧论文。
- 本机度量：在仓库根目录用 `node scripts/historical-text-local-evaluator.mjs --dir="D:\\文献全文试验" --limit=100 --output="./historical-pilot-report.json"`，按相同正式 DOI、版本、正文哈希验证，计算相对“标题+Abstract”的正文额外化学术语召回及真实文本字节；不往 GitHub 上传原文。
- 安全边界：2026-07前 `metadata_only`、2026-07至09月 `toc_only` 原有自动媒体义务未修改；批准的历史正文文本处理仅是本机人工触发的独立例外；旧 PDF/SI/正文图新抓取0，旧 PDF上传0、D1/R2全文公共写入0、网站公开全文索引新增0，不假报完成摘要/深度科学审核，不把正文原文开放给所有用户；每日正式新增仍为北京时间08:00唯一发布。
- 尚未验证：真实用户 Edge/Tampermonkey 在出版商授权态下的正文提取质量；50–100篇真实正文内容获取；原始 TEI 真实下载、版本与可转载许可；全文章节级 D1/FTS生产检索；卡片中的较长独立双语概述。在线脚本可安装 ≠ 公共全文检索已完成。

## 用户可见续办回复（主要事实）

**已完成**：PR #545 合并且全部必要检查通过；正式来源审计50/50 DOI，其中20篇有TEI入口；20篇许可元数据10/5/5但均待来源版本审核；已独立核验部分CC BY文章并发现一篇出版社订阅页与OpenAlex最佳OA位置许可不等价；Pages #38206086655 正式完成；在 Gallery 真域名成功读取历史文本试验脚本0.1.0。

**可操作**：[安装历史正文采集试验版](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)，在经许可的旧文献出版社页通过 Tampermonkey 菜单手动导出。保持现有 TOC/VPN Bridge 不变。

**仍未完成**：首次50–100篇真实全文采集，公开 FTS 全文索引，完善正文基础研究概述。严禁将20篇TEI“可用”误说成已取得/公开。
