# Tampermonkey 抓取与媒体发布接续：PR #465 阶段核验
北京时间：2026-10-10 14:20:15，项目：抓取有机合成文献并持续更新网页。
当前批准范围：2026-10-10 用户明确批准 A RSC、B ACS/Chem/PDF、C 库存与正式图片发布。
改动地址：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/465 ，分支 fix/tm-oct10-rsc-acquisition-paged-evidence-v1。此时仍是 PR，**不能声称已生产部署或已补齐 19 篇缺项。**

## 已有不可变证据
- 真实 owner 日志：2.2.79 / engine 6.2.60 / controller 2.2.41，33 DOI 实际访问、37 次尝试、14 篇确认补齐、19 篇未补齐，冷却等待 0；13 RSC 缺 TOC/正文图，4 Chem 访问验证，2 ACS 单篇故障；12 TOC 回执、63 正文图暂存、28 全文证据。PDF 库存最终 209 ready、12 pending、7 missing、0 unknown。详情见 audit/gpt-responses/2026-10-10/132739-tm-2-2-79-owner-complete-run-19-gaps-approval-hold.md。
- 源码失效点：RSC AJAX 只对两篇 DOI 硬编码；AJAX 内 ArticleId 数字资源与后续 host 过滤不一致；JOC 官方图片不可用后不尝试已验证 Figure1；全文库存一次性读取会超时；正文图最终完整采集包未必被正式媒体静态发布。
- **真实线上发布缺口**：DOI 10.1021/acs.orglett.6c03915 的 /api/article-figures/staged 精确返回 9 张（均 pending_review），/api/media/tampermonkey-reports 返回 final=true、9/9、toc=stored、PDF HTTP 403，/api/toc 有官方主图，/api/article-figures 为 available=false 且 []；正式 Gallery /media-index.json (generatedAt 1791602366646) 也没有该 DOI 条目。说明“抓到 != 公开发布”，不等于网页缓存问题。
- 公开 RSC 页面独立网络被 bot_blocked，不能用外部访问结果捏造真实 publisher 图源。必须靠 owner 已认证真实浏览器的未来抓取日志做生产验收。

## PR 功能变更
- Bridge 2.2.80 / engine 6.2.61，控制器 2.2.41、捕获协议 6.2.20 不变。
- RSC Silverchair Ajax 基于真实文章 DOI+ArticleId，同出版社会话；真实 articleId/SVG/object/source/numbered Figure1 图片源，排除跨 DOI、猜测 URL、PDF 首页预览、无 DOI/ArticleId 的普通网站图片；正式准入仍要经过完整后端验证。
- JOC/RSC 官方 TOC 候选不清晰或不可下载时，才尝试真正的 Figure 1 fallback，必须有生产回执。
- 私有 PDF 403 仍严格拒绝且不重复已存图片。失败界面区分访问验证、缺 TOC、媒体上传失败和 PDF403。
- 文本证据库存使用分页 cursor、逐页完成标志与重复 DOI 保护；中途超时不能当作已存或确实缺失。
- 伴随 TOC/PDF 访问而抓取的正文图，只有完整图包和最终采集报告、准确标签、同 DOI、合法图源、哈希和解码审核，才进入既有的合规自动发布流程；仍受 maxFiguresPerCard=20 / 当天 08:00 论文正式准入（媒体更新并非文献新增）限制。
- 保留已有 private-PDF 相关关键函数与授权门槛。已修正历史卡片 10→20 CI 基线误判并保留严格的现有 20 不变断言。

## 当前实际测试状态和后续
较早一个提交 27/28 回归通过，唯独过时 Target journal 测试失败。修正历史基线后，新的回归又发现 AJAX 的 ArticleId-only 银椅图片虽然同 DOI 验证通过，但单独的 hostname 白名单仍排除 CDN；现已针对确认证据修复并加反向测试，当前再跑全套 CI。**尚未合并 PR #465、未上线、未触发新生产抓取或宣称那 9 张正文图公开。**

待所有关键回归通过：在 current main 防冲突检查后合并；等待正式 Pages/Worker 部署；两域名在线安装包读回；通过既有的 new-body-continuous 正式媒体审核链路补发合格图包；读回 /media-index.json 和 /api/article-figures 验证示例 DOI 真实公开，再请用户在授权 Edge/Chrome 更新脚本并上传新的 13 RSC 取证日志。不能绕过 source/rights/hash 保护。
