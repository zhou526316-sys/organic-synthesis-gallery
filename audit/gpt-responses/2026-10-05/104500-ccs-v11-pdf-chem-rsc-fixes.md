# Response synchronization

北京时间：2026-10-05
上下文：Tampermonkey/VPN Bridge 支线，接续 CCS Chemistry 抓取能力、Chem/RSC 等待优化和 private PDF lease 修复；不触碰文献发现、审核或发布范围。

相关主线修复：
- PR #316 → PDF lease v3 + Chem/RSC interstitial wait，Bridge 2.2.45 / TOC 6.2.26
- PR #319 → CCS key-image persistence + CCS DOM figure order + fN/sfN guard，Bridge 2.2.46 / TOC 6.2.27
- PR #321 → CCS Crossref volume/issue route fallback，Bridge 2.2.47 / TOC 6.2.28
- current main merge for v11: f7aba857567c7cc293a9e419003a3ef51bd7ce43
- asset-only deployment run: 37256316361 (success)

## Final response

已接续完成，而且这次 CCS 的问题已经不是只“加等待时间”，而是把三个根因分别修掉。

1. CCS 官方 TOC/key image：真实日志已证明 v9 能找到 key image（例如 10.31635/ccschem.026.202608392 出现 key_images=1、official=1），但候选在下一轮 paired visual polling 被 live DOM 的空结果覆盖，最终错误变成 toc=not_found。v10 已改成 recoveredOfficialToc 持久化，找到后一直保留到下载/上传完成。

2. Figure 1 / Scheme 1：对 10 篇 CCS 的真实历史做了 427 个 label↔resource 交叉核验，没有出现 Figure 1→sf1 或 Scheme 1→f1 的硬性误标。CCS 的资源规律稳定为 fN=Figure N、sfN=Scheme N。真正的问题是正文图过去按 label 字母排序，导致 Figure 1 总排在 Scheme 1 前。v10 已改为 CCS 按出版社 DOM 原顺序保留，并增加 fN/sfN 交叉校验；caption 与资源类型冲突直接拒绝。

3. CCS 正式卷期文章：10.31635/ccschem.026.202607659 在 /0/0 和 /0/ja 都没有 key image；Crossref 明确给出 volume 8 / issue 10。v11 新增确定性兜底：通用列表无命中时，仅按 DOI 获取 Crossref volume/issue，并扫描官方 CCS /toc/ccschem/{volume}/{issue} 页面；结果缓存 30 天。Crossref 不参与文献发现、审核或收录判定。

同时 CCS 已禁用 Figure 1 充当 TOC fallback。旧的 figure1_fallback 不会被粗暴删除；新脚本抓到 DOI-bound 官方 key image 后会由官方 TOC 自然替换，避免修复过程中产生空卡片。

最终正式版本已发布并冷验证：
- Bridge 2.2.47
- TOC install 6.2.28
- publisherMediaRevision=20261005-rsc-elsevier-ccs-v11
- Crossref volume/issue fallback、key-image persistence、CCS DOM order、fN/sfN guard 全部在线
- asset-only deployment run 37256316361 成功，其余站点文件保持隔离

这一版还包含前一轮已经通过回归的修复：PDF lease 改成重复发送+ACK确认并记录无 token 诊断；Chem DOI 绑定等待最多 45 秒，RSC 最多 30 秒，真实 DOI mismatch 仍 fail closed。

当前真实客户端 CCS 回执仍停在旧 6.2.25/v9，所以尚未产生 v11 实跑结果。下一步只需要覆盖更新 2.2.47，刷新 Gallery/owner 页面，再重新授权 PDF；授权页面必须变成绿色“PDF 捕获授权成功”，然后点“立即开始任务（只补缺项）”。新日志验收时重点看 persisted=1、ccs_toc_route，以及 202607659 是否进入 /toc/ccschem/8/10。
