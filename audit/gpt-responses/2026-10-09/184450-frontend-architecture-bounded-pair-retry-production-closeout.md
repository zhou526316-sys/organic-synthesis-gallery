# Organic Synthesis Gallery 前端架构版本错配有界重试最终交付

北京时间：2026-10-09 18:44:50 +08:00
对话：界面优化主线；用户回复“批准”，授权在 Pages 版本错配时最多两次成对重读发布清单，保留 SHA-256 和所有强一致性约束。
唯一正式基线：main；仓库：zhou526316-sys/organic-synthesis-gallery。

## 实施范围、GitHub 证据
- PR #451：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/451
- 合并提交：d166652cc2ba3cb6cf7b0c6caa8024dcd49d0c15，已合并到 main。
- Pages 发布：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37918137789，literature_authorization/build/deploy 全部 success。部署日志明确 pages_build_version/sourceCommit 与合并提交相同，正式域名的内容校验记录 architectureVerified=true。
- 代码：architecture/published-reader.mjs 的 readVerifiedReleasePair 共用于 PublishedCatalogClient.open 和 loadPublishedHotFallback；初始正常读一对。仅发布清单—release 文件 SHA-256 或约束生成版本不一致时最多两次重读（间隔 160ms/360ms），两个 URL 使用相同 gallery_pair_retry nonce 并强制 reload；匹配哈希/目录 ID/sourceCommit/publicationSlot/datasetSHA/recordCount 后才返回；持续错配、内容伪造、其它 schema/DOI/权限异常 fail closed；AbortSignal 可终止。
- 回归：architecture/tests/published-reader.test.mjs 增加成对重读的有限成功、永久错配拒绝、无异常无需多读、两条读取路径一致、取消后无多余请求。39 项前端读取/分页相关回归通过（fail 0）。GitHub Site quality gate 8/8 检查 success。
- 影子浏览器严格验收：Gallery architecture shadow run #37917513472 success；Chromium 与 WebKit 都完成 915 篇卡片字段一致性、Hot 864 DOI 完整集合、51 篇 Archive 深链/搜索/收藏/状态/摘要、撤销数据保护，页面异常 0。影子测试夹具修正包括注入结果窗口常量、匹配当前新增但日期未知/未来的 Hot DOI 集合，以及模拟已上线手机号配置字段；没有因修复夹具放宽业务校验。
- 已对线上 https://gallery.gczhouwld.com/release-delivery.json 和 https://gallery.gczhouwld.com/architecture-v1/release.json 进行只读回读：两个 sourceCommit 都是 d166652cc2ba3cb6cf7b0c6caa8024dcd49d0c15，publicationSlot 为 2026-10-09T08:00:00+08:00、catalogId 相同，productionCards=915，且部署流水线 SHA-256 精确验证成功。
- 正式浏览器只读验收：run https://agent.tinyfish.ai/runs/952a8670-09a7-4ba4-8256-904c401b9d76，首页论文卡片/搜索恢复，未观察 architecture_release_hash_mismatch；精确搜索 DOI 10.1002/anie.4335022 得到 1 条结果，主图当前实时与镜像地址均能访问，确认资源哈希 6406e6533f718759721bdd09740e0845（非旧错误图 35f10c...）。但浏览器报告该论文搜索卡片的 TOC 缩略图视觉上只见标签、并未清晰呈现，虽然图源可显示，此项不纳入架构版控补丁，仍需前端另作复现与批准。不能因资源可加载就声称所有卡片图片渲染均已验收。
- 不改 Tampermonkey/采集任务、PDF权限、账号功能、收录DOI、私有媒体、08:00 唯一准入时刻，不恢复 18:00。没有创建替代发布任务或跳过 Pages 授权。

## 本轮用户可见答复持久同步

已获批准。我会只修改架构清单读取与哈希校验这一环节：首次校验不一致时，成对重新读取发布清单和架构清单，最多重试两次；每次仍必须通过 SHA-256 和发布版本一致性验证。随后补充回归测试，验证短暂版本错配可以恢复、持续错配必须拒绝加载，不触碰文献发布与媒体采集流程。

已按批准范围完成架构稳定性补丁，提交至 [PR #451](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/451)。修复针对 architecture_release_hash_mismatch 和发布版本不一致问题，包含最多两次重试、成对重读、严格校验和持续错配拒绝。正常读取不增加请求；仅检测到指定版本冲突才启动有界重试。当时自动化测试尚在进行，未合并生产。

测试确认 39 项架构读取及分页相关回归通过，失败 0 项；其中包括两条读取路径各自的错配恢复、三轮后严格拒绝，以及取消请求后停止重试。前端构建、TypeScript 检查、Worker 检查和生产 API 基础检查通过。

架构影子验收 Chromium/WebKit 均成功：两种浏览器各验证 915 篇文献卡片字段一致性；Hot 页面 864 篇 DOI 集合核对通过；51 篇归档的深链接、搜索及阅读状态、已撤销 DOI 的旧缓存保护均通过，页面 JavaScript 异常 0。期间修正两处过期测试假设及一处账号接口模拟问题；不改变文献内容或放宽完整性校验。

PR #451 已成功合并至 main，提交为 d166652c，正式 GitHub Pages 任务 #37918137789 自动创建；未修改北京时间每日 08:00 的唯一文献发布安排。Pages 授权、媒体完整性、响应式分页、Hot/Archive、账号/PDF 兼容门禁依次完成且未跳过。

PR #451 的正式网站部署已成功。GitHub Pages 发布任务 #37918137789 的授权、构建和部署三个阶段全部 success。线上 release-delivery.json 和 architecture-v1/release.json 均指向 d166652c，同一出版日期与目录ID；正式浏览器加载论文列表和搜索正常，未再出现 architecture_release_hash_mismatch；DOI 10.1002/anie.4335022 的主图资源可读取。另一次浏览器检查中搜索卡片 TOC 缩略图只显示标签，没有清楚显示图像，此为独立前端待核实项，不擅自扩展架构修复范围。一次正常复验不等同于保证今后再也不会遇到瞬时发布版本冲突。

## 本轮最终用户可见结论

**本项已完成上线并通过正式网站验收。** PR #451 已合并，GitHub Pages 正式部署 #37918137789 全部成功；在线两份架构清单与提交 d166652c 一致，正式浏览器能正常显示论文卡片、搜索及 Angew 搜索结果，没有再次出现架构哈希错配。重试仅在检测到指定异常时出现，最多两次，并且每次都严格执行 SHA-256 与版本校验；持续错误仍然拒绝加载。此轮不涉及文献发布时段、PDF 权限或 Tampermonkey。

**待独立核实的界面现象**：浏览器曾见到 Angew 搜索卡片的 TOC 缩略图仅显示标签，但图片 URL 本身可正常打开。因此，架构稳定性修复可以结案，不把这一观察冒称 TOC 展示已彻底解决。

审计同步链接：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/gpt-responses/2026-10-09/184450-frontend-architecture-bounded-pair-retry-production-closeout.md
