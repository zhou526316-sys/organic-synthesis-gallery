# Tampermonkey current capture latency diagnosis

Beijing time: 2026-10-07 16:11:55 +08:00

Context: User asked at 2026-10-07 16:06:22 +08:00, “为什么现在抓去这么慢”. Bounded read-only investigation of latest automatic traces and current main source. No script changes, no deployment, no task restart. Local controller upload remains 14:37; no new user upload requested.

Related commits:
- Current code inspected: 19ddea046bfd856f46c2ec61cee569eec29307b0
- Existing deployed release: 7da30f3da331b91bc31fc42391f8d08f1f29790a
- New immutable diagnosis evidence: 9ece4d9ed88cbb0587a5169c222a38c8d8cdad81

## Full reply

查到了，**现在最明显的瓶颈是 PDF 上传超时，而且上传失败后还会换链接重新下载、再次上传。** 最新日志也确认 **2.2.62 已经生效**。[核查记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/9ece4d9ed88cbb0587a5169c222a38c8d8cdad81/audit/tampermonkey/2026-10-07-1606-upload-latency-diagnosis.json)

刚结束的两篇能看出问题：

| 论文 | 实际耗时 |
|---|---|
| D6GC04471A | PDF 下载只用了 **2.4 秒**，随后又等了 **3 分 2 秒**，最终上传超时。 |
| D6GC04772F | 两次下载都只用 **2–3 秒**，却重复取回同一个 PDF 地址；整篇任务用了 **6 分 31 秒**，最终仍未取得保存成功回执。 |

这些时间来自今天 **15:51—16:06** 的实际任务日志。[日志依据](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/9ece4d9ed88cbb0587a5169c222a38c8d8cdad81/audit/tampermonkey/2026-10-07-1606-upload-latency-diagnosis.json)

**为什么会拖这么久：**现有 PDF 上传先允许油猴请求等待 **90 秒**，超时后再用浏览器请求等待 **90 秒**；上传失败又会进入下一个 PDF 候选地址。队列逐篇执行，这些等待就会拖住后面的论文。上一版优化的是队列和库存读取，这段 PDF 上传逻辑仍保留上述等待方式。[代码依据](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/19ddea046bfd856f46c2ec61cee569eec29307b0/public/toc-mainline.user.js)

另外，日志里还有约 **4–5 分钟的篇间空档**，具体卡在哪一步尚未确认；上传超时究竟来自网络、扩展还是服务响应，也还不能直接定论。

**下一步最该改的是：把下载失败和上传失败分开处理，复用已经下载的 PDF，给上传重试设总等待上限，失败后继续下一篇。** 等待上限需要兼顾大文件，超时的 PDF 保留缺口，留待后续补抓。
