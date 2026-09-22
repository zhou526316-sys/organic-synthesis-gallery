# TOC recovery batch 1 — user reply

Beijing context: 2026-09-22 23:29 +08:00. Live evidence checked at 23:24:54 +08:00.
Task: prioritize actual TOC recovery, independent of Tampermonkey upgrade.
Production merge: 8f43c8b8dd0ef23f7d67049fa5e5eede10dc5396 (#130).
Successful Pages deployment: 35746996957.
Successful per-file live verification: 35747156396, artifact 10703029696.
Detailed audit commit: ca99ef204b882e120bdebb41e538e08b77043849.

## User-visible reply

**第一批 83 篇文献的 TOC 已经恢复到 GitHub Pages 主站，并完成线上文件校验。** 这次已经部署成功，不是仅完成审计或放在工作分支。fileciteturn421file0L2-L2

截至 **9 月 22 日北京时间 23:24**，本批恢复情况如下：fileciteturn421file0L2-L2

| 期刊 | 本批恢复 TOC |
|---|---:|
| Organic Letters | 53 篇 |
| JACS | 23 篇 |
| ACS Catalysis | 6 篇 |
| Nature Synthesis | 1 篇 |
| **合计** | **83 篇** |

加上此前已经存在的 7 篇官方 TOC，**主站发布索引中现在共有 90 篇官方 TOC**。这是恢复原有卡片的图片，没有新增或修改文献卡片。fileciteturn421file0L2-L2

上线后，我又通过校验任务从主站逐一读取了这 **83 个图片文件：83 个可访问，83 个文件哈希与核验清单一致，失败 0 个**。本轮确认的是线上索引、图片可访问性和文件一致性，尚未逐卡进行浏览器显示测试。fileciteturn421file0L2-L2

为避免把错图一并放回，3 条疑似把正文 Scheme/Figure 标成 TOC 的记录仍未恢复；2 篇已移出收录范围的文献也没有重新放回。**21:00 的隔离规则保持不变，没有全库解封或改写旧图片时间。** fileciteturn421file0L2-L2

你现在可以刷新 Gallery 主站查看；仍显示旧状态时，再用一次 **Ctrl＋F5**。这 83 篇不需要 Tampermonkey 重新抓取。脚本暂时保持暂停即可，**正文图恢复和 2.2.20 升级没有随本批上线**；其余 TOC 仍待分批核验，当前不是全库恢复完成。fileciteturn421file0L2-L2

[本批 83 篇 TOC 的线上校验明细](sandbox:/mnt/data/toc-restored-live-verification-20260922.json)
