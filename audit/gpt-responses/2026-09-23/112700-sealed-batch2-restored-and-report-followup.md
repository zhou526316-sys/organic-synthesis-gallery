# Sealed-media recovery batch two — user reply

Beijing context: 2026-09-23 11:27 +08:00. Live acceptance at 11:22:51; automatic-report read at 11:15:44.
Task: continue tracking capture failures and recover more verified sealed TOC/main images.
Production merge: ee354d69c5acf1d64d6df651c1c3681592a77dcc (#146).
Successful Pages deployment: 35814017209.
Successful batch-two live verification: 35814084869, artifact 10730519077.
Detailed completed audit: f7fcf8a4a481d5f2ade2d526348490fc743baab4.
No Tampermonkey upgrade, media deletion, quarantine change or production literature edits in this recovery.

## User-visible reply

**第二批已经恢复上线：18 篇官方 TOC，加上 2 篇明确标注为 Figure 1 的主图。** 北京时间 **9 月 23 日 11:22**，已完成 GitHub Pages 主站部署和逐文件线上校验，不是只停留在恢复清单里。fileciteturn673file0L2-L2

### 这批恢复了什么

| 期刊 | 本批恢复 | 图片角色 |
|---|---:|---|
| Angew | 17 篇 | 官方 TOC |
| Nature Synthesis | 1 篇 | 官方 TOC |
| Nature Communications | 1 篇 | Figure 1 主图 |
| ACS Catalysis | 1 篇 | Figure 1 主图 |

**20 个线上图片文件全部可读取，20 个文件哈希全部与核验清单一致，失败 0 个；之前恢复的 83 篇 TOC 全部保留。** 本次发布索引中共有 **128 篇官方 TOC**，其中 **101 篇来自这两批封存图片恢复**；另外两张 Figure 1 不计入官方 TOC。这里确认了线上文件和索引，尚未逐张卡片做浏览器显示测试。fileciteturn673file0L2-L2

两张恢复的 Figure 1 分别属于 `10.1038/s41467-026-76235-7` 和你最早指出异常的 **`10.1021/acscatal.6c04593`**。后者只放回这张已核对来源、内容和哈希的图片，**没有把该 DOI 名下的历史媒体全部解封**。fileciteturn673file0L2-L2

### 封存图片已经开始发挥作用

这次的 17 张 Angew TOC 不只检查了图片文件，还逐一对应到污染发生前的抓取报告：文章 DOI、图文摘要来源地址、上传字节数和最终保存对象都能衔接起来。存在角色疑问的 `anie.5617321` 配体／条件筛选图仍未放行，其他证据不足的旧图也继续隔离。**隔离时间没有回退，旧图片时间戳没有被改成“新抓取”。** fileciteturn673file0L2-L2

例如，自动抓取仍报 `0/0` 的 `anie.8290035`、`anie.3685338`、`anie.5852828`，这次已利用核验通过的旧文件恢复官方 TOC，不必让它们的卡片一直等新版抓取器修好。不过，这不代表它们的正文图抓取问题也解决了。fileciteturn673file0L2-L2

### 最新失败报告仍在跟进

截至本轮 **11:15** 的服务器读取，已有 **44 个 DOI 留下自动报告**，比之前 10:36 核对时的 11 个增加了；这是报告覆盖数，不是成功篇数。新证据仍显示保存环节存在问题：OL `6c03279` 的 Figure 1 在 **11:13:22** 提交正文图暂存时再次返回 **503**。这属于保存请求失败，不能归成出版社图片不存在，也不能与下载地址的 403 混为一谈。fileciteturn673file0L2-L2

**接下来的修复优先级仍是：查清暂存接口 503 的具体响应，避免已取得的图片因上传失败而整篇重抓；再处理 Wiley 的图片发现问题。** 本轮完成的是旧图恢复和实际报告跟踪，没有宣称这些抓取故障已经修好。

你继续保留 **2.2.22、密钥和断点记录**即可，不需要再次安装或上传日志。查看恢复效果时，先暂停当前抓取、等任务页关闭，再刷新同一个 Gallery 页面，避免打断正在处理的文章。

[本批 20 篇图片的线上校验明细](sandbox:/mnt/data/sealed-media-batch2-live-20260923.json)
