# Gallery 08:00 daily literature release repair — production recovery response
Beijing time: 2026-10-09 08:51:29; chat context: "修复每日新增文献的上线问题" → "快点修复好上线"
Repository: zhou526316-sys/organic-synthesis-gallery; branch main.
User-visible answer (consolidated):
今天（2026-10-09）08:00 的 28 篇已通过审核并写入权威生产数据，但 Pages 起初因自动正文图旧图片下载上游 HTTP 503 失败，网站依旧显示 887 篇。修复在 PR #425 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/425 合并后，保留唯一北京时间每天 08:00 生产准入，不新增第二发布槽，只重新交付同一份已授权数据。
正文图链路改动：优先复用经 SHA-256 校验的本地已发表图片；缓存不存在时对已白名单允许的存储 URL 临时 429/5xx/网络超时做有界重试，仍强制原有证据哈希/解码/静态资源校验，禁止未验证图片顶替。7 项离线回归及必需 Site quality gate 成功。
Pages 最新成功任务 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37866005953，已通过 34/34 build、Pages deploy、生产两来源验证。独立读取正式域名 https://gallery.gczhouwld.com/release-delivery.json 确认 publicationSlot=2026-10-09T08:00:00+08:00、productionCards=915、sourceCommit=5969791d7e80d4d61bb7ca65ecff12c541ba9193，按记录与审查 DOI 集合核对 28/28 均出现。main 的 audit/literature-update-state.json 已同步 lastWebsiteSync.deployment=success-live-verified、siteCards=915、pagesRun=37866005953、phase=synced_with_pending；11 个证据待审 DOI 继续暂缓，不能误认作漏发。
10 月 8 日发布时序补正：固定 writer 于约北京时间 08:41 成功，Pages run #37709096134 约 08:54 成功。之前误称“北京时间17:31”实际上源于 UTC 时区混淆。其发布延迟属于准备/审核时序风险，不应归因为今天的 HTTP 503；本次未改变现有 06:55/07:05/07:35/08:00 任务时段或常规审稿协议。
禁改区域：没有进行 off-slot 文献新增；没有变更正文图真实性要求、TOC/Tampermonkey/PDF 任务、文献目标范围或已暂缓 DOI。
Final to user:
**已修复并上线。** 现在正式网站上是 **915 篇**，今天 **新增 28 篇**，对应原定 **10 月 9 日 08:00** 批次，权威 DOI 28/28 在正式发布清单中核对成功，Pages 与 main 交付记录均标记 success-live-verified。
故障根因为旧正文图片回源 HTTP 503 导致 Pages 整个构建失败。已修复为优先校验复用现存 SHA-256 图片，仅在必要时重试临时网络故障，保留严格媒体真实性校验；这次实际部署通过了此前失败的步骤。
10 月 8 日并非 17:31 才上线：核实为 Pages 在**北京时间 08:54**成功，延误点是约 08:40 才启动的审核/写入。这是独立的排程风险，不能凭这次修复保证任何上游/审稿延迟都绝不会再发生；我会避免把未交付状态报告成已上线。
主站：https://gallery.gczhouwld.com/ ; Pages 记录：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37866005953 ; PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/425
