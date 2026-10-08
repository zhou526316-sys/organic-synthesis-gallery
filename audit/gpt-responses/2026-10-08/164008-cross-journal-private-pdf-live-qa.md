# Gallery 跨期刊私有 PDF QA：本聊天用户可见回复同步

北京时间：2026-10-08T16:40:08.540+08:00
聊天上下文：Organic Synthesis Gallery 架构续作，用户要求“除了这篇呢？每种期刊都应该测试好几篇”。

## 开始阶段的回复
同意。只测一篇 Organic Letters 不能代表整个 Gallery 的 PDF 阅读功能。
按当前网站实际收录的期刊逐刊抽样，每刊原则上 3 篇，覆盖不同大小/日期；对 PDF 私有 R2、实际 owner 授权、分段与完整下载、PDF.js 和浏览器第一页分别验收；库存不足与失败单列。使用临时合成账号，独立清理，不使用真实用户会话。

## 读库发现
第一次选用 public/papers.gz.b64 的历史档案发现数据不完整，未用于最终验收。改为当前正式的 2026-10-08T08:00:00+08:00 文献索引生成及生产 private_pdf_documents D1 记录。
正式索引 887 篇，生产 ready 私有 PDF 163。核对 2026-10-01 新增 177、ready 163、仍缺 14。Nature Catalysis Oct1后没有新卡片，Chem Oct1后新增2篇、均没有 ready PDF。

## 第一半批次结果（已向用户展示）
| 期刊 | 成功打开 | 未存储 | 已存储但失败 |
|---|---:|---:|---:|
| Nature | 1 | 2 | 0 |
| Science | 2 | 1 | 0 |
| Nature Catalysis | 0 | 3 | 0 |
| Nature Synthesis | 2 | 1 | 0 |
| ACS Catalysis | 3 | 0 | 0 |
| Organic Letters | 3 | 0 | 0 |
| Chem | 0 | 2 | 0 |
| Chemical Science | 3 | 0 | 0 |

## 剩余半批次结果（已向用户展示）
| 期刊 | 成功打开 | 未存储 | 已存储但失败 |
|---|---:|---:|---:|
| Nature Chemistry | 2 | 1 | 0 |
| Nature Communications | 3 | 0 | 0 |
| JACS | 3 | 0 | 0 |
| Angew | 3 | 0 | 0 |
| CCS Chemistry | 3 | 0 | 0 |
| Science Advances | 2 | 1 | 0 |
| Green Chemistry | 3 | 0 | 0 |
| JOC | 3 | 0 | 0 |

## 跨期刊真实测试
仓库测试分支：diag/pdf-cross-journal-sampling-20261008（未合并进生产 main）。
Actions run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37750441368
审计报告（含47个 DOI 的状态、毫秒数、14 个缺漏 DOI）：
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-cross-journal-reading-qa.json
报告主分支审计提交：61b66cead6eba549146f80b3563449b701428da9

## 最终回复
**16 种期刊的跨刊 PDF 实测已完成，并已保存正式审计报告。**

[逐篇测试与 14 个缺漏 DOI 的完整报告](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-cross-journal-reading-qa.json) · [四批次原始 CI 记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37750441368)

四批次均成功，共测试 **47 篇**：其中 **36 篇实际存储的 PDF 全部通过**真实授权、完整下载、SHA-256 校验、PDF.js 解析和 Chromium 第一页显示；另 **11 篇如实返回未存储**。没有观察到“已存储但在 GitHub 测试网络打不开”的样本。

成功样本的第一页就绪耗时中位数为 **809 ms**，最慢为 **1,806 ms**；授权耗时中位数为 **296 ms**。测试覆盖了较小与超过 10 MB 的 PDF。**这些时间只适用于 GitHub Actions 的网络，不代表你的 Edge／校园网实际耗时。** 浏览器实际验收了第一页，尚未逐篇点击第二页。

按你要求的 10 月 1 日之后新增范围，正式目录 **177 篇**，已存储 **163 篇**，仍缺 **14 篇**。缺口集中在 JACS（1）、ACS Catalysis（4）、Organic Letters（4）、Chem（2）、Chemical Science（1）、Green Chemistry（2）。报告附每一个缺漏 DOI 和全部 47 篇抽样结果。Nature Catalysis 自 10 月 1 日以来在当前正式索引中没有新增卡片，因此历史 PDF 不足不计入这 14 篇。

**结论需要分开处理：** 第一，14 篇已确认的新增 PDF 缺口需要交给采集链路补齐；第二，你本机的 15 秒授权超时仍未解决。36 篇在外部环境通过不能证明国内账号/代理/VPN 链路正常，所以我不会将你的问题标记为“已修复”，也不会继续盲目增加下载并发。此次未改动生产阅读器、账号权限或文献发布规则，四批测试账号均已清理。

## 执行边界
本次仅额外新增 test-only GitHub Actions 分支脚本，并写主分支审计日志；无生产代码或 PDF 权限变更；四批隔离账号与临时许可全部验证清理。36份已存储 PDF 使用 GitHub Actions Chromium 实际显示第一页，完整读取字节并校验哈希。尚未逐 DOI 交互检查第二页或用户国内客户端网络，避免将测试条件以外的效果当成成功。README/项目规则未改变；未触发文献新增/删除或 Tampermonkey 数据修改。
