# First reviewed body publication — user reply

Beijing context: 2026-09-23 12:55 +08:00. Production acceptance completed 12:51:56.534; fresh versioned failure read completed 12:35:19.842.
Task: continue staged-to-visible body-image publication and actual failure tracking.
Production merge: 7c07d42a39efe417f2a044c20262dfe91509586c (#149).
Successful Pages deployment: 35819244510. Successful final actual five-card/32-file acceptance: 35819976537; artifact10733225765 SHA25663007ed4192562d8a03ea65ea8e7456dc2d730a44b484f9ee43a8192802348a7.
Detailed completed audit: 975678ab7077783c51276444acfe28d2cae84935, audit/media-acceptance/2026-09-23-125156-body-batch1-live.md.
No Tampermonkey version change, production literature edit, R2/D1 media deletion, staged-source mutation, or quarantine relaxation.

## User-visible reply

**第一批正文图已正式上架：新增30张，保留已有2张，这5篇文献的卡片现在合计显示32张正文图，不再只有TOC。** GitHub Pages主站已部署完成，并在**9月23日北京时间12:51**通过实际浏览器验收。fileciteturn787file0L2-L2

### 现在能看到正文图的文献

| 期刊 | DOI | 卡片正文图数量 | 本次新增 |
|---|---|---:|---:|
| JACS | `10.1021/jacs.6c14159` | 6张 | 6张 |
| Organic Letters | `10.1021/acs.orglett.6c03418` | 9张 | 9张 |
| JOC | `10.1021/acs.joc.6c01302` | 8张 | 8张 |
| Nature Chemistry | `10.1038/s41557-026-02258-8` | 3张 | 2张 |
| Nature Synthesis | `10.1038/s44160-026-01155-9` | 6张 | 5张 |

两篇Nature文献原来已有的Figure 1没有覆盖。**32个线上图片文件全部可读取；30张新增图的哈希与审核清单一致；5张实际卡片均显示了对应正文图，32张图片均成功解码。** 这次不仅检查了后台记录，也检查了真实网页。此前两批恢复的101篇官方TOC仍保留。fileciteturn787file0L2-L2

这里的数量是本批已核验并展示的图片数，**不表示已经证明这5篇的全部正文图毫无遗漏**。Nature这批仍是685像素宽的版本，没有把它们称作最高分辨率原图；ACS的SVG则保留原格式，没有统一转成低清位图。fileciteturn787file0L2-L2

### 暂存区没有清空，但这批已经可以展示

**本批采用“保留暂存原件，发布核验通过的副本”。** 因此，一张图仍在R2暂存区，并不代表它还没上线；上表这批已经进入公开卡片图集。其余尚未核验的正文图仍保持暂存，没有全库自动放行，也没有回退隔离时间。你不需要重新抓取这32张图来完成展示。fileciteturn787file0L2-L2

### 新版失败原因仍有未解决部分

最新报告确认：**2.2.23的同图重试已经实际生效，但上传503仍未根治。** 例如JACS `6c15781`的Figure 1、OL `6c03078`的Scheme 1，图片已经取得，提交暂存时却返回HTML格式的503错误页，而不是Worker正常的JSON回执；后续重试又出现网络传输失败。现在已有具体图号、时间、请求方式和Cloudflare请求标识，但仍缺少能确认后台根因的错误码，不能直接说是R2额度耗尽。fileciteturn787file0L2-L2

**这批先解决了“已保存的图无法展示”的一部分；上传503、Wiley的0/0发现失败和ACS的部分格式识别问题，仍是接下来的修复项。** 本轮没有为了掩盖失败而增加无限重试，也没有发布一个仅改版本号的新脚本。

你继续使用**2.2.23**即可，不需要重新安装或清空记录。查看效果时，先暂停抓取、等当前任务页关闭，再刷新唯一的Gallery控制页；上表文献的TOC下方应出现**“正文图片／Article figures”横向图栏**，可用左右箭头浏览。

[查看5张卡片的实测截图](sandbox:/mnt/data/body-live-accepted/cards-overview.png)　｜　[32张正文图的线上验收明细](sandbox:/mnt/data/body-figures-live-verification-20260923.json)
