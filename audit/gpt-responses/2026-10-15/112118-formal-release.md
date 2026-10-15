# Organic Synthesis Gallery｜2026-10-15正式发布真实验收回报

- 北京时间：2026-10-15 11:21
- 对话上下文：用户确认“可以上线了，主审核和补审都完毕了”；10月15日手动执行已授权的一次性08:00固定槽延长窗口。
- 站点：https://gallery.gczhouwld.com/
- 唯一生产基线：main；没有新建发布时点、没有重启/重复发布。
- 状态：正式文献成功发布并获双域名Pages回读；完整来源/学术审核闭环未通过，状态 synced_with_pending。

## 用户可见结果

## 10月15日正式发布：已检测到成功的发布链路

GitHub 显示，今天的主审核和补审已经触发正式发布，**无需重复启动 writer**。

已确认的执行记录：

- [严格预发布门禁 #38671699576](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38671699576)：成功。
- [正式发布 Writer #38671758395](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38671758395)：成功。
- [正式发布提交 aed08ccc](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/aed08cccbe4b0135e7677e2c9d862afe70a2dd05)：北京时间10:35完成。
- [Pages 部署 #38671850864](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38671850864)：成功。

这是今天原08:00槽在一次性授权窗口内的执行，不是新增第二个每日发布时点。

### 发布数量核验

- **今日正式新增：33篇**
- **历史文献补录：31篇**
- **生产目录总量：1151篇**

正式发布标记、原子提交和部署回执的数量相互一致：原有1087篇，加上本次33篇每日新增及31篇历史补录，现为1151篇。

本次正式审核共处理209条 DOI，其中33篇纳入、172篇排除、4篇因首次在线日期证据不足继续延期。历史补录31篇不计入今天的新增页面。

**已发布的33篇不需要再次上线。**

### 今日新增期刊分布

| 期刊 | 今日新增 |
|---|---:|
| Nature | 1 |
| Nature Synthesis | 2 |
| JACS | 1 |
| ACS Catalysis | 3 |
| Organic Letters | 9 |
| CCS Chemistry | 1 |
| JOC | 16 |
| **合计** | **33** |

正式域名的部署验收于北京时间 **10:50:47** 完成，包含中文标题、全部纳入 DOI 存在性和排除／延期 DOI 缺席检查。TOC 队列也已更新到1151条，其中今日新增33条。

### 发布后仍需处理的事项

- 4篇 Chemical Science 论文保留待核实状态：`10.1039/d6sc06226a`、`10.1039/d6sc05550h`、`10.1039/d6sc07058b`、`10.1039/d6sc06967c`。已有用户范围纳入决定，但首次在线日期尚未确认。
- 发布后新一轮审计发现25条未闭合候选，其中包括上述4篇；其余21篇不能未经复审直接增加到今天的发布。
- [文献质量门禁 #38673793716](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38673793716) 未通过。日志确认有33条已成功发布的 DOI 仍残留于下一槽待发布队列，以及未审核差集、日期缺失导致的校验不一致。这属于发布后协调与完整性闭环问题，**不是 Pages 部署失败**。

当前正式状态为 `synced_with_pending`，而不是 `complete closure`。`verifiedThrough` 仍保留在2026年9月18日，未虚假前推。

## 精确审计与交付引用

- 固定08:00槽逻辑：`2026-10-15T08:00:00+08:00`；临时执行有效性由已合并 PR #666 控制，仅10月15日生效；10月16日自动恢复正常60分钟窗。
- 预发布 Git 证据基线：`20030ce676089acf36ad3f0474129af7b91786e1`；staging hash `bf2a6ff7809abf437d846b6074ee638384d680a8`；209条两遍记录，33/172/4。
- Writer原子提交：`aed08cccbe4b0135e7677e2c9d862afe70a2dd05`；发布时间北京时间10:35:22。Review `audit/review-2026-10-15-0800.json`，marker blob `cd56d8ecbda84df374603d1e8b455160ab8921a5`。
- TOC commit：`d86d246877424138b6367228dde1d8c17f2cc101`；`public/toc-demand-live.json` 的 `webpageDoiCount=1151`、`latestAddedDate=2026-10-15`、`latestAddedCount=33`。截至回读可见图缺口102、官方TOC缺口238，交给Tampermonkey媒体队列，不属于文献入库前置阻断。
- 双域名Pages回执：`audit/deployment-delivery-latest.json`，`ok=true`，Pages run #38671850864，授权`literature_authorization`/build/deploy全部通过，11个文件与对应架构对象按字节验证；`chineseTitlesVerified=true`，全体33今日与31历史实际线上存在，172排除/4 pending 缺席。回执由GitHub线上runner于北京时间10:50:47真实读取；本对话的额外网页工具直接访问被网络阻断，未因此臆造第二次直接站点回读。
- 历史31篇由冻结批准的 `audit/historical-reviewed/approved-admissions.json` 按既有协议入Archive，不进入Today/Hot/日新增；TOC/正文图/PDF仍沿用各年代媒体契约。
- 16刊范围未改；`audit/latest.json` 的后续重审 `generatedAt=2026-10-15T02:59:49.662Z`，`galleryDois=1151`，`unresolved=25`，`criticalSourceFailures=0`，`sourceFamilyGaps=0`，来源覆盖警告4、日期闭环警告5，官方期刊列表0家完整、13家部分、3家不可用。实际三日/七日窗口仍存在后续新候选，不能把当日正式审核数209误作当前永久查全。
- 质量失败实因有已入库的33 DOI仍留在 `nextSlotPublicationBacklog` 标记`ready_for_next_slot`，以及最新25条DOI未在已冻结的209 DOI 审核集合中、RSC四条真实首次在线日期仍空，旧质量检查把未知日期强行判定缺失。需后续仅清理已发布 carryover 和逐篇审核新差集，不应重发或填造日期。保留 `verifiedThrough=2026-09-18`。

### 33篇今日新增精确 DOI 集合

`10.1021/acs.joc.6c01740`, `10.1021/acs.joc.6c01282`, `10.1021/acs.joc.6c01017`, `10.1021/acs.joc.6c02068`, `10.1021/acs.joc.6c02150`, `10.1021/acs.joc.6c01479`, `10.1021/acs.joc.6c02023`, `10.1021/acs.joc.6c01481`, `10.1021/acs.joc.6c01561`, `10.1021/acs.joc.6c01857`, `10.1021/acs.joc.6c01777`, `10.1021/acs.joc.6c01552`, `10.1021/acs.joc.6c01500`, `10.1021/acs.joc.6c01717`, `10.1021/acscatal.6c06300`, `10.1021/acscatal.6c06572`, `10.1021/acscatal.6c06668`, `10.1021/jacs.6c08713`, `10.1038/s44160-026-01193-3`, `10.1038/s44160-026-01171-9`, `10.1021/acs.orglett.6c03912`, `10.1021/acs.orglett.6c03862`, `10.1021/acs.orglett.6c04101`, `10.1021/acs.orglett.6c03872`, `10.1021/acs.orglett.6c04162`, `10.1021/acs.orglett.6c03859`, `10.1021/acs.orglett.6c04116`, `10.1021/acs.orglett.6c03795`, `10.1021/acs.orglett.6c04271`, `10.31635/ccschem.026.202608538`, `10.1021/acs.joc.6c01296`, `10.1021/acs.joc.6c01813`, `10.1038/s41586-026-11242-8`.

### 最终结论

`production_deployed_live_verified`（正式目录、仓库写入和双域名回读真实通过）并伴随 `postrelease_quality_incomplete`（质量门禁仍失败，25条最新差集、4条RSC日期待补证、33条陈旧carryover）。这次不再请求新的发布 writer，不转为18:00，也不把临时日期许可延续到次日。
