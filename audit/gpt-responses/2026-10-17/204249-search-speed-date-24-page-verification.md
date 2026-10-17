# 用户反馈：Gallery 检索延迟与日期筛选仅显示 24 篇

北京时间：2026-10-17 20:42:49
会话：gallary网页运营 / PR #740 生产上线验收后的新反馈。
用户原话：搜索太慢了怎么解决呢？日期筛选一次只搜到24篇？

## 只读核实证据
- 当前 main 的 shared/result-window.js 设置电脑每页 RESULT_WINDOW_SIZE=24、移动每页 MOBILE_RESULT_WINDOW_SIZE=12。并非检索上限；后端 catalog-view 支持最多100行/请求，分页以 matched/limit、hasMore、nextCursor 表示，页面底部应该显示“第n/m页 · 当前显示a–b / 共x篇”。
- src/main.ts 的 renderCards() 把顶部 #resultCount 设置为 indexed.matched（或本地范围 total），而不是渲染窗口的24；若顶部报告24而非只显示24，需取得实际日期区间、页面总数和路径证据，不能自动解释为正常分页。
- 日期按 firstOnlineDate（首次在线发表日）筛选，不等于收入 Gallery 的 addedDate。旧记录缺乏精确日期时可能不包含。
- src/main.ts 约1200行：用户每改 dateFrom/dateTo 都会 mount() 重新生成整个主界面并 scheduleArchitectureCorpusRefresh(0)，日期起始/结束顺次选择可发起重复读取、重新建立用户组件，存在性能/登录DOM扰动风险。
- D1索引请求需要 GET CORS /api/literature/catalog-view。src/platform-api.ts canonical 超时时间 2.8s 并串行 fallback 到 workers.dev，src/main.ts 对临时失败可能再重试900ms/2200ms。失败可切换 static-segments。
- src/main.ts loadIndexedViewPage 收到D1索引 DOI/revision 以后仍 await client.resolveIndexed(response.items)，按 DOI 校验正式 immutable article shards；PublishedCatalogClient.resolveIndexed() 最高8并发并通过 revision/membership核验。不应为加速删除身份校验。
- src/main.ts 静态日期查询回退到 PublishedCatalogClient.rangePage；其读取每月 search 分片，每批最多4个并发，随后解析当前页 article shards，因而大日期范围回退可能慢。
- src/main.ts 的 goToIndexedResultPage 对尚无中间游标的远页跳转要从最近可用游标逐页读；可能导致页码跳转延迟。
- 最新 production browser live acceptance workflow #39032527288 电脑/手机成功，LMCT 13、手性磷酸22、轴手性40；从日志计算D1请求网络响应约0.34–0.90秒，不能代表整个渲染时间及用户中国/本地Edge网络。
- scripts/verify-gallery-search-browser.mjs 目前记录 API 和结果正确性，但并不持续汇总用户可见端到端渲染 p50/p95；主界面可通过 read-only dataset.catalogQueryRead / dataset.catalogSearchNetworkMs / dataset.catalogSearchTotalMs 辅助判别，但这些字段只有特定 D1 搜索后有效。
- 当前会话未取得用户实际筛选日期，不能得出那次仅有24篇属于正确总数还是异常范围。当前 tool 环境无法直接以用户Edge配置复现或打开站点网页。 

## 待授权优化计划（本轮不实施源码修复）
1. 前端仅更新日期筛选相关结果，不重新 mount 整个登录/主界面；对连续 dateFrom/dateTo 变化做合并防抖，取消过期查询；保留账户密码表单原DOM。
2. 对 D1 搜索、已验证 DOI/revision 内容，缓存与批量读取进行性能优化，严格保持官方摘要/完整文章的身份校验；统计 fetch/resolve/render p50/p95；禁止删掉哈希和代次校验。
3. 维持默认24/12，以防卡片媒体/控件过量导致更慢；若需求确实是一次看更多，可另行增加明确的每页24/48切换，按设备及测量决定，不强行一次渲染所有1337篇。
4. 检查深页跳转的逐页cursor代价，能否安全预取相邻页；静态回退必须明确提示“非D1结果”，不能把24张已显示卡片误当作完整结果。
5. 新增浏览器回归：日期大范围 matched >24，分多页可访问历史Archive；显示count为总匹配数；登录表单输入仍稳定；普通关键词/DOI搜索、移动态性能、401/403/429/409与回退逻辑不回归；先PR和CI后部署。
5. 按 PROJECT_RULES.md 最新反馈先核实后审批；用户本轮提问“怎么解决”未明确对这一批新优化授予修改源码/上线许可。本轮只记录证据与建议，未开优化代码分支、未更改生产。

## 用户可见答复内容（与实际回复同义）
已经核查：24为电脑每页、手机12；不是数据库仅搜24。若“共n篇，显示1-24篇”，底部分页可查看；若“全库匹配24篇”，要结合日期区间排查。
检索慢可能来自反复mount及两日期字段分别触发查询、D1完成后还要按DOI/revision校验静态记录、多页游标按顺序跳转和D1失败回退静态分片。线上CI的D1响应在300-900ms，不能断定用户体感网络是否慢。
建议先做低风险分层优化与日志测量，不默认把24提升至数百，不弱化文献完整性校验；需用户对该专项优化明确批准后再提交修补。

对应路径：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/main.ts
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/shared/result-window.js
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/platform-api.ts
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/architecture/published-reader.mjs
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39032527288