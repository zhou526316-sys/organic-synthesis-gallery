# Tampermonkey 与 Gallery TOC/正文图显示继续任务 — 中间审核与用户答复同步

北京日期：2026-10-09，下午 12:22 左右
用户本轮请求：「继续」
仓库：zhou526316-sys/organic-synthesis-gallery，main 唯一基线
本轮为已批准的媒体读取/正文图出版/浏览器验收，不修改文献 08:00 唯一准入时刻。

## 本轮已经给出的用户可见内容（实质同步）

「生产部署进度：PR #429 Cloudflare Worker 正式部署成功，关联生产校验通过。新的正文图完成判定逻辑已进入服务器。可信 Nature/Science Figure1 允许与正文图配套发布但不冒充官方 TOC；owner 私有 PDF HTTP 403 与成功抓取的正文图互不影响，PDF 仍记失败。Worker 部署不等于正文图公开上线，继续核实 Pages 清单。」

「第二批正文图已正式上线：Pages 构建/部署成功，https://gallery.gczhouwld.com/auto-body-status.json 记录本批 96 张新增正文图、25 篇；其中 Science 10.1126/science.aef3001 的 Figure2-4 三张、Nature Synthesis 10.1038/s44160-026-01183-5 的 Figure2-5 四张；原有 Figure1 替代主图被保留。加上之前17篇98张，累计本次修复流程中两批194张正文图进入静态公开清单，不混淆其他历史媒体。」

「网页媒体自动刷新修复已合并：PR #430，main SHA 7d9ea4da8569ac34a71cabfef8eea2ed113b18eb，17项检查全部成功（包括 Required quality gate、WebKit/Chromium 分页、浏览器图像、前端构建）；长期打开标签页五分钟有界媒体清单有效期，且仅在确有后台→前台切换（至少1分钟）触发可见卡片检查。不插入后台间隔轮询、不无限拉取2MB媒体索引，网络失败保留可信旧图。此项已合并但生产 Pages run 37883090646 尚在构建，不能提前声称新 JS 已送达。」

## 已完成审计事实

1. PR #429 合并提交 a26565f035a0e70436db507f60673ac9031ecad4，Worker production deploy 37880582923 success。
2. 上轮 PR #426 修复自定义域名错误向静态站点 /api/media/batch 发 POST、只显示旧 TOC；main 和现场 Pages 已上线。正式 Tampermonkey 未变更：Bridge2.2.73，TOC6.2.54，Controller2.2.41。
3. Pages run 37880805112 build/deploy success。生产 status 1791518100884 证实本批 added96、publishedNewArticles25、totalPublicFigures1338、autoPublishedCount771、source stageError null。实际 media-index generatedAt 1791518325936，Science 四张（Figure1 fallback + 新2-4）和 Nature Synthesis 五张（Figure1 fallback + 新2-5）均在正式 media-index 的 publicationId 字段存在，图号、URL真实。
4. 对本批25篇逐篇匹配可信 Figure1：25/25 toc.reason='figure1_fallback'、SourceRepo Local VPN Collector、source windows-toc-collector、32位原图哈希等于同DOI Figure1哈希和镜像相同URL；不把替代图写成官方 TOC。
5. Chem DOI 10.1016/j.chempr.2026.103220、...103282 官方主图存在、正文7/14张已暂存，但是 stage.reviewMarker.state='needs_evidence' 和 opaque_source_needs_provenance，缺真实原始图片来源追溯；不能仅凭 PDF403 独立就无证据发布。JACS 10.1021/jacs.6c17387 正文图多于 protected maxFiguresPerCard=10，继续保护性待审，不改变 audit/media-auto-policy.json。
6. 老线上正文图验收 job 37881247315：675 个公开资产哈希通过、前5个卡片图片数量/解码通过，第6个 JACS 10.1021/jacs.6c17393 在20秒时图片数量不匹配；证据 ZIP new-body-auto-live-37881247315.zip，batch list和前5张卡在 acceptance.json，尚不可宣称真实浏览器25/25验收完成。
7. Pages run 37880805112 成功后，老验收 job 37882144516 因硬编码“必须官方 TOC”错误，把本轮合法 Nature Figure1 误判失败。已通过 PR #431（main 4944cdb66b46a278e11a48d394868942b30ea1af）修复只读校验：Nature/Science fallback 必须同 DOI、32位相同hash、同 URL 的唯一 Figure1 且来自 Local VPN Collector；不再误称 official。该脚本在快速切换卡片导致20秒等待超时时，仅补发一次滚动检查后限时12秒，仍失败则记录 DOI、DOM状态、真实图片数量和标题，保持 fail closed，不跳过实际解码。
8. PR #430 新增媒体索引5分钟 TTL刷新、上一份可信manifest保留、generatedAt单调、长时间回到前台触发，9项 Node 路由/缓存回归全部通过。首轮因首页不必要的 focus 事件令320px英文WebKit分页不稳（既往也有相同症状），已改为只在真实后台1分钟后 visibilitychange 恢复才触发；随后 WebKit、Chromium、交互、质量门禁17项全部成功。
9. PR #430 merge 7d9ea4da... 已触发 Pages run 37883090646，正在进行，未声称它已送达。完成后还须真实线上 readback 校验代码与媒体。

## 下一步
- 不重复启动或取消 Pages run 37883090646；按已有流水线验证最终 success。
- 完成后只读检查正式 gallery.gczhouwld.com 的媒体 URL、加密 hash 和运行中读图情况。
- 新的验证器在下一次 Pages 部署完成后触发，若仍有卡片失败则根据确切 DOI/DOM 状态定向修复。
- 原 Tampermonkey RSC0/0、Chem2 DOI controller_timeout 仍需新的 owner VPN 浏览器日志与实际访问证据，不能编造成功或绕过合法权限。
