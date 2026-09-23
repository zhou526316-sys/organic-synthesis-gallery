# New captured figures versus quarantined historical media

Beijing context: 2026-09-23 approximately 14:51 +08:00. User asks whether current candidates are sealed historical images or freshly captured ones, and why new images are not easy to publish.
Read this turn: audit/media-recovery/body-batch2/manifest.json on feat/body-review-markers-batch2 (blob91cc2b7efb9cc54f3b7ef6d6c97b5ca730749710), main Worker index.js upload/promotion gates (blobd4df3160368957a433ea3bc3fb2819e19eb125c6), and feature-branch body-review-marker.js (blob4ce7707887d949d412e58060846095aed94ca36b).
The 35 candidate subset belongs to the new post-cutover staged inventory from the14:33 evidence snapshot. Approved manifest contains31 and holds four for a scope recheck, not a proven contamination finding. Example originalUpdatedAt1790143655917 converts to2026-09-23T14:07:35.917+08:00. Protocol6.2.20 alone does not identify a specific Bridge patch revision.
No production media, capture code, literature data or release gate is changed by this clarification. The feature marker explicitly leaves publicationApproved=false and pending_review; do not claim fully automated new-capture publication from that implementation.

## User-visible reply

**这次说的35张“候选图”，是现在重新抓取、已经存进R2暂存区的新正文图，不是清空／隔离全库时封存的旧图。** 我把“新抓但尚未发布的图”也称为候选图，容易让你误以为还在翻旧库存，这里应当明确区分。fileciteturn788file0L2-L2

例如本批JACS `10.1021/jacs.6c09678` 的Figure1，实际保存时间是**今天9月23日14:07:35，北京时间**；记录里已有对应文章页面、同DOI图片来源、任务编号和文件哈希。这批核验快照读取于14:33。fileciteturn788file0L2-L2

### 你说得对：新图应该更快上线

**当前主要卡在发布链路，而不是新图本身很难处理。** 恢复期间保留了“先暂存、不自动发布”的限制；我刚复查main，正文图暂存入口开放，但直接导入和暂存转正式发布入口仍被关闭。因此，成功抓图后不会自动进入卡片，还要通过另外的审核发布流程。fileciteturn789file0L2-L2

前面我把新图也按旧图恢复的节奏，逐批冻结、核对、打包，确实拖慢了上架。**旧污染图需要追溯来源；新图不应该每次都重新走同样一套历史追溯。**

应该分成两条路径：旧封存图继续做来源追溯和人工复核；新抓图在抓取路径验收合格的前提下，自动检查任务与页面DOI、图片归属、图号、实际文件和保存回执，合格的进入增量发布，只有来源不明、身份冲突、图号异常或存储失败的条目单独待查。这里的“自动通过”不能仅凭时间较新或一个`success`字段判断。

### 打标要直接服务于发布，不能只是多一个“待审”标签

你建议的标记应当对应**“已保存 → 校验通过／异常待查 → 已发布”**，并绑定具体DOI、图号、文件哈希和来源信息。同一张图重复抓到时跳过重复处理；图或图注变了才重新检查。

**目前分支里的实现已经能生成这些证据指纹，但仍把图片标成`pending_review`，没有自动批准发布。** 所以仅加上这个标记，还不能算新图快速上架的完整闭环；下一步重点应是把校验通过的新图接入增量发布，而不是继续扩大人工逐图待审队列。fileciteturn790file0L2-L2

另外，本批35张中准备发布的31张都是新图；另外4张暂缓是对应文献的收录范围复核，**不是发现这4张图片被污染**，也不应拖住其余31张。当前清单是在工作分支中，不能把“准备发布”说成“已经上线”。fileciteturn788file0L2-L2
