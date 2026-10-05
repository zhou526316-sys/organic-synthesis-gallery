# GPT response sync

- Beijing time: 2026-10-05 16:20 +08:00
- Context: Gallery architecture recall → audit → recall → authoritative rules
- Related functional commit: 8cf94ddd3cef7f2be964fc4cd95ba5381258a6aa

## User-visible reply

对。你记得的是这套架构最重要的第一层，而且它现在已经在 `main` 实际生效了。更准确地说，核心不是“把三个月前的文献删掉”，而是把 **all-time truth（全量事实）** 和 **browser working set（浏览器工作集）** 永久拆开：近三个月是 Hot，三个月前是 Archive，Archive 仍完整保留、可搜索、可 DOI 直达，只是不再跟着首页一起加载。

### 1. 先回忆：我们当时真正要解决什么

三个月冷热分流的目的确实是防止网站随着几年文献积累后越来越重。规则不是 90 天，而是按北京时间计算 **D − 3 个自然月，边界日包含在 Hot 内**；例如 2026-10-05 的 Hot 截止线就是 2026-07-05。月底不存在对应日期时按目标月最后一天钳制。

后来这条主线又扩展成了几个同一性质的问题：历史文献不能全量进 DOM；历史搜索不能永远扫完整个历史库；用户收藏/状态不能永远塞在一个越来越大的 JSON 里；PV/UV 统计不能每次扫全部原始事件；Evidence/摘要交接也不能依赖有固定页数上限的 R2 prefix scan。它们本质上都遵守同一个原则：**历史总量可以无限增长，但日常请求的成本不能跟着无限增长。**

### 2. 当前 `main` 审核结果

| 层 | 当前状态 | 审核结论 |
|---|---|---|
| 首页文献 | 已启用 Hot/Archive | 正确：首页只加载滚动近三个月 |
| Archive | DOI locator + 月度/容量 shard 按需读取 | 正确，不等于删除 |
| 全量身份 | 独立 all-time membership | 正确，不能由 Hot DOM 推断缺失/撤稿 |
| 首页首框 | 只保留最新收录日期 | 正确，不再显示文献总数、期刊数 |
| 图片 | 近视口批量加载、正文图 lazy load | 正确，可继续沿用 |
| 全库搜索 | 浏览器逐个扫描历史 search segment；最多返回 1000 条 | **存在长期规模风险** |
| 历史日期范围 | 只扫相关月份，但可一次 resolve 很多 DOI | **存在长期规模风险** |
| 卡片 DOM | `renderCards()` 仍把当前结果集全部 `map()` 后一次写入 DOM | **这是目前最需要补的第二道闸** |
| 架构失败 fallback | 仍会加载 legacy 全历史 corpus | **现在可用，未来不能作为最终 fallback** |
| 用户文献库 | D1 行式读取已经上线；旧大 JSON 仍是写入权威且有 1.5 MB 上限 | 读侧已扩容，D3c 写侧仍待完成 |
| 站点统计 | 原始事件保留，正常读走 D1 materialized aggregates | 正确，是我们应该复制的扩容模式 |
| Evidence / handoff | R2 保存字节，D1 保存可查询元数据，持久 cursor backfill | 正确，已消除部分固定 prefix-scan 上限风险 |

所以你原来的判断没有错，但现在要补一句：**三个月冷热分流只能保证“打开首页”不会随历史总量失控；如果搜索一次把 1000 张卡片全塞进 DOM，或者架构故障后 fallback 又把全历史库加载回来，还是可能把这个优势抵消。**

另外我还标出了一个次级增长点：当前页面会维护 all-time DOI registry，并在渲染时同步到页面。它目前不是主要瓶颈，但以后不能让它演变成每次 UI 更新都复制数万 DOI 的路径；在碰它之前要先确认 Tampermonkey 等消费者依赖，不能贸然改。

### 3. 再回忆：这套架构后来形成的底层思想

真正的架构模式已经不是单纯“冷热数据”，而是四组分离：**全量事实 ≠ 页面工作集；大字节对象 ≠ 可查询元数据；原始事件日志 ≠ 在线统计查询面；迁移中的新索引 ≠ 立刻成为权威。**

因此过去几轮才会一直采用同一种迁移方法：先建立 shadow/index → 完整 backfill → 新旧结果 parity → 开启新读路径 → 保留 fallback/rollback → 最后才考虑退出旧路径。这个方法应继续作为 Gallery 的统一扩容方式。

### 4. 现在正式确立的架构规则

1. **Hot 固定为滚动三个自然月**，按首次在线发表日期和北京时间计算；不是 90 天。
2. **Archive 永不因“变冷”而删除**。Hot、DOM、搜索子集、缓存和任务子集都不能证明 DOI 不存在；删除只能来自显式 scope correction / withdrawal 权威路径。
3. **首页只吃 Hot**；Archive 通过 DOI、搜索、期刊/日期筛选等按需读取；首页首框继续禁止恢复“总文献数/总期刊数”。
4. **必须增加第二道硬边界：结果窗口化。** 搜索和长日期范围不得把无界数量卡片一次插入 DOM；必须分页、cursor 或真正的 virtualization。CSS `content-visibility` 只能减轻绘制，不能替代 DOM 数量上限。
5. **搜索不得静默截断。** 必须区分 total matched、当前返回数和是否还有下一页。当前 1000 条内部上限以后不能被 UI 当作“完整搜索结果”。
6. **全库搜索最终不能在浏览器线性扫描所有历史月份。** 当前 segmented search 是过渡方案；长期要转为 D1/服务端元数据索引或等价的 bounded-fanout index。
7. **fallback 也必须冷热化。** 当前 architecture-v1 出错就加载完整 legacy corpus 只能作为迁移期保险；最终 fallback 应是“冻结 Hot 快照 + Archive 按需查”，不能故障一次就重新全量下载历史库。
8. **对象字节与索引元数据继续分离。** R2 管大对象/私有字节，D1 或静态 content-addressed index 管查询元数据；captured、published、complete、unknown 四种状态不得混为一谈。
9. **用户状态和统计继续行式/物化化。** 用户库下一阶段 D3c 要把写入也逐步变成 per-paper row authority；统计继续 raw append-only + fresh materialized read，禁止公共请求全表扫描。
10. **发布权威保持独立。** 新文献仍只有北京时间 08:00 一个正式入库槽：06:55 machine audit → 07:05 semantic review → 07:35 recovery → 08:00 release；18:00 只属于历史记录。任何前端冷热优化都不得反向改变文献准入、Tampermonkey 抓取或删除权威。

### 5. 我已经把规则固化到仓库

我新增了 `architecture/CURRENT-CONTRACT.md`，并在 `architecture/README.md` 顶部明确：**CURRENT-CONTRACT 是当前有效规则，历史 `PHASE-*.md` 只是演进记录，里面残留的旧 18:00 等内容不能覆盖现行契约。**

本次只改架构文档，没有动生产文献、页面数据、媒体、用户数据或 Tampermonkey。功能契约提交为 `8cf94ddd3cef7f2be964fc4cd95ba5381258a6aa`。

接下来的架构施工顺序也因此明确了：先做 **P0 搜索/日期结果真正分页或窗口化**，同时把 **full-history legacy fallback 改成 bounded fallback**；随后做 **P1 全库索引搜索**；再完成 **D3c 用户库行式写入**。这三件做完以后，即使网站积累到数万篇文献，首页和普通查询的复杂度也不会随着历史总量直接线性膨胀。
