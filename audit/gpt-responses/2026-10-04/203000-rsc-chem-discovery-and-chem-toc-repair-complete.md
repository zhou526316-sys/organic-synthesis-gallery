# 2026-10-04 20:30 Asia/Shanghai — RSC/Chem 发现覆盖与 Chem TOC 修复完成

已修复，而且这次确认了原来不是“这三本刊恰好没文章”，而是发现层存在真实漏检。

## 发现层修复结果

根因有两个：

1. `verifiedThrough` catch-up 以前只体现在报告的 `startDate`，Crossref/OpenAlex 实际查询仍从7天 safety-tail 起点开始，因此较早的待补区间并没有真正重新查询。
2. RSC 的 Crossref 数据大量只给年份级 `published-online=[2026]`。旧代码把缺失月/日补成 `2026-01-01`，随后又被 `activeFrom=2026-09-19` 过滤掉。这就是 Chemical Science / Green Chemistry 明明 Crossref created 有记录，最后却变成0的直接原因。

现在已经改成：
- catch-up 起点真正进入 Crossref/OpenAlex 查询；
- created/deposit 日期与 publication date 分开保存；
- 年/月不完整的出版日期保持“未知”，绝不再伪造成1月1日或当月1日；
- created/deposit 在有效窗口发现的 DOI 即使正式出版日期不完整，也必须留给审核；
- raw source 非零却 post-filter 变成0时强制报 `rawToUnionCollapse`，不能再静默显示健康。

正式 main 安全复扫 run `37202208279` 成功，latest/compact 同代于 `2026-10-04T12:28:59.750Z`：

| 期刊 | 修复后 sourceRecords | 已在网站 | 待逐篇审核 |
|---|---:|---:|---:|
| Chem | 9 | 1 | 8 |
| Chemical Science | 78 | 0 | 78 |
| Green Chemistry | 41 | 0 | 41 |

其中机器优先级较高的候选分别为 Chem 3、Chemical Science 24、Green Chemistry 9。它们只是进入审核集合，并不代表全部应该收录。比如 cover、contents、材料/能源、综述等仍会按 scope contract 排除；真正的有机合成文献会在正常语义审核后进入固定发布槽。

当前全站 compact unresolved=152，生产卡片仍为786。没有因为这次修复把任何漏检候选直接上线。

为防止后续任务再次退回旧发现器，新能力已正式晋升为 stable：
- capability fingerprint: `cf1965ec987e8d226af927b2b81c4a06f4059d354882a2797e93b464510b7377`
- capability promotion commit: `625c4eb45f273124a02327fe81de56fbed9a944b`
- `verifiedThrough` 已主动回退并保持在 `2026-09-18`，只有这些漏检候选完成语义审核后才能重新前推。

因此目前质量门因为存在152个尚未正式决定的候选而阻断，是正确的 fail-closed 行为；没有为了变绿而伪填 pending/include。

## Chem TOC / Elsevier 修复

唯一现有 Chem 卡片 `10.1016/j.chempr.2026.103282` 此前真实失败原因为：
`bound_publisher_heartbeat_missing`

即任务还没进入图片识别阶段，就在 DOI 跳转到 Elsevier 页面时丢失了绑定。

已修：
- Elsevier DOI 先由控制器解析实际出版社落点；
- 只信任 ScienceDirect / Cell；
- 只有来自 `linkinghub.elsevier.com` 的 PII 跳转才允许转换为 ScienceDirect PII URL；
- 最终出版社 URL 再附加当前 `osg-job` 绑定后打开；
- 恶意/错误域名的 `/pii/` 不会被信任。这个边界是 CI 实际抓出的安全问题，修正后回归通过。

版本：
- VPN Bridge：`2.2.42`
- TOC installer metadata：`6.2.24`
- capture protocol 继续兼容 `6.2.20`

GitHub Pages run `37201620658` 已完成：
- authorization success
- build success
- Bridge构建验证 `TM220_RELEASE_ARTIFACT {"bridgeVersion":"2.2.42"...}`
- deploy success
- canonical domain + GitHub Pages 在线交付验证 success

需要严格区分：**Chem 的抓取链已经修复并部署，但我还没有新的浏览器回执证明 `10.1016/j.chempr.2026.103282` 的官方 TOC 已经实际抓到。** 它需要本机 Tampermonkey 获取新版本后重新跑到该 DOI；在出现新的 `toc stored` 回执前，我不会把“代码已修”说成“TOC已抓到”。

Chemical Science / Green Chemistry 此前没有 TOC 的主要原因则是更上游：文献根本没有进入生产卡片，所以媒体队列没有任务。现在发现层已补齐，等逐篇审核并在08:00/18:00正式纳入后，RSC DOI 才会进入现有 `pubs.rsc.org` Tampermonkey 路由抓 TOC/正文图。

## 执行记录

- 修复 PR：#302
- 合并 commit：`b9ee9d4ef0a36d0dd8b1ef716166cac5a94832fa`
- 修复分支真实补扫/回归：run `37201431750`
- main 正式 catch-up：run `37201754206`
- main 后续完整审计：run `37201854938`
- stable fingerprint 后安全复扫：run `37202208279`
- Pages / Bridge 正式部署验证：run `37201620658`
- 最终 repair state：`catchup_complete_semantic_review_required`
- 当前生产卡片：786
- 定时任务：未改期、未停用、未增加替代任务
- 媒体策略：未启用 OA 自动提图，Figure 1 仍不能冒充 official TOC

下一固定发布槽仍按原规则运行。新发现的 Chem / Chemical Science / Green Chemistry 候选必须先逐篇审核；合格项才能在固定槽上线。
