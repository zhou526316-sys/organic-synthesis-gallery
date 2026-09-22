# Actual-feedback acceptance of Bridge 2.2.19 — bounded continuation

Beijing time: 2026-09-22 23:05:12 +08:00.
Context: user requests continuing recovery and specifically checking actual 2.2.19 performance because only a few TOCs and no article figures appear.
Evidence: snapshot 2026-09-22 22:32:24 +08:00, workflow 35740744388, artifact 10699805219; SHA256 2fccf89bc0b92f6f0fbe933630fd80cd78024f820be5710314454dba8fa41b09.
Functional patch: feature branch fix/media-identity-v220 only; tested head 9feda06c2a014623c0b19b822929ce8d4bae54dc; workbench 35743882361 passed 21 identity and 9 staging tests. Draft PR129 remains unpublished.
Audit record: c539bad1a7524daac37297c3b04cd580a182e1e3.
Production media, code and literature mutations this turn: none. Main writes are audit records only. No quarantine epoch changes.

## User-visible reply

**已经按实际报告和图片文件核对。你的观察有依据：2.2.19 只能算“部分抓取成功”，正文图从暂存到正式入库、网页展示的链路没有接通。不是让它继续运行一段时间就能解决。** fileciteturn382file0L2-L2

### 这次到底抓到了什么

以 **9 月 22 日北京时间 22:32 的核验快照**为准，统计的是 21:00 隔离点之后的记录，不是之前截图里的旧批次：fileciteturn382file0L2-L2

| 环节 | 实际结果 |
|---|---|
| R2 主图 | 9 张：7 张官方 TOC、2 张 Figure 1 替代图 |
| R2 正文图暂存 | **16 张，涉及 9 篇文献；图片文件确实存在** |
| 正式 D1 正文图入库 | **0 张新记录** |
| 网页发布索引 | 9 篇有媒体记录，图集中只有 2 张 Figure 1 替代图，尚未接入上述 16 张正文图 |

所以，“后台有正文图”和“你在网页看不到正文图”可以同时成立。此前只报 `staged=1` 或 `success`，确实没有回答你最关心的“网页能否看到”。

### 已定位的三个主要问题

**第一，恢复时关闭了导入入口，但旧脚本仍先请求这个入口。** 在取回的报告中，33 次正文图正式导入尝试里，18 次返回 `503 media_rebuild_lockdown`，另外 15 次是网络请求失败；随后只有部分尝试走到 R2 暂存。这是之前恢复方案留下的衔接缺口，不是你的 VPN 或安装操作必然有错。fileciteturn382file0L2-L2

**第二，SVG 可以暂存，却不能按当前格式直接转入正式正文图库。** 新抓到的 16 张正文图中有 **7 张 SVG**，但当前正式导入函数只接受 PNG、JPEG、GIF、WebP。暂存成功和正式入库的格式支持不一致，必须修通，不能靠重复抓取解决。fileciteturn383file0L2-L2

**第三，全量重抓队列仍未更新。** 这次实际使用的队列生成于 **18:54**，早于 21:00 隔离；其中“完全没有主图”的队列只有 10 篇，并不是清空后针对全部 512 个 DOI 重新生成的缺口。因此它只补到少数 TOC，并不意外；“队列完成”也不能代表全库恢复。fileciteturn383file0L2-L2

清晰度方面也有实证：两篇 Nature 文献的 Figure 1 已经分别抓到 **1200×793、1200×1498** 的图片，但正文图流程又保存了同图的 **685×453、685×855** 版本。说明高清图选择确实需要改进，而不是简单把小图放大。fileciteturn383file0L2-L2

### 本批已经改了什么，还没完成什么

在 **2.2.20 的升级分支**里，正文图已改为直接走保留的暂存入口，不再先请求必定被关闭的正式导入入口；同时要求服务器回执中的 DOI、图号和存储状态全部匹配，明确区分“已暂存”与“已发布”。新增 **9 项回归测试通过**，原有 **21 项安全测试也全部通过**。**这是分支中的已测试修改，尚未部署，不能当作网页已经恢复。** fileciteturn383file0L2-L2

安全校验仍不能省略：完整 trace 已确认 **6.2.19 本身仍出现了两条任务 DOI 与页面 DOI 不一致的报告**。两条均失败，不能据此断言又写入了错图，但足以说明仅回退到旧核心不够，任务与标签页硬绑定必须保留。fileciteturn383file0L2-L2

旧图恢复也向前推进了一步：**优先核验的 93 条旧记录，实际文件全部取回，哈希全部匹配。** 但抽查发现 `10.1021/acscatal.6c05271` 有一条标成官方 TOC 的记录，其 caption 和图片来源指向 Scheme 1，需要单独复核。也就是说，除了跨 DOI 污染，还存在“同一篇文章把正文 Scheme 当 TOC”的角色误判，不能把这 93 条一次性全部放行。fileciteturn383file0L2-L2

**下一批优先解决“已抓图片怎样经过验证后正式显示”，再处理 SVG、高清选图和完整缺口队列。本批没有删除新图、重新上架旧图，也没有改动文献卡片数据。** 你这边保持现有脚本和密钥、暂停批量抓取即可，不需要再次上传日志或继续重复试抓。
