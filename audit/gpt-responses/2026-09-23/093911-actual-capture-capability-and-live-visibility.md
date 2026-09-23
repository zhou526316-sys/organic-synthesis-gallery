# Actual capture capability and real-time visibility

Context: user asks 那他的抓取能力如何，能实时看到吗？
Evidence read Beijing time: 2026-09-23 09:39:11.572 +08:00.
Read-only workflow 35807151160, job 107010425564. Audit commit ac4b89b0d27ab41af6743a9e44ddf348379b7859.
This turn changed only the existing read-evidence trigger and audit logs. No capture, queue ordering, UI, media or publication changes; no continuing monitoring task created.

## User-visible reply

**这次已经有真实抓取成果：正文图确实在保存，不再是之前“连续开页、全部失败”的状态。进度可以看一部分，但目前还不是完整的逐图实时监控，正文图也不会抓完就立即出现在卡片上。** fileciteturn560file0L2-L2

### 这轮实际抓到了什么

我刚在 **9 月 23 日北京时间 09:39** 读取了最新上传日志和 R2 索引。你 **09:35 上传的快照**中，已有 5 篇返回结果，合计记录 **25 张正文图的成功暂存回执**：fileciteturn560file0L2-L2

| 文献 | 正文图：已暂存／脚本发现 | TOC 处理 |
|---|---:|---|
| JOC · `6c01270` | **4／4** | 保留已有 TOC |
| JOC · `6c01295` | **5／5** | 保留已有 TOC |
| JOC · `6c01302` | **8／8** | 保留已有 TOC |
| Nature Chemistry · `s41557-026-02258-8` | **3／3** | 保存了 Figure 1 替代图，不是官方 TOC |
| Nature Communications · `s41467-026-77963-6` | **5／7** | 未取得主图，正文图部分完成 |

这里的分母是脚本发现的图号数量，不是我已经对照出版社确认的全文总图数，也不能据此宣布全部图片内容、清晰度均已验收。后台还有更晚的记录：JOC `6c01559` 的官方 TOC 在 **09:37:40** 更新，其 Scheme 4 在 **09:38:54** 写入暂存索引，说明上传快照之后仍有图片继续保存。fileciteturn560file0L2-L2

**你前面看到的“打开已有 TOC 的 JOC”，这次日志也确认是在补正文图，而不是把原 TOC 重抓一遍。** 但它排在最新缺 TOC 的 JACS 前面，仍是另一个尚未修正的排序问题。fileciteturn560file0L2-L2fileciteturn554file0L2-L2

### 抓取质量现在处于什么水平

**ACS 正文图已有 SVG 抓取成功的实证。** 日志中既有矢量图，也有矢量与位图混合的 SVG，不再因为显示尺寸小就一律拒绝。不过，**Nature 这批仍主要拿到 685 像素宽的版本**，而且有一篇只保存了 5／7 张。因此，目前可以确认“能抓到并保存”，还不能称为“各刊都能收齐高清原图”。本轮核对的是日志与存储索引，没有重新下载每张图片做内容验收。fileciteturn560file0L2-L2

### 现在怎样看进度

**你本机能看到：** Gallery 右下角显示当前第几篇、正在处理的 DOI；Tampermonkey → **“查看最近运行摘要”** 可以看到当前任务和已经完成文章的结果，摘要会在每篇结束后更新。但弹出的窗口只是打开时的快照，不会自己持续刷新；目前也没有“正在下载 Figure 3、已保存 2／6、当前速度”这样的逐图面板。fileciteturn551file0L2-L2

**我这边能看到：** 已成功上传的报告，以及服务器最新的图片存储记录，刚才的结果就是这样查到的。但这不是实时看你的桌面；尚未上传的本机状态不可见，而且远端报告可能比图片保存滞后，不能只盯报告里的一个 success／failed。fileciteturn560file0L2-L2

**网页里的图片暂时不能边抓边自动全部显示。** 当前正文图回执仍是 `published=0`，即“已暂存、未发布”；这是展示链路尚未完成，不能把它误判为没有抓到。fileciteturn549file0L2-L2

现在不需要你再上传一次日志。下一步应补上自动刷新的进度面板，将“当前 DOI／图号、已保存数量、失败原因、最后更新时间、是否已发布”直接显示出来；这样才能直观看到它是在有效抓取，还是在等待或停滞。
