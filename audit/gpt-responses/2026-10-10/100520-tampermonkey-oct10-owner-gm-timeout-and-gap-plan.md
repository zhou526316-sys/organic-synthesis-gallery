# Tampermonkey 连续工作：2026-10-10 09:52 启动超时与 TOC/正文图/PDF 未补齐

北京时间：2026-10-10 10:05:20 +08:00
会话：抓取有机合成文献并持续更新网页 / Tampermonkey 接续，用户上传了最新日志和 Bridge 2.2.77 停止截图，要求继续改善 TOC/正文图/PDF。
状态：只读诊断；新反馈修复方案等待用户审批；**未修改采集生产代码、PDF 权限或 R2 图片**。

## 本轮已核实证据

- 用户截图：Bridge 2.2.77、engine 6.2.58、controller 2.2.41，约 09:52 开始，09:53 `已停止 gm_request_timeout`、当前 DOI 无任务页。
- 用户新的真实 R2 上传在 2026-10-10 09:54 北京前后；[只读工作流 38015377366](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38015377366) 成功；只读工作分支 PR #459，无 R2、图片或账户变更。
- 最新快照：ownerUpload uploadedAt=1791597278957，summary.startedAt=2026-10-10T01:52:04.242Z、finishedAt=2026-10-10T01:53:19.608Z，phase=blocked_remaining，stopReason=gm_request_timeout，scopeCount=0、total=0、visitedCount=0、attemptCount=0、inventoryProgress 空、inventoryErrors 空、activeJob 空。这证明还没形成缺项队列或进入出版社抓取。
- 当前 `runManualFromHead` 首先以 `Promise.all([getJson(QUEUE_URL),getJson(WORKER+'/api/media/capture-capabilities')])` 获取队列/能力，尚未记录哪一个具体请求失败；任一失败在顶层 catch 标记 blocked_remaining。controllerReadMetadataJson 先尝试页面 native 浏览器传输，条件满足时才退回扩展 GM 通道；原始 gm_request_timeout 缺少请求类型/前一通道状态证据。不能擅称某一域名 403 或具体原因。
- 早先 JACS DOI 10.1021/jacs.6c17448 的已发现 TOC 于生产上传阶段 `gm_request_timeout` 约 23 s，Figure 1 约 46 s 后 `signal is aborted`。TOC `galleryReplayQueued=1`，Figure1 `galleryReplayQueued=0`，原因尚不能判定为 outbox 容量、存储故障还是队列绑定/大小限制；不得将暂存但未发布当作已完成。
- [PR #452](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/452) 解决 Chem 预检 8 min 等待、精确 PII、PDF403 冷却，已合并。生产安装器在 [工作流 37944540750](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37944540750) 读回 Bridge 2.2.78 / engine 6.2.59，Gallery 和 API 均 HTTP200；截图运行的 2.2.77 比正式版旧。升级有助于 Chem 已修项目，但不能证明这一条全新 GM bootstrap timeout 随之消失。
- [只读缺项覆盖率工作流 37946437074](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37946437074)：2026-10-09 22:44 北京，205 篇 10.1+ 文献，实际缺主图15篇（Chemical Science 8、Green Chemistry 6、JOC1），已暂存但未全部公开正文图97篇、已知正文图数量不完整35篇、公开页面无正文图122篇。类别可能重叠。129 份 latest-attempt PDF 报告 stored、74篇不明、2份拒绝，**不是用户私有 PDF 库存覆盖率**。
- UI 并行窗口已有 2026-10-10 [RSC 三篇待审批核验](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/gpt-responses/2026-10-10/095316-ui-rsc-three-missing-toc-diagnosis-approval-hold.md)：固定 RSC AJAX 仅白名单两篇；扩展到更多已证实 DOI 和修复 .toc-retry 状态机属于未批准项，不能跨窗口默认实施。

## 用户可见前续回答（实质全文）

**已确认：截图中的脚本不是最新修复版。** 截图为 2.2.77/6.2.58，启动 gm_request_timeout；PR452 已修复 Chem 八分钟等待、PII 识别、PDF403 重试和 RSC AJAX 事件保留，提议 2.2.78/6.2.59，先核实实际访问链。

**最新上传日志已读取。** 该次 09:52–09:53 的当前轮任务未打开任何 DOI（0 次），没有成功完成；75 秒停止。旧 trace 表明 JACS 17448 TOC 上传约 23s GM 超时和 Figure 1 上传约 46s abort，分别属于启动访问和媒体上传两类问题。

**缺项不仅是 TOC，正文图发布也有积压。** 昨日只读审计显示 205 篇 Oct1+，15 篇主图缺失（8 Chem Sci、6 Green Chem、1 JOC），97 篇已暂存但尚未全部发布，35 篇已确认正文图不完整，122 篇网页无正文图；PDF 统计未认证为真实库存。

**初始化错误已定位到队列或服务器能力首次 GET。** R2 snapshot scopeCount=0，inventoryProgress 空，stopReason=gm_request_timeout；还不能从已有快照确认是哪个端点。不能通过降低图片/DOI 真实性门槛规避网络失败。

## 待批准的定向修复（当前不得实施）

A. 启动链：分别标记能力读取与队列读取失败位置和两种传输原因；限定次数的 GET 重试、只读可验证备源/仍有效的完整队列缓存，保证新发布槽完整性、授权与 DOI 去重；失败保留现有回执与可恢复状态，不谎报已访问。

B. 上传链：严格按 DOI、哈希、标签去重并先查服务端是否已存入；区分 GM 上传超时与成功回执；检查 deferred image outbox 成功/失败以及 1.7MB Figure1 为何 `galleryReplayQueued=0`；不盲目提高 GM 存储上限或重复下载原版图片。已暂存而尚未公开图片走正式来源审核/发布管道，而不是再访出版社冒充未抓。

C. RSC/私人 PDF：把第一方 Silverchair AJAX 从两篇硬编码向有证据的同文章 DOI+ArticleId 扩展（需用户授权）；不把 pdf.gif/PDF 首页图当 TOC，保留 401/403/429 拒绝；私人 PDF 仅在已验证 owner 库存缺失和合法出版社会话下重试，403 不算已存储。范围仅 addedDate>=2026-10-01，08:00 唯一正式新增时刻不改。前端旧服务不可用误导性 UI 修复另有并行审批，不自动涵盖。

## 待发最终用户正文

定位结果是 09:52 当前轮直接在启动前的队列或能力读取阶段失败，尚未进入任何出版社。新版本在生产可从 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 获取 Bridge 2.2.78/engine 6.2.59（不卸载、保留现有密钥和存储），但这次 GM 初始化超时仍需要独立修复。

建议批准三个分离但同批处理的变更：A 启动传输可靠性与错误分层，B 已下载 TOC/正文图的可靠续传和暂存→正式发布核验，C RSC 第一方真实主图发现和 owner PDF 权限边界内补抓。每项在独立 PR/CI/真实线上读取和真实 owner 运行回执之后才能认定成功，不能凭测试通过或安装包更新称为图片已补齐。请确认是否批准 A、B、C 同批实施。
