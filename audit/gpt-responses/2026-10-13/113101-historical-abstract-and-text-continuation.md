# Organic Synthesis Gallery — 历史摘要及正文采集接续核查
- 北京时间：2026-10-13 11:31（Asia/Shanghai）
- 对话：历史摘要采集工作承接、PR #582 / 历史正文 0.2.3 上线后检查
- 范围：read-only 证据复核；未修改抓取/媒体/发布逻辑；未使用任何密钥；用户现有浏览器 0.2.3 真实报告未在本窗口授权读取
- 生产基线：main
- 关联 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/582
- 线上历史脚本部署已在此前 PR 审计验收；新确认的问题来自当前 main 源码，不代表已修复

## 本轮用户可见答复（包括阶段答复和拟发送结论）

### 历史摘要与正文采集：已承接

已恢复此前工作记录，并通过 GitHub 核实 [PR #582](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/582) 确已合并至 `main`。历史正文独立脚本版本为 `0.2.3`，发布记录显示已通过全站测试及正式 Pages 部署验收。

当前工作分为两个相互关联、但必须独立验收的部分：

1. **原始摘要补齐**：优先从出版社、Crossref、OpenAlex、Europe PMC 等合法元数据来源取得原始英文摘要，用于全库检索、文献筛选及后续学术审核。
2. **历史科学正文补抓**：针对正式目录中 2026 年 10 月 1 日以前的文章，使用独立浏览器脚本，在逐篇确认 DOI、许可证及实质科学正文后，保存到浏览器本机，暂不公开传播或进入全站 FTS。

此前真实浏览器批次的最后一个有据可查的检查点为：

| 指标 | 结果 |
|---|---:|
| 历史正文待处理队列 | 743 篇 |
| 已尝试 | 72 篇 |
| 新增本机正文 | 2 篇 |
| 许可待核实 | 46 篇 |
| 其他受阻 | 24 篇 |

这组数据来自 `0.2.2` 的实际运行，**不是 `0.2.3` 更新后的采集结果**。因此，当前最重要的是确认新版是否正确产生和归类真实采集结果，而不是仅凭部署成功便宣布正文缺口已经补齐。

### 最新原始摘要覆盖情况

从 GitHub Actions 的实际验收产物读取到了 **2026 年 10 月 13 日北京时间 11:06 左右**的正式库存数据：

| 正式目录 | 原始摘要已有 | 原始摘要缺失 |
|---:|---:|---:|
| 979 | 939（95.9%） | 40 |

数据来自 [全库检索线上验收 #38340066445](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38340066445) 中的 `gallery-basic-abstract-live` 产物。同一报告还记录了 443 条已审核解读，但这不能直接视为 443 条均已在网页正常显示。

上一轮 [原始摘要自动补抓 #38316992174](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38316992174) 成功执行，但针对当时缺失的 40 篇，本轮新增原始摘要为 **0 篇**。诊断显示：

- 20 篇 Nature 系列返回不含可核验摘要的网页内容，另有 1 篇跳转至身份验证域名。
- 16 篇 CCS Chemistry 返回 HTTP 403，另有 1 篇 ACS Catalysis 同样返回 403。
- Springer Nature 官方元数据 API 尚未配置，Semantic Scholar 当前使用非认证模式。

因此，摘要不足的主要症结已经不是单纯没有安排抓取任务，而是部分来源无法获得有效的、DOI 绑定的摘要数据。

### 本轮新确认的两个代码问题

**第一处：历史文献摘要缺口审计的目录来源不完整。**

`scripts/audit-gallery-abstract-gaps.mjs` 依然依赖 `toc-demand-live.json` 并要求它与正式 DOI 总数完全一致，而该媒体清单排除了 `metadata_only` 文献。它无法作为历史全文献摘要审计的权威来源。应改为正式 `catalog-view`，核对 DOI、revision、目录代次及分页完整性。

**第二处：0.2.3 诊断上报仍写入旧版本号。**

`public/gallery-historical-text-pilot.user.js` 的安装头标注 `0.2.3`，但诊断 payload 中实际写死了 `scriptVersion: '0.2.2'`。这意味着更新后的新事件可能继续以旧版本号进入服务器报告，影响排障时区分修复前后的真实结果。

这两处均由仓库现有代码直接证实，目前还没有修改生产代码。它们不会推翻 PR #582 已完成的三项修复，但需要单独修正和回归测试。

### 当前处理与下一步

在不增加 D1 读写负担的情况下，本轮已从已有 GitHub Actions 产物完成全量覆盖统计，而不是再次扫出版社。历史正文端应该先使用真正更新至 0.2.3 的浏览器，在「服务器报告」中核验少量受阻 DOI 的最新尝试，比较检查点、最终原因和实际 HTTP 证据，不应立刻重复全部743篇。本窗口没有管理员浏览器凭据，不能声称已经读到新的受保护报告或新一轮真实全文成功量。

上述两个新发现属于待批准的代码修复：一是将摘要缺口审计换成正式 catalog-view 成员与分页验证；二是将历史正文诊断版本与 userscript 版本绑定并更新测试/版本发布。遵守项目既定的先核实、后批准再改代码规则。原有 TOC/正文图/PDF、版权边界、每日08:00唯一发布、23:00历史候选 staging 均保持不变。

## 源证据
- main `scripts/audit-gallery-abstract-gaps.mjs`：读取 `toc-demand-live.json` 并断言与 release-delivery 成员一致。
- main `docs/historical-text-search-pilot.md`：0.2.1 已确认媒体任务表不包含 metadata_only；权威来源为 formal catalog-view。
- main `public/gallery-historical-text-pilot.user.js`：@version 0.2.3，诊断事件 scriptVersion:'0.2.2'。
- GitHub Actions #38340066445：gallery-basic-abstract-live JSON，979 DOI，939 原始摘要，40 缺失，443 已审核解读记录。
- GitHub Actions #38316992174：恢复报告，964 DOI，924 原始摘要，40缺项，本轮恢复0；Nature API key未配置，Semantic Scholar未认证。
- PR #582 已合并 SHA：2ddba53ca43d64fd535ae9e3258e4b5a879f1a65。
