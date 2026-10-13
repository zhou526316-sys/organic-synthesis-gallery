# Organic Synthesis Gallery — 历史正文采集最新诊断日志、精准修复及 Pages 部署状态
- 北京时间：2026-10-13T13:59:37+08:00
- 对话：用户“那你读取新日志针对问题更新”，接续历史正文0.2.3及诊断密钥重复输入问题
- 生产基线：main；私人 D1 只读匿名不得访问；不写/泄露任何 Token、Cookie、文章全文、PDF、原始 DOI/jobId
- 目录：此前正式 743 历史待处理，72 次用户真实尝试的 0.2.2 截图；新数据来自独立服务器最新 200 事件，只能代表该样本，不能等同全库

## 已交付的只读历史报告
- PR #591: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/591
- merged sha: 27243c0d03c95e52f0f66d72b0b9545857ba743e
- Run #38352043634: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38352043634
- Authenticated GET via existing GitHub Actions BRIDGE_WRITE_TOKEN secret, at most two pages (200 metadata events); runner emits only grouping counts to logs/artifact; no DOI/job IDs, article text or key. No D1 mutation or media requests.
- Actual result: 200 latest events, 105 DOI+jobId unique attempts, all ACS, 105 final results, 0 checkpoint-only, 0 duplicate terminal results. 87 license_not_verified, 8 body_missing, 10 timeout; 95 true navigation HTTP200 and 10 HTTP unknown, no 403/429 in this sample. Report hasMore=true (not entire corpus).
- All 200 events scriptVersion 0.2.2, known v0.2.3 scriptVersion mislabel, NOT evidence which script actually ran. 0.2.4 corrects for new events; old stored data unchanged.

## 源码修复
- PR #592: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/592
- merged sha: 9e9b6ee233ab8c6a1672fea167a5640e92e8132b
- @version 0.2.4, constants scriptVersion dynamic 0.2.4.
- Admin credential remains local independent Tampermonkey GM value. “密钥已保存”“更换诊断密钥” and “立即上传待发诊断” allow one-time entry; read/report HTTP401 explicitly differs from missing local credential; max4 forced pending reports per click; preserves automatic 10-sec sender and strict receipt.
- New conservative ACS text CC BY evidence: only exact verified DOI article section, full ACS author copyright + CC BY 3.0/4.0 sentence; rejects generic OA badge, related/footer notice, CC BY-NC-ND and non-CC reuse. No license bypass or publisher requests.
- “抽查 ACS 许可项（最多10篇）” only samples at most ten previously attempted license_not_verified ACS locally recorded, excluding successful packets; ordinary “复查受阻项” does not silently revisit never attempted records. Candidate count determined before confirm, single indexedDB read.
- Scope preserved: existing TOC, body figures, user-private PDFs, media Worker, online DOI catalog, 23:00 staging and sole Beijing 08:00 official publication untouched; local-only rights-gated text, no raw original uploaded, source DOI always checked.

## CI & deployment evidence
- Final PR head cbb069e408e7c523016a1d87c3af790cdc99f52f.
- Historical Node & Chromium run #38352721874 SUCCESS, site quality #38352721813 SUCCESS, PDF #38352721781 SUCCESS, target TM #38352721882 SUCCESS, paired media #38352721896 SUCCESS, author/site #38352721885 SUCCESS.
- Merge main #9e9b6ee... triggered Pages #38353347119. As of this record this Pages run is pending behind earlier existing build #38353245125 (which was in_progress at own PDF verification). Do not cancel active build or skip gates.
- Direct live https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js returned @version 0.2.3 at time of verification. No claim of 0.2.4 production until Pages completed and a new actual live URL readback confirms 0.2.4. No real end-user ACS recheck has run yet; 87 statuses not assumed recovered.
- Site was not requested to broadcast historical content in Today's new arrivals. No new automated browser visits or recurring tasks.

## 用户可见回复主体（各次阶段回复及最终交付状态）

### 历史正文诊断更新进展
已完成 0.2.4 修订并提交 PR #592。修复密钥重复输入问题：只初次保存，后续直接重发待发报告；修正0.2.3诊断事件错标0.2.2；明确区分HTTP401和本机未保存密钥。历史专项单元及Chromium通过，合并前未冒充正式部署。

### 新日志已读取：真实失败分布
新管理员报告 #38352043634 读取最新200事件，按 DOI+jobId 归并105次ACS尝试。87许可待核实、8正文不足、10超时；95有HTTP200、10 HTTP未知；无中间检查点重复计数，数据仅是最新200事件而非全部743篇。全部事件标注0.2.2因旧程序硬编码，不能据此判断实际上安装版。不能以HTTP200推断有版权再利用权限。

### 专项 ACS 许可证识别边界
ACS 既有 CC BY 开放许可，又有订阅或其他许可，明确的完整文章级版权句子可以作为授权证据，但泛化OA标签、非商业禁止演绎许可不得当作可再利用授权。新增保守解析，最多10篇用户可选抽样，拒绝扩大公开全文权限。

### 代码合并、未完成生产验证
PR #592 已全套CI通过，合并至 main，SHA 9e9b6ee233ab8c6a1672fea167a5640e92e8132b。正式 Pages run #38353347119 排队中，现场脚本仍0.2.3。因此不宣称新版可安装；用户不需重复输入现有密钥，继续用旧脚本，等自行确认脚本显示0.2.4后可刷新首页，直接用“立即上传待发诊断”及“抽查ACS许可项（最多10篇）”。尚未实测新真实捕获成功率；过期媒体/历史成功资料无损失。
