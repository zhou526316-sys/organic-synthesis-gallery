# Tampermonkey：2026-10-10 新日志的 34 篇冷却调查
北京时间：2026-10-10T10:41:18+08:00
上下文：项目“抓取有机合成文献并持续更新网页” / Tampermonkey 新版本 2.2.78／引擎 6.2.59／控制器 2.2.41。
性质：用户反馈只读诊断；**未获新的冷却策略修复审批，未变更正式采集脚本、生产媒体或 PDF 数据。**

## 用户问题

“怎么那么多冷却？总是冷却干嘛？新的日志已上传”；截图显示从2026-10-01起范围228篇、未补齐36篇，冷却等待34篇、访问受阻2篇，本轮实际访问4/38。

## 真实新日志读取

读取既有 owner R2 最新诊断，使用 PR #459 的只读取证工作流，首次从旧版只读脚本取回摘要；随后只修改审计分支 `audit/tm-oct10-startup-timeout-evidence-20261010` 的只读解析器 `scripts/inspect-tm-oct10-startup-timeout.py`，增加严格白名单输出 `deferredPreview`、`blockedPreview`、RSC page/cooldown stage，而不输出 URL、密钥或原文 HTML。该取证 job `38017717981` 成功。没有 R2、生产脚本或出版商请求写入。

ownerUpload.uploadedAt 1791599682203 = 北京时间 2026-10-10 10:34:42；运行 startedAt 2026-10-10T02:15:35.081Z，phase=cooldown_wait, scopeCount=228, total=38, visitedCount=4, attemptCount=4, success=2, partial=2, fullyResolved=2, pendingMissing=34, unresolvedCount=36, blockedCount=2, deferredCount=34, tocStored=2, figuresStaged=8, evidenceStored=1。云端 PDF 身份库存已验证：ready205、pending2、missing21、unknown0，不能把 pending 当已完成。TOC 31；正文图片暂存不代表公开发布。

四篇实际结果：
- JACS `10.1021/jacs.6c10578`，success，TOC 存储、正文图暂存 4/5，全文证据失败。
- Angew `10.1002/anie.3306470`，success，TOC 存储、正文图暂存 4/4、全文证据已存。
- Chem `10.1016/j.chempr.2026.103008`，partial，原 TOC 可用、正文图 8/8 已确认，owner PDF `private_pdf_http_403`，不能记 stored。
- Green Chemistry `10.1039/d6gc03748h`，partial，真实 `publisher_access_gate`。

`deferredPreview` 最多只含前 12 篇，12 篇均为 ACS（JACS、JOC、Organic Letters），共享冷却截止 epoch 1791600434420 = 北京时间10:47:14；ACS 冷却最初来源 DOI 未在最新日志明确记录，不能编造。RSC DOI `10.1039/d6gc03748h` 通过 pageState 7 次采样得到 `doiMatch=true;textLength=114/140;accessGate=true`，从10:28:27Z 到10:28:39Z 经过12秒阈值调用 `markPublisherAccessCooldown`，RSC截止 epoch1791601119409 = 北京时间10:58:39。无 RSC 实际 HTTP403 的直接证据，不能把页面访问门槛误写为 HTTP403。34 篇并非34次独立冷却，但其确切按出版社分布无法从仅12条预览证实。

## 源码确认

`public/toc-mainline.user.js`：
- `PUBLISHER_ACCESS_COOLDOWN_MS = 30*60*1000`，`markPublisherAccessCooldown` 使用 `publisher` 键存共享等待，导致一个 DOI 连带其他同出版社的 DOI。
- `waitForPairedVisuals` 在页面 accessGate 连续约12秒后直接标记出版社冷却、throw `publisher_access_gate`。
- `runManualFromHead` 循环检查 `publisherAccessCooldownUntil`，待办状态不消失，`cooldown_wait` 每次最多等10秒后再检查；“立即开始”不会清空同出版社 GM 冷却。
- `pageState` 检测 title+正文前16000字的 access 词；有正文但按钮文案包含 access 的页面存在潜在误报风险，不过**当前 RSC 这篇仅有114–140字符，不具备已加载完整正文的证据**，应优先视为真实访问验证页面，不能笼统声称是误报。
- PDF明确403走 per-DOI PDF独立策略，不应与出版社全域 TOC 冷却混同。
- 库存本轮存在 TOC 原生20s、随后 GM timeout；正文图、全文原生 deadline，沿用上次有效缓存。PDF库存虽耗时57s，完整已验证。库存传输不稳定为独立故障，也可能导致待办更新滞后。

## 对用户的当前答复（要点）

“不是34篇各自触发34次冷却，而是按出版社存了30分钟共享冷却。新日志证明 JACS、Angew 实际抓到2张主图、8张正文暂存，同时 Chem 的 PDF 403 和 Green Chemistry 的访问验证阻断仍存在；ACS至少12篇被连带到10:47，RSC被连带到10:58。库存读取的超时又加剧停滞。重复点立即开始不会解锁；保持控制页开启、有效会话和未暂停时，旧机制届时自动恢复；不能保证 Publisher 恢复了访问。拟议修复为严格证据分层：单 DOI 门槛不立刻封整个出版社；仅已证实全域限流才适用出版社冷却；合法访问限制与403仍严守，冷却期间其他出版社和已抓图补传优先，增加 publisher、触发 DOI、理由、截止时间、剩余任务数展示；并单独修复库存超时。当前仍需用户明确批准。”

## 审批边界

`PROJECT_RULES.md` 规定反馈修复先核实并获得批准；此次仅只读诊断与审计解析脚本 PR 分支变动，不包含采集生产代码修复、部署、媒体/私有 PDF 权限更改；发布时间严格北京时间08:00，范围为 addedDate>=2026-10-01。当前用户没有明确批准改变冷却逻辑。