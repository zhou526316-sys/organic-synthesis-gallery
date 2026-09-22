# Uploaded local-log acceptance response

Context: TOC/article-figure contamination recovery; user supplied screenshots and confirmed local logs uploaded.
Evidence read at: 2026-09-22 21:58:16 +08:00.
Related diagnostic workflow commits: 6fe4a86906ace847e9047632331933233c1a1a17, 494dc3fb0e1f5f9e012c786fa8190a3c955d9c6d.
Evidence snapshot commit: 464eeef7d61626f201456a536c25fd951bc9373d.
The first public-endpoint runner read failed with HTTP 403. Authenticated R2 GET via the existing repository credentials then succeeded; no media assets, capture code, queues or production literature were modified. No raw credentials or signed query strings are recorded here.

## User-visible response

已经读到你上传的本地日志。结论是：你这次确实运行了 6.2.19 核心，截图显示的是旧摘要；新图片也确实抓到了。但仍出现了一条新的跨 DOI 任务错绑，所以现在不能宣布防污染验收通过。

### 截图里的 6.2.17，不代表你没有更新成功

你上传日志的时间是北京时间 21:51:20。上传端的 version 是 6.2.19；当时 Nature 出版社页面的心跳版本也是 6.2.19，正在处理 10.1038/s44160-026-01155-9。

截图中的嵌套 summary 则来自当天 14:49 开始、14:51 结束的旧批次。因此，里面的 success: 0、failed: 3、aborted: 1 都不能用来评价这次晚上的试抓。菜单读取的是上一次保存的批次摘要，而不是当前任务的实时状态。

### 新图片已经抓到，正文图链路也在工作

截至这次 21:58 的读取，以 21:00 后的媒体重建窗口统计，R2 里有 9 条新主图记录（7 条 official、2 条 Figure 1 fallback），以及 13 张正文图暂存记录，涉及 6 篇文献。这是重建窗口的库存统计，不是截图中那个旧批次的成绩。

三个具体样本：

| DOI | 当前正文图暂存记录 | 记录的尺寸 |
| --- | --- | --- |
| 10.1038/s44160-026-01155-9 | Figure 1–5，共 5 张 | 均为 685 像素宽 |
| 10.1038/s41557-026-02258-8 | Figure 1–3，共 3 张 | 685×453、685×441、685×866 |
| 10.1021/jacs.6c14159 | Figure 1，共 1 张 | 520×668 |

这 13 条暂存记录的 articleUrl 与所属 DOI 对得上，图号来源也与 label 相符。但暂存成功不等于网页已经展示，也不等于完成了逐图内容核验。尤其 Nature 正文图目前仍是 685 像素宽的版本；我尚未渲染图片并与旧图比较，不能保证它们比最早那批更清楚。

### 需要先处理的风险：今晚仍有串任务报告

北京时间 21:56:15，新报告出现了以下不一致：

任务 DOI：10.1021/acs.orglett.6c03921
实际扫描页面 DOI：10.1021/jacs.6c13517
结果：failed，原因 article_figure_resolution_low。

这条记录证明任务与页面又发生了错绑，但不能据此说错误图片已经写入。报告摘要也未提供该次尝试的脚本版本，因此还不能确定是残留旧标签页、并行脚本，还是恢复版中保留的任务绑定缺口导致。

所以，我之前“恢复链路已经完成、可以放心重抓”的判断过早：回退成功不等于防污染验收通过。接下来应先核实该次尝试的完整 trace，并补牢任务 DOI 与页面 DOI 的硬绑定，而不是直接扩大抓取。

另外，本地日志上传确实成功了，但导出的 traces 是空的。我在 Bridge 外壳中发现缺少 GM_listValues 权限声明，而日志导出依赖它枚举本地记录；这是需要修复的日志导出缺口。现在已通过 R2 报告索引取得了上述证据，不需要你再上传一次。

你现在只需中止后续自动批次，保留 2.2.19、写入密钥和已抓图片；不用卸载、清空存储或重复试抓。本轮没有删除任何新图。
