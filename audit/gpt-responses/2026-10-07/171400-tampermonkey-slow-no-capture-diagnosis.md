# Tampermonkey current slow/no-capture diagnosis

北京时间：2026-10-07 17:14 左右

用户反馈：“现在抓取很慢，而且怎么什么都抓不到？”

本轮仅做只读核查，未修改或部署抓取代码。已核对 2.2.63/6.2.44 后的最新服务器回执、当前脚本逻辑和最近本地诊断快照。

## 结论

确实有问题，而且不是单一问题。

1. 2.2.63 已实际运行。最新 RSC 任务的 diagnostic_context 显示 installRevision=6.2.44。
2. 当前单篇出版社任务本身大多不是特别慢：近期约 12–67 秒，最新一篇约 28 秒。真正的大延迟主要发生在“上一篇完成到下一篇开始”之间，近期可见约 2–6 分钟，个别更长。
3. 最新一篇在完成后，同一 jobId 的同一 final 结果被服务器重复收到多次。这些后续活动是诊断回执重传，不是下一篇论文抓取，因此界面可能显得“还在动”，实际队列没有前进。
4. 最近可见层（TOC）命中率极低：
   - 多篇 Nature Communications：全文已存、PDF 已有，但 TOC=not_found、正文图=0/0。
   - Nature Chemistry 一篇正文图 4/4 已成功，但 TOC 仍 not_found。
   - RSC：页面正文已加载且无 access gate，但 figure_discovery 多次返回 isolated_labels=0;variants=0；PDF 多次返回 HTTP 403。
5. Nature 任务中已有 Figure 1 的文章仍继续要求“官方 TOC”。如果官方 TOC 找不到，任务仍保持 unresolved，因此用户视觉上会觉得“什么都没抓到”，即使全文或 PDF 已经有。
6. RSC 正文图更像 DOM 识别规则与当前页面结构不匹配：脚本只接受特定 figure 容器/标题结构；实际页面有 2.7 万字符正文、无访问门槛，但连续扫描不到任何带编号图候选。
7. 当前服务器侧 local-diagnostics 仍是 14:37 的旧快照，无法从服务器判断 17:10 之后控制器究竟卡在 queue_refresh、retry_wait、租约、还是页面调度。需要用户再次上传本地 TOC 日志后才能把“篇间几分钟空档”的原因唯一定位。

## 建议下一步

请在当前 Gallery 页面：Tampermonkey → “上传本地 TOC 日志”一次。收到新快照后优先核对 summary.phase、controllerState、activeJob、lease、pendingPreview 和自动上报状态，再决定修复范围。

根据项目反馈审批规则，本轮不直接修改代码。