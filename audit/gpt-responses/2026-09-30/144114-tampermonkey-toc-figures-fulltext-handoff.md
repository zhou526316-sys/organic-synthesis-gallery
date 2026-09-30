# Tampermonkey TOC / figures / full-text handoff

- Beijing time: 2026-09-30 14:41:14 +08:00
- Conversation/task: 用户指定本聊天接管 Tampermonkey TOC、正文图和全文抓取，先回忆并同步。
- Read baseline: main at 00646071b1664580e13d7fffeba56f7d40473ffe, committed 2026-09-30 14:31:35 +08:00.
- Scope: read-only reconciliation plus this response/handoff record; no capture code, production literature, media objects, publication triggers, or schedules changed.
- Media generation remains 1790082000000. Direct publisher import/repair and pre-incident wholesale media restoration remain prohibited.
- Evidence limitations: live public endpoint attempts did not return usable capture-report/evidence-inventory payloads. Do not infer browser activity, current installed version, fulltext totals or deployed body-image gaps from repository placeholders. Personal long-term memory write was attempted but the memory tool reported disabled; no memory-save success is claimed.

## User-visible reply

**这条支线由我接手：官方 TOC、正文图、全文文本的抓取、上传、队列调度和失败排查。** 我已经回忆交接记录，并核对了仓库当前 `main` 的代码与规则；不是沿用之前的版本号和缺口数字。

### 一、当前已对齐的基线

仓库仍是 `zhou526316-sys/organic-synthesis-gallery`，本轮读取基线为 **`00646071`**，提交时间为北京时间 **2026 年 9 月 30 日 14:31:35**。fileciteturn1file0L2-L2

当前 `public/toc-mainline.user.js` 中，**控制器版本为 `2.2.39`，抓取协议为 `6.2.20`**；队列使用主站的 `toc-demand-live.json`，控制及上传接口使用 `api.gczhouwld.com`。源码同时接入了 TOC、正文图暂存、全文证据上传与证据库存接口。这里确认的是仓库代码，**不等于已经确认你浏览器里安装、正在运行的版本**。fileciteturn17file0L2-L2

历史上确实出现过 `2.2.40/2.2.41`，随后又有恢复 `2.2.39` 兼容性的提交。因此，接续工作不会仅凭“版本数字更大”就让你再次换脚本。fileciteturn13file0L7-L11

### 二、目前能确认的数据

以下是**仓库队列在北京时间 9 月 30 日 13:40:42 生成的快照**，不是你电脑此刻的实时进度：fileciteturn18file0L2-L2

| 项目 | 快照记录 |
|---|---:|
| 队列覆盖的正式文献 | 694 篇 |
| 最新上架日期 | 2026-09-30 |
| 该日新增文献 | 18 篇 |
| 没有可用展示图 | 65 篇 |
| 缺官方 TOC | 170 篇 |
| 其中已有视觉图、仍需补官方 TOC | 105 篇 |

**今天新增的 18 篇已经进入队列。** 但“队列里有最新文献”与“浏览器实际优先抓最新文献”是两件事；后者仍要核对真实出队记录，不能仅凭队列存在就判定排序问题已解决。

另一个需要保留的警示是：队列的 `figureGapTotal` 和 `zeroFigureGapTotal` 都写着 **694**，但仓库内的 `media-index.json` 本身是空占位文件，正式媒体还要经过构建合并和线上核验。**不能据此宣称 694 篇全部没有正文图。** 正文图真实缺口需要对齐线上媒体索引、暂存库存和发布账本。fileciteturn18file0L2-L2 fileciteturn22file0L2-L2 fileciteturn9file0L2-L2

本轮读取工具没有返回可核验的实时抓取报告与全文库存，因此**全文已抓多少、仅摘要多少、还有多少未上传，以及浏览器当前是否在跑，暂不报未经核实的数字**。

### 三、后续按这些要求接续

**抓取顺序与同篇完整性。** 延续你已确定的“每日新增优先抓全 → 历史缺 TOC → 正文图等补全”，已有 Figure 1 的不挤占无图文献的优先级。同级按 Nature、Science、Nature 子刊、Science 子刊、JACS、Angew、Chem、其他排序。每轮以当前正式卡片集合为边界，已删除 DOI 不再进队；已经完整、有效的内容不反复抓。同一篇文章打开后，检查 TOC、正文图和文本三项，按缺项安排顺序，不能抓完文字就把图片遗漏，也不能只抓图片不检查文字。这些是接续验收标准，不是本轮已验证全部实现的结论。

**失败处理与错配防护。** 单篇失败跳过并保留原因，不让整条队列停住；缺 TOC 不妨碍保存该篇可获取的正文图和文本。官方 TOC 与 Figure 1 严格区分，继续核对任务 DOI、页面 DOI、图片来源、图号和图注，旧污染媒体不直接回灌。采集仍以你真实登录态和可访问网络中的 Tampermonkey 为主，不另开服务器直接抓图通道。fileciteturn7file0L2-L2 fileciteturn9file0L2-L2

**采集、入库、上线分开记账。** 自动正文图发布仍须在同次构建中具备官方 TOC；20–25 篇是优先批量，符合条件的尾批可在 15 分钟无新增后释放，现行规则还包含 30 分钟积压释放机制。暂存成功不等于网页已经显示，发布完成要以线上账本与实际图片核验为准。fileciteturn9file0L2-L2

**全文与摘要的交接。** 原始文本证据私有保存，如实区分完整正文、部分正文和仅 Abstract；只有摘要就按摘要处理，不能标成已抓全文。Tampermonkey 和 Worker 负责采集与交接，不调用模型 API；摘要仍走你已确定的北京时间每日 12:00 任务，不混入 08:00 / 18:00 新文献发布。公开页面也继续不显示模型名称。fileciteturn21file0L2-L2 fileciteturn0file0L2-L2

### 四、本轮完成与接续重点

**本轮完成的是历史交接、当前代码与队列快照核对；没有修改脚本、触发部署或启动你电脑上的抓取。**

接续排查的第一重点是你最后指出的“为什么没有从最新文献开始抓”：核对**最新队列 → 浏览器实际出队 → 同篇 TOC／正文图／文本回执**这条链，再处理 Chrome 注入、Check access 和待发送报告等问题。不会先盲目升级版本，也不会把“已上传”当成“已上线”。
