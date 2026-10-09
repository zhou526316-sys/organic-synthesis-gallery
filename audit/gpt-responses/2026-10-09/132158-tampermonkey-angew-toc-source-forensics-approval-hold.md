# 2026-10-09 Tampermonkey Angew TOC 误选风险诊断与批准等待

北京时间：2026-10-09 13:21:58 +08:00
任务上下文：用户接续 Tampermonkey，报告有 Angew 将底物拓展图作为 TOC，要求承接全部记忆并继续。
仓库：zhou526316-sys/organic-synthesis-gallery，main 唯一生产基线。本报告为反馈只读诊断/审批等待，不授权部署、变更数据或关闭反馈。

## 代码证据
- public/toc-mainline.user.js:2308–2372: wileyGraphicalAbstractCandidates 对 GA 标题容器内唯一图片提供 `wiley_ga_labeled_section_single_image` 的 `kind:'official'`、score 900；234? 行未强制匹配 DOI 证据。
- public/toc-mainline.user.js:665–668: `candidateBelongsToJob` 仅对 URL 中已提取 DOI 做 `.every`；没有 DOI 的 URL 亦通过，需结合文章绑定才安全。
- public/toc-mainline.user.js:4222–4227: official candidates 优先并存储。
- cloudflare/worker/src/local-captures.js:826–835: 官方图自动调 `importToc` 且传入 `replace:true`。
- cloudflare/worker/src/media-write.js:278–280: `replace:true` 会越过已有图片的 `already_cached` 保护。
- audit/gpt-responses/2026-10-09/130521-tampermonkey-site-media-qa-pr434.md: 10月9日显示修复验收、正式版本、四个缺图 DOI，browserRenderingVerified:true。
- audit/review-2026-10-09-0800.json: 当日已正式准入 Angew 两篇 10.1002/anie.4335022、10.1002/anie.5624001。
- PR #424: 未合并，处理不同 Chem DOI 103220 / 103282 的超时，不是四个当日 cache_miss 的验证完成。

## 尚未完成的证据
无法从本次环境读取 Gallery 实时像素/owner 浏览器私有回执来确认 Angew 具体出错 DOI、候选图片哈希与原始官方 GA 的逐图对照，因此只能确认代码存在误选条件，不能标记某一 DOI 的生产图片已错或已纠正。已完成显示端检查独立于抓取源正确性。

## 用户可见答复（同步原文）

已承接 Tampermonkey 的正式状态。PR #430、#431、#433、#434 已合并；北京时间 10 月 9 日 13:04 的正式浏览器验收通过（1,049 张自动发布正文图校验、8 篇卡片通过）。这只能证明已发布图片的显示链路，不代表新 TOC 全部抓齐。

**Angew 新问题已定位到代码层面的误收风险，但具体错误图片尚未取得逐 DOI 图像证据，因此未擅自覆盖生产图。** 当前 Wiley 选图器把“Graphical Abstract 标题区域只有一张图片”也直接记作 kind=official（来源 wiley_ga_labeled_section_single_image）；candidateBelongsToJob 对没有嵌入 DOI 的图片 URL 可直接通过校验；被判为 official 的本地回执又会调用 importToc(... replace:true)，可能覆盖现有 TOC。三处组合是正文底物拓展图被误认成 TOC 的可信风险路径，实际出错的 DOI / 图源仍要逐条核验。

10 月 9 日收录的 Angew 候选为 10.1002/anie.4335022 和 10.1002/anie.5624001；这不等于已经认定两篇都误收。用户反馈的 Angew 论文也可能是其他日期的文章。

截至已有的 13:05 验收记录，仍缺正式主图的四篇是 Chem：10.1016/j.chempr.2026.103008、10.1016/j.chempr.2026.103043；Chemical Science：10.1039/d6sc06407h；Green Chemistry：10.1039/d6gc03748h。它们需要真实的出版社来源抓取，不能拿 PDF 首页缩略图、底物拓展图或网页展示改动伪装成 TOC。PR #424 仍未合并，处理的是另外两篇 Chem 的 DOI 绑定超时，不代表这四篇已修复。

拟定的针对性修复（按 PROJECT_RULES.md 的新吐槽核验—批准门槛，目前等待批准）：
1. Wiley 官方 GA 只接受 DOI、文章区域、图片资产和真实 GA 语义相互印证的证据；拒绝把有 Figure/Scheme、substrate scope 等正文归属的图片因相邻标题、单图容器或无 DOI 的 CDN URL 升级为官方 TOC。真正的 Figure 1 替代图必须保留明确 fallback 标记。
2. 修改自动生产替换前的校验，禁止没有新增可信原始证据的 official 捕获无条件覆盖旧哈希；失败保留原图/状态和详细来源诊断。
3. 按 DOI 检查已发表 Angew 图源与正文图号；仅对确认误收者执行授权的隔离/替换，并从真实 Wiley GA 重新抓取；未获得可靠 GA 时显示缺项，不伪造成功。
4. 加入独立 Chromium DOM 回归：邻接 scope 图、真正 GA、同页面多图、交叉 DOI、无 DOI URL、已缓存官方图保护；安装版仍需本机 owner VPN 实抓回执并检查正式网页后方可宣布修好。
5. 四个 Chem/RSC cache_miss 另作定向采集诊断，维持 10 月 1 日起的 addedDate 范围；真实访问后顺带尝试编号正文图、完整 HTML 及 owner 私有 PDF；已有有效回执不重复抓取，不绕开出版社授权。

本轮仅查阅 GitHub 主线规则、代码和审计；没有修改 Tampermonkey/Worker/前端，不宣称实际抓到新图，没有重新安装、重置、删除/覆盖生产媒体。正式入口：https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js，已发布版本继续保持 VPN Bridge 2.2.73、TOC 6.2.54、Controller 2.2.41。

请批准上述 **Angew TOC 来源校验 + 确认误收 DOI 的定向修正**，我再开始实施，不扩大到其它核心发布机制。
