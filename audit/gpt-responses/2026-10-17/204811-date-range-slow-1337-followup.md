# 日期范围搜索长等待：截图证据与待批准优化范围

北京时间：2026-10-17 20:48:11
会话：gallary网页运营；用户继续反馈“过了很久才出来”，截图中仅起始日期2025-12-06、结束日期未填、当前筛选1337篇。用户此前说“搜索太慢了怎么解决呢？日期筛选一次只搜到24篇？”，当时已经要求单独批准检索优化；本条追加截图并未明确批准新修补。

## 只读核实
1. src/main.ts 默认 query为空，dateFrom=2025-12-06、dateTo空会先尝试 D1 /api/literature/catalog-view，传 dateFrom，并允许 dateTo空，返回 matched 等总数。若 D1暂不可用，回退 PublishedCatalogClient.rangePage(dateFrom, client.asOfDate)；static-date-page 仍返回 matched 完整匹配。
2. 当前生产全库计数1337来自之前的正式全库验收。本截图显示当前筛选1337，相当于全库；极宽开放式日期起始范围有可能覆盖全部馆藏，**不能据此认定日期筛选失效**；仍需核实最早发表日与当前日期的精确匹配统计。
3. shared/result-window.js 的结果窗口设桌面24/页、手机12/页。24为本页渲染量而非后端检索上限。UI currentScope 的1337是 matched，不是本页数；分页应在卡片下方展示总页数。
4. src/main.ts 日期 change 每次 resetResultWindow、persistFilterPreferences、mount() 重建整个根 DOM，再 scheduleArchitectureCorpusRefresh(0)，与前述登录表单 DOM 稳定性目标存在进一步优化空间。
5. src/main.ts loadIndexedViewPage 的 catalog-view D1响应被 await 后，仍 await client.resolveIndexed(response.items)，此过程要按 DOI 和revision校验正式发布的静态记录，全部准备完才 setArchitectureCorpus、更新结果计数；这是能解释“等待很久才出现最终1337”的可信链路，但没有用户本地瀑布图，不能断言其中某个网络请求就是实际瓶颈。
6. src/main.ts 旧网络路径带单域2.8秒deadline、备用 workers.dev、900/2200ms恢复等待；缓存 miss 或临时409会进入本地静态分片 fallback。architecture/published-reader.mjs rangePage 需按月 search shard 批量4并发取得完整匹配并加载一页文章对象。
7. 已核实公开定时生产搜索验收 #39032527288 的关键词请求约0.3-0.9秒且正常；**该数据不是用户2025-12-06日期查询的耗时**。当前运行环境无法访问 gallery/api 公共站点进行该特定日期的实时墙钟测量，不能假装实测。
8. browser list_tabs 中没有用户 Gallery 网站的直接可读标签；无法查看其开发者工具 waterfall 或在真实 Edge 保存凭据环境复现。

## 下一步优化建议，等用户明确批准才能修改
- 减少日期 change 对整个 root 的 mount()，只更新搜索状态和结果；合并短时间内两个日期输入的变更，以用户查询版本/AbortController 废弃过时请求。
- 将‘正在检索全库’和‘已知匹配总数、卡片加载中’分阶段、准确提示，避免从完全无反馈到过了很久才出现1337。
- 在不删除 DOI/revision/membership 校验的前提下，缓存/批量加载当前页已验证 article shards，避免重复访问；先测 API延迟、静态校验耗时、DOM渲染耗时及总体验。
- 仍采用桌面24/手机12篇默认分页，绝不能误把1337条都渲染到DOM；辅助显示“第n/m页，显示1–24/总数”并方便跳页。
- 必须覆盖 D1 200/409/503/timeout、历史Archive 日期范围、用户输入两端日期、中文输入、已打开登录表单的 DOM稳定性及浏览器账号自动填充 PR #740、移动端性能。所有质量门禁通过并核实才考虑合并部署。

## 拟对用户可见回复内容
截图的1337代表总匹配，不是一次渲染1337卡；24只是每页卡片窗口。只设2025-12-06为起始且结束不限的范围很宽，可能覆盖当前所有文献，但应再验证精确最早日期，不能由截图直接认定正确。加载耗时的主要代码层面疑点：日期change造成整个根页面mount()、D1结果先fetch后resolveIndexed逐页静态校验，以及D1失败时多个静态分片或API fallback。当前不能把0.3–0.9秒关键词验收当作用户的日期查询耗时。先做分段性能测量、日期交互合并/取消过时请求、页面局部更新、带校验的批量缓存；保留24/12分页。此截图本身未直接批准新代码修复，因此未修改业务代码。若用户同意可开独立PR回归后再部署。

资源：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/main.ts
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/architecture/published-reader.mjs
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/shared/result-window.js
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39032527288