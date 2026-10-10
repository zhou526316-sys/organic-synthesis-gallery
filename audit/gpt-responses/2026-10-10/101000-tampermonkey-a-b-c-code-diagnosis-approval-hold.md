# Tampermonkey 接续核查（2026-10-10，北京时间约 10:10）

会话：抓取有机合成文献并持续更新网页 / Tampermonkey 接续。
状态：仅代码和审计只读核查；按照 PROJECT_RULES.md 的反馈审批规则，A/B/C 当前仍须明确授权后才能修改修复代码。本文是当前聊天答复记录，非功能修复、图片入库成功或线上抓取验收。

## 已确认

重新连接仓库 `zhou526316-sys/organic-synthesis-gallery`，核对 `main`、PR #452、PR #459、PR #454、2026-10-10 10:05 前期审计及 `public/toc-mainline.user.js`。
- PR #452 已合并（2026-10-09 14:24Z），覆盖 Chem preflight 早停、受证实的 Chem PII DOI 匹配、PDF 明确 403 冷却和 RSC 日志保留。当前 main 引擎头部和 INSTALL_REVISION 均为 6.2.59；Bridge 2.2.78 在既有生产验证报告中确认。
- 10-10 09:52—09:53 最新用户诊断：启动约 75 秒因 gm_request_timeout 结束，队列 scopeCount=0、visited=0、attempt=0，未进入 DOI 访问。PR #452 不能认定修复了此独立故障。
- PR #459 仍开放，其工作为只读启动取证，不含启动修复。
- PR #454 已合并，增加已经核验完整 figure packet 的发布上限 10→20；不能将其视为全部暂存正文图均已上线。

## 新增源代码证据

A. `runManualFromHead` 当前使用 `Promise.all([getJson(QUEUE_URL...),getJson(WORKER+'/api/media/capture-capabilities')])`。`getJson` 对这两种请求都使用 `prefix='queue'`；一个失败即可中断整轮，且最终 `s.stopReason` 无接口层级字段，不能区分队列/能力首错。读取通道 `controllerReadMetadataJson` 走 Gallery 内 native fetch 优先，失败后 GM；两段超时可能相加，75 秒可由传输链解释但不能从现有 trace 确认具体失败端点。修复应独立采集 endpoint role、native/gm cause、elapsed、status；限定重试，不将不新鲜或不完整队列作为正式缺项真值。失败保留原进度且不谎报已访问。

B. `postAcquiredImage` 在超时/abort 触发时会调用 `retainImageForGalleryUpload`，但后者的可留存错误白名单没有包含 `AbortError` / 普通 `signal is aborted`；它只接受若干 gm_request_*、timeout、networkerror、budget_exhausted 等文本。这可解释 JACS 10.1021/jacs.6c17448 Figure1 在约 46 秒终止后 `galleryReplayQueued=0` 的一种实际代码路径，但尚不能排除显式用户取消、活动 job 失效、18MiB/20 条 outbox 上限或 GM 存储失败。不得无条件将所有中止重新排队。另一个风险：`imageReplayAlreadyStored` 对 TOC 用官方图/fig1 类型粗略判定而没有对比图片 hash，容易把不同同类型候选误判为已存；`retainImageForGalleryUpload` 对已存在同 key 只比较 base64 长度，也未对比图像 hash。建议改为精确 DOI+kind/id+可用 hash/来源的确认，以及 outbox 拒收理由码、容量和重放结果统计，先服务端核验再补传，不绕过正式审核/发布。

C. `rscNativeAjaxBoundRoute` 目前的 Silverchair `ArticleAbstractAjax` 仅允许 DOI 10.1039/d6sc06407h 和 10.1039/d6gc03748h，严格匹配路径中的 DOI、RSC 期刊代码和 articleId。其他缺项目前不会走这个 AJAX fallback。扩展前需要真实 DOI↔ArticleId 页面证据；继续排除 pdf.gif、PDF 首页预览和非同 DOI/非官方资源。PDF 403 必须保持拒绝，不得标为 stored。

## 当前验收和权限边界

正式新增仅北京时间 08:00；采集仅 `addedDate >= 2026-10-01`；此次无代码修补、PR 合并、部署、媒体/私有 PDF 存储改动或重新跑 owner 抓取。使用者截图旧版 2.2.77 与当前 `main` 6.2.59 不一致，但升级本身不能作为启动、上传或抓取成功的证据。

严格项目规则 `PROJECT_RULES.md` 中“吐槽不要直接修，要先给我核实，我来决定”及“无条件继续不是批准”：用户此次粘贴的文本仍为“请确认是否批准 A、B、C”，不是明示批准，故功能性修复仍处于审批等待。