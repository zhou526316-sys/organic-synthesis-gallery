# Project response synchronization — current historical body capture coverage

- Beijing timestamp: 2026-10-15 19:27:38 UTC+08:00
- Conversation context: User screenshot of historical-text panel 0/0 and official catalog read timeout; asks why inactive and how far complete corpus text acquisition has progressed.
- Read-only investigation commit: 9eacb8adbb1bf15819d15b7069df3b802d002511
- No production capture code or data modified.

## Full user-visible response

从截图和 0.2.9 的源代码来看，这次确实没有正常开始正文抓取，首先卡在正式文献索引读取阶段。

截图里最关键的是：本地错误：正式文献索引请求超时。

这意味着脚本还没有成功取得完整的正式 DOI 目录，因此显示“已暂停、已尝试 0/0、本机新增 0”。0/0 不代表全库正文已经完成，也不代表全库没有可抓取文献，它只说明这次批次尚未建立。诊断报告服务器已确认仅表示事件上报成功，不表示论文正文已成功获取或上传。

“正在对齐正式 DOI 与本机正文台账…”是覆盖率统计查询，不是实际抓取进度。当前界面没有明确显示查询停在哪一步。

## 全库正文现状 — read-only source backed

生产目录最新 1151 个正式 DOI。2026-10-14 Europe PMC 旧代次来源扫描 1087/1087，发现47个 CC BY/OA JATS 科学结构候选；2026-10-14 OpenAlex 旧代次来源扫描1087/1087，222个TEI可用性线索。来源候选都不等于全文获准入库。

2026-10-15 19:21 北京时间管理员只读回查当前正式目录：formalDois=1151，verifiedDoi=0，verifiedSections=0，publicEnabled=false。昨日曾审核导入1篇Nature Chemistry论文6个章节，但属于旧 catalogId，当前代次查询没有承接；不能据此断言之前的章节已被物理删除。本机 IndexedDB 实际存量不在服务器可见范围内，截图中的0是当次运行计数。

## 0.2.9 的实际浏览器验收

最新管理员只读诊断出现12条0.2.9事件，对应8次独立尝试：出版社脚本未确认3次，许可还可能加载3次，许可未确认1次，等待超时1次，保存成功0次。涉及ACS、Nature、Elsevier。此样本太小，不能推算全库成功率，但说明新版诊断实际运行，抓取能力依旧存在阻塞。

## 可复核原因及待批准修复

0.2.9 先读取 release-delivery.json，再用 catalog-view 每页100篇串行读取当前正式 DOI，1151篇至少需要12个分页响应；单次GM_xmlhttpRequest为16秒超时，无有界重试，任一页面超时便可使整个批次停在0/0。覆盖统计必须等待全部分页和本机数据库读完才更新，缺少阶段反馈。18:33生产索引同步显示读路径已启用，但不能替用户浏览器的网络访问背书。

另一个代码级差距是章节FTS索引被 catalogId 和 DOI revision 双重约束；旧审核正文需做当前代次的一致性/授权核验后才可以受控复用。不得直接把私有本机正文迁移到公共搜索。

审计报告：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-15-browser-catalog-timeout-and-live-fulltext-coverage-diagnosis.md

本轮仅核查并留存证据，没有擅自修复或部署。建议批准一组限定范围的修复：修正正式目录分页超时后的有限重试和可见逐页进度；增加本机IndexedDB受阻/异常原因反馈并保障已有数据；经再次核验 DOI/revision/正文哈希/许可后承接旧代次已批准章节，并对当前1151篇重新运行完整来源覆盖扫描。仍不改变TOC、正文图、PDF、SI或每天08:00的发布，不设20篇全局上限。是否批准按这些范围修复？
