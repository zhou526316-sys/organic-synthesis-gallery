# New body31 publication and real marker acceptance — user reply

Beijing context: 2026-09-23 15:40 +08:00. Live acceptance completed15:32:19.132.
Task: continue NEW captured body-figure publication and capture-time evidence marking.
Production merge a0e6bd9b13d9eac5a5c63a30e8bab4e2b5810242, PR156; superseded PR153 closed unmerged to preserve concurrent mainline implementation.
Pages deployment35831989386 success; actual31-file/six-card verification35832144972 success. Artifact10737847145, independently checked SHA256764b2d383b2ff5ff17518831415bb5925e332f15272ec4450b6265b37cf2e0de. Completed audit b1c6f0af2e4e6e7e390e73706456121b57f6c4d5.
No new installer, no old quarantine relaxation, no production literature changes or R2 deletions. Fully unattended first-time publication remains unfinished and is not claimed.

## User-visible reply

**这 31 张新抓的正文图已经上架，6 篇 JACS 的卡片均已通过真实浏览器验收。抓取时的标记也已在真实上传记录中验证有效，不只是代码测试通过。** 本次线上验收完成于 **9 月 23 日北京时间 15:32**。fileciteturn827file0L2-L2

### 本次新增上架

以下全部是重新抓取的新正文图，不是历史封存图片：fileciteturn827file0L2-L2

| JACS 文献 DOI | 本次新增正文图 |
|---|---:|
| `10.1021/jacs.6c09678` | 5 张 |
| `10.1021/jacs.6c08663` | 7 张 |
| `10.1021/jacs.6c14433` | 5 张 |
| `10.1021/jacs.6c09019` | 9 张 |
| `10.1021/jacs.6c16732` | 3 张 |
| `10.1021/jacs.6c16373` | 2 张 |
| **合计** | **31 张** |

**31 张线上图片的文件哈希、所属 DOI、图号标签均与核验记录一致；6 张卡片均显示正文图，31 张图片全部成功解码。** 主站发布索引中的正文图由此前的 **35 张增加至 66 张**，此前恢复的 **101 篇官方 TOC** 保留。数量指已发布图片，不代表这些论文的全文图集已经全部收齐。fileciteturn827file0L2-L2

### 你建议的“抓取时打标”，已经有真实记录

这次服务器读取发现 **7 条新正文图记录已经带有标记**。我抽查了 JACS `6c13989` 的 Figure 3 和 Figure 5：不仅有标记，还重新读取了实际图片，确认文件哈希和来源、图注等信息生成的证据指纹一致。这里的 7 条是带标记的存储记录，不是 7 篇论文或 7 张已发布图片。fileciteturn827file0L2-L2

**标记写在图片记录里，不是在图片上加水印。** 它绑定 DOI、图号、文件哈希、来源和图注；发布账本再记录这张具体图片是否已经上线。同一图片和证据再次出现时可以复用既有核验结论；图片、来源或图注发生变化时，不能冒用原来的批准记录。这样后续可以按具体记录处理增量，而不是反复追查整库。fileciteturn827file0L2-L2

**但“所有合格新图抓完后自动上线”这一段还没有接通。** 当前真实新标记仍是 `pending_review`，接口也明确返回 `publishedAutomatically=false`。本轮完成的是 **31 张新图正式发布，以及真实抓取标记验证**，不能把它说成已经实现无人值守自动上架。剩下的重点是将无异常新图的校验结果接到增量发布，而不是继续把新图当旧污染图重新追溯。fileciteturn827file0L2-L2

本批没有发布新脚本，**不需要为这 31 张图重新安装 Tampermonkey 或重新抓取**。查看效果时，等当前文章任务结束、暂停抓取后刷新同一个 Gallery 页面即可；正文图位于 TOC 下方的图栏。暂存原件仍保留，未清空，也没有解除旧图隔离。fileciteturn827file0L2-L2

[查看 6 张卡片的实测截图](sandbox:/mnt/data/new-body31-live/cards-overview.png)　｜　[31 张新正文图的线上验收明细](sandbox:/mnt/data/new-body31-live-verification-20260923.json)
