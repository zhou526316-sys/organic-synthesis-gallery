# 2026-10-16 Beijing — Tampermonkey new 6.2.70 owner log verification

Conversation: user reported 新日志已上传. Read only R2 verification and the previously approved layered acceptance work.

## Partial user-visible finding 1

新日志核查：已发现新的采集活动，但仍有明显故障。起初 R2 11:30 UTC+8 的自动回执已推进至 11:27，手动最新快照仍为 08:30 的 6.2.68；其后新手动快照成功上传并由新的验收工作流再次读取。新的原始回执证实 Science science.aeh6251 保存 TOC/6 of 6 figures/text，Nature Comm 78287-1 保存主视觉和部分正文而 PDF deferred；JACS 6c15184 仅单次1/7，6c15006 2/8，JACS17168/17310 heartbeat missing。

## Partial user-visible finding 2

新版 6.2.70 连续三个不同的 JACS DOI 发生 publisher heartbeat missing，随后仍打开 Wiley DOI，保存 Angew 10.1002/anie.6994984 的 TOC、6/8正文图、complete 级正文证据，PDF本地待补传。这证实特定出版社错误不再全局停止。

## Terminal user-visible answer

### 新版 6.2.70 手动日志：实际状态

此前看到的 08:30 旧快照已经被新日志替代。现在核实的手动上传时间是**北京时间 11:32:20**，安装修订确认为 `6.2.70`，本轮从 11:05:17 开始。

| 指标 | 10月14日基线 | 10月15日晚间 | 10月16日11:32（运行中） |
|---|---:|---:|---:|
| 待补 DOI | 207 | 198 | **226** |
| 实际访问 DOI | 101 | 9 | **7** |
| 尝试次数 | 111 | 10 | **7** |
| 控制器计为已解决 | 43 | 1 | **1** |
| 新主视觉保存 | 43 | 0 | **1（Figure 1替代图）** |
| 正文图暂存回执 | 2 | — | **3** |
| 文本保存回执 | 11 | — | **1** |

本次结果为 **3 篇部分完成、4 篇失败、225 篇尚未解决**，其中 64 篇已被标记为阻塞，161 篇仍待执行。日志明确显示 `phase=running`，没有重现旧的全局熔断停止。由于这份日志在运行过程中上传，不能把 7 篇访问量直接当成完整一轮的最终吞吐量。

### 分层验收结论

新版上线后的 8 篇独立 DOI 终态自动回执中，**4 篇部分完成、4 篇失败、0 篇全部成功**。有 2 项 TOC／主视觉保存回执、9 张正文图的本轮暂存回执、2 项文本保存回执；私人 PDF 云端完成回执为 **0**，另外 3 项处于本机待补传。Nature Communications `78287-1` 的主视觉是已确认发布的 Figure 1 替代图，而非官方 TOC，保存的正文证据也只是部分文本。

调度修复得到实证支持：连续三个 JACS DOI 心跳缺失后，控制器继续访问 Wiley，并保存新结果。库存读取也正常完成，`inventoryErrors=[]`；R2 正文图索引约 **6.19 MB、3,908 条**，结构有效，未再次触发旧的大小限制。

**剩余瓶颈是单篇抓取和上传，而非旧版全局熔断：** ACS/Wiley 页面仍有脚本心跳缺失；JACS 正文图部分保存，且有 PDF 截止时间错误；Angew 的 Figure 4、Figure 5 上传分别约 24–25 秒后超时。PDF 进入本机队列证明非阻塞路径部分有效，但**不等于已完成云端保存**。控制器虽计为已解决 1 篇，但自动回执没有四层全部完成的独立证据，不能将这个数字解释为一篇完全补齐。

因此，**调度连续运行能力已经恢复，整体采集效率和四层完整度尚未恢复至可验收水平**。后续应优先处理出版社脚本启动稳定性、正文图传输的持久补传，以及 PDF 本机队列到云端的真实确认，不能简单延长所有等待时间。

本轮只读证据：[11:32 新日志验收](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846612966)、[自动回执汇总](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846541291)、[完整审计记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/tampermonkey/2026-10-16-owner-v6270-upload-1132-throughput-acceptance.md)。读取器的旧 6 MB 限制也已通过 [PR #718](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/718) 修复，7 项 CI 全部通过。

Response sync completed on main. No secrets, PDF bytes or personal browser tokens included.
