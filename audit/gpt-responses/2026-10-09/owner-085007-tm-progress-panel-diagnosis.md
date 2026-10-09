# 10月9日 Tampermonkey 实时面板截图审核与反馈待批准
对话上下文：用户在承接 Tampermonkey 工作后上传实时进度截图（截图中本轮启动08:50:07，北京时间）
时间：2026-10-09 上午
代码证据：main 的 public/toc-mainline.user.js（当前 6.2.54，Bridge 2.2.73、Controller 2.2.41）
状态：只读审核 + 反馈核实，未更动抓取引擎和生产版本；若改新反馈 UI，按 PROJECT_RULES.md 先取得用户同意。

## 已向用户先行告知
这张截图显示 VPN Bridge 2.2.73 已经启动新一轮抓取，并正在处理今天新增的 Science 文献，但尚未产生第一条完成回执。
范围 10月1日起 205 篇；待处理任务43；缺 TOC/主视觉41；确定缺 PDF31；PDF库存未知0；本轮实际访问显示0/43；当前 DOI 10.1126/science.aef3001。暂时不能把 0/43 判为卡死，需要观察第一篇真实页面及后续回执。

## 源码复核确认
1. 实时状态 discovering/“识别 TOC 和正文图”来自 runPublisherJob (第4176起) 内 captureLiveUpdate(job,'discovering') 第4191行；此函数之前已调用 assertBoundCaptureJob，第144—150行实时回执也再次校验绑定。所以图中的状态不能称为完全没有启动或虚假遍历。该状态仍可能位于候选扫描/下载之前，不能冒充已抓到图片。
2. 真正的 UI 统计时序缺陷：runManualFromHead 在第5346行设置 row.openedPublisherTab=true，随即 await waitManualResult；coverageStats(run);manualSummary(run) 位于第5363行，即本篇结果返回后。coverageStats 第5212行通过 openedPublisherTab 统计 s.visitedCount，但当前开页后未即时刷新，所以真正已经打开出版社标签页时，面板仍显示“实际访问0/43”。需要在打开页后立即调用 coverageStats/manualSummary 或独立当前访问计数，避免重复统计和并发。不涉及媒体下载修复，需用户批准具体反馈后实施。
3. 第4976—5043行 missingCaptureDecision 对正文图和全文只做 opportunistic 层，不新起单独访问。43唯一 DOI 是41缺主图与31确认缺PDF的并集，按当前同批核验可推得 29 篇同时缺主图/PDF，另 2 篇只缺PDF。
4. journalPriority 将 Science 排在 Nature 子刊前（第1112行起）；10月9日新准入的范围没有 Nature 主刊，先 Science 属规则内。
5. waitManualResult 的最大控制器等待约8分钟（第5079—5093行）；同 DOI 长时间不动但非最终失败时，不应反复点击“立即开始任务”，因为 forceStartFromHead（第4620以后）会废弃旧任务并创建新的 manualRunId。
6. 截图中 PDF 等待开始/正文图0是尚未产生正式回执，不代表最终失败；31份只指授权云端库存的确认缺项，并非全部都能立即成功获取。

## 答复/下一步
指出“实际访问0”的显示滞后事实与修复方向，说明不重启、不盲目升级。让用户保持当前控制页和 VPN，等待首篇结果；如同 DOI 超过8—10分钟或报 controller_timeout、访问拒绝，则采集面板下部“最近进展/最近问题”和新一轮自动日志，继续对失败 DOI 定向修复。UI 计数优化待明确批准后才改。
