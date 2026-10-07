# Tampermonkey 2.2.66 capture observability release

用户要求调整策略：不要优先隔离；有些论文确实没有独立 TOC，Figure 1 可以作为主图并永久接受；优先解决真正“什么都抓不到”和缺漏补抓。首先让代码对成功和失败都输出足够诊断信息，再基于真实反馈修适配。

本轮执行原则：
- 不新增失败隔离或减少抓取范围。
- 不把“暂时没有官方 TOC”本身视为必须不断升级的缺口。
- 优先增加可解释诊断，以后根据成功/失败实测证据修出版社适配。

已发布 Bridge 2.2.66 / install 6.2.47，CAPTURE_OBSERVABILITY_REVISION=20261007-capture-observability-v1。
新增自动回执信息：
1. 实际 base/resolved publisher route，以及 landing/full/articlehtml/ScienceDirect/Cell 等路由分类。
2. captureToc/captureFigures/opportunisticFigures/captureEvidence/opportunisticEvidence/PDF 的真实任务计划。
3. 页面 DOM 快照：正文长度、img/picture/object/figure/figcaption 数量、编号 Figure/Scheme/Chart 数量、visual meta、iframe、PDF link。
4. DOM asset 和编号 caption 的有限样本。
5. TOC 与正文图候选过滤统计：无 context、无 kind/label、PDF preview、重复、DOI mismatch、reject、accepted。
6. discovery summary：TOC 数、正文图 label/variant 数、是否跑 iframe fallback。
7. capture timing：总耗时、discovery、evidence、PDF 分段耗时。
8. 成功和失败 final report 均携带 observability revision 与 routePlan。
9. 不新增 terminal isolation policy。

专项回归成功：
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37626608639
Worker Deploy frontend assets 已成功，线上安装文件直接读取确认 @version=2.2.66、INSTALL_REVISION=6.2.47，包含 observability/dom/filter/timing/routePlan markers。

用户可见回复：

对，后续不再把“隔离失败项”当成优先策略。原则改为：**先抓到足够证据 → 判断为什么失败 → 修适配 → 再补缺漏**。

这次我已经先把诊断能力补上，而且没有减少抓取范围。新版每一篇无论成功还是失败，都会自动记录：
- 实际打开的是 landing 还是全文页；
- TOC/正文图/全文/PDF 本来要求抓什么；
- 页面里到底有多少 img、figure、figcaption、Figure/Scheme 编号和 visual meta；
- 找到了哪些图片资产样本；
- 候选到底因“无 caption/无 label/DOI 不匹配/被规则过滤/PDF preview”等哪一步被丢掉；
- discovery、全文、PDF 和总任务分别耗时多少。

这样下一次 RSC 出现 0/0，我们能直接看出是“全文页没打开”“DOM 有图但选择器没认出”“认出了但 label 规则拒绝”还是“下载/上传阶段失败”，而不是继续猜。

另外你说的 Figure 1 规则我认同：**论文确实没有独立 TOC 时，可用 Figure 1 就可以作为主图闭环，不需要以后为了升级成 official TOC 再反复抓。真正优先的是主图完全没有、正文图缺漏、全文/PDF 没抓到的论文。**

更新链接：
https://api.gczhouwld.com/gallery-vpn-bridge.user.js

更新后刷新 Gallery，让它正常跑 3–5 篇即可。随后回我“跑了几篇”，我直接读取新版自动回执，再针对真正的失败原因修下一小批，不再先做隔离。