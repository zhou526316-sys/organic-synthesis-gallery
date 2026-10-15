# TOC / historical body feedback reply synchronization

- Beijing: 2026-10-15 19:36:01 +08:00
- Conversation/task: User requested no pagination for fulltext capture and advised reviewing TOC mainline acquisition script first.
- Read-only audit commit: `7a36ecd318aea98fa8cffb0a57e15771339edb87`.
- No capture code, public FTS data, media tasks or production installers modified.

## User-visible reply

我已经读取了仓库 `main` 上的 TOC 主脚本和历史正文脚本。你的判断有依据：**当前历史正文抓取器的架构明显落后于 TOC 主线，应当复用 TOC 已经成熟的抓取机制，而不是继续给 0.2.9 增加等待时间。**

| 对比项目 | TOC 主线 6.2.67 | 历史正文 0.2.9 |
|---|---|---|
| 任务来源 | 一次读取完整 TOC 队列清单 | 串行请求 DOI 目录，每页100条 |
| 批次处理 | 自动筛选、调度并处理任务 | 目录完整读取失败则无法启动 |
| 出版社访问 | 多种 DOI 直达与跳转策略 | 主要依赖 DOI 跳转 |
| 页面通信 | 任务绑定、心跳、结果回执 | 较简单的跨标签页状态通信 |
| 网络异常 | 多种请求传输方式和分类恢复 | 目录请求超时即报错 |
| 中断恢复 | 租约、检查点、任务接续 | 恢复机制相对有限 |

TOC 内部仍有小批次调度和部分分段库存查询，但用户不需要手动翻页。你要求的**一次启动，持续遍历全库**是合理的；技术上也不必让正文脚本在抓取前串行取得十几页索引。

## 最值得直接复用的三项 TOC 能力

1. **更可靠的出版社页面接管。** TOC 会先确定实际出版社地址，再绑定任务 ID，并在页面加载期间持续发送心跳。它还针对 ACS 后台标签页未初始化的情况提供前台重试。正文脚本没有同等级别的机制，这与此前大量 `publisher_script_not_confirmed` 记录直接相关，但仍需真实浏览器实验确认具体原因。

2. **更完整的正文解析器。** TOC 已经实现 `evidenceArticleRoot()`、`collectArticleEvidenceSections()` 和 `buildArticleEvidencePacket()`，可识别多种文章正文容器，提取章节、图注及表格，并区分 `abstract_only`、`partial`、`complete`。历史正文脚本主要使用少量通用 DOM 选择器，因此更容易漏掉动态加载的科学正文。

3. **不中断的队列与恢复机制。** TOC 有持久检查点、实时库存核对、任务租约、出版社级冷却和失败后的接续。历史正文脚本则可能在尚未完成目录读取时就让整轮任务停止。

还有一个很直接的发现：**当前仓库的 `toc-demand-live.json` 已经一次性包含1,151条论文记录。** 这证明现有项目可以通过单个清单文件向浏览器提供千篇级 DOI，而不必在历史正文脚本中逐页请求目录。

不过，TOC 清单生成器按媒体收录规则过滤部分媒体任务。因此，正式改造时应校验它与完整 DOI 集合的一致性，不能直接把 TOC 媒体任务列表当作永久权威的全库正文清单。

有一点需要按实际代码进一步明确：TOC 清单的**完整 `articles` 注册表并没有排除 `metadata_only` 文献**，排除规则只作用于部分媒体抓取任务。我已核对当前文件：

- 正式清单：1,151个不重复 DOI
- 7—9月 `toc_only`：851篇
- 常规媒体策略 `standard`：294篇
- `metadata_only`：6篇

因此，更直接的方案是：**以现有 TOC 完整注册表作为正文队列读取方式的参考，并与正式发布 DOI 集合逐项核对。** 这比重新设计一条每100篇读取一次的正文目录接口更符合现有系统，也能保留早期归档文献。

## 最后核实与推荐方案

一个直接影响正文成功率的代码风险也已经定位：0.2.9 主要通过 `https://doi.org/<DOI>` 打开论文，如果跳转后的出版社页丢失任务 fragment，DOI 元数据又尚未加载，而且实际路径不含 DOI，`batchWorker()` 会提前退出，连启动回执都不会发送。Elsevier 的 PII 文章路径尤其需要针对性验证；这只是源代码层面的明确风险，不能在缺少真实浏览器路径回执时断言其解释了每次失败。

TOC 主线会先解析真实出版社文章路由，再绑定任务 ID，等待 DOI 与页面内容加载并发送心跳，还能在 ACS 后台脚本未初始化时有限度前台重试。建议将这套**路由解析、任务绑定、心跳、失败分类和断点接续机制**移植到独立正文抓取器，同时复用 TOC 的科学章节、图注、表格提取适配器。

正文抓取入口改为**一次取得完整正式 DOI 清单，经过成员一致性核验后持续执行到全库任务都有明确状态**，而不是等待十几次100篇分页请求全部成功才启动。内部仍只保持受控的出版社页面并发，处理真实访问限制，防止浏览器内存和出版社流量失控；这不构成20篇或100篇全局上限。

TOC 的正文证据标记 `textProcessingPolicy:unknown` 不等于可公开复用授权。因此保留独立的许可证审查、本机存储和公共 FTS 复审流程，不直接复制 TOC 的媒体上传逻辑，也不改变 TOC、正文图、PDF、SI 或每日08:00发布。

完整逐函数对比已保存到：
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-15-toc-mainline-v6267-vs-historical-body-v029-readonly-comparison.md

**本轮已完成源码核实与方案设计，尚未改动生产抓取代码。** 按项目既定的反馈审批流程，下一步需你批准“按 TOC 主线重构独立正文抓取器”，之后才能实施与发布验收。
