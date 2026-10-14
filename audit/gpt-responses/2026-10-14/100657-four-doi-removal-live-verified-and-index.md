# Four DOI removal: live verification, search index and state reconciliation

- Date/time: 2026-10-14 10:06:57 Asia/Shanghai
- Project chat: Organic Synthesis Gallery, continued correction for 2026-10-14 four user-excluded DOI
- User message: 继续
- Production repository: zhou526316-sys/organic-synthesis-gallery, main

## User-visible response, consolidated

### 网页部署已恢复成功
修复后的 [GitHub Pages 部署 #38497082904](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38497082904) 已完成，文献授权、Gallery 构建及回归测试、GitHub Pages 部署三个阶段全部成功。此前标题展示模块不兼容 deletion-only / scope-correction 发布标记的问题已修复。

正式域名 https://gallery.gczhouwld.com/ 与 Pages 镜像的在线 DOI 清单一致：**1,087 篇**。四个已确认超范围 DOI 均已从正式网页移除：

- 10.1038/s41467-026-78512-x
- 10.1002/anie.2910902
- 10.1021/acscatal.6c06095
- 10.1002/anie.2518487

正式数据集由 1,091 篇减少 4 篇至 1,087 篇，原有其他 DOI 全部保持。永久排除注册表 `audit/literature-scope-corrections.json` 已保留四篇的独立 DOI 级明确排除决定，条目总数为 12。TOC 需求队列统计为 1,087 篇。

### 检索索引已同步
[索引同步运行 #38498332951](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38498332951) 成功。它重建了当前 1,087 篇的活动 D1 搜索索引，导入 1,087 / 1,087 条，rowParity 检查 1,087 条、0 不匹配，searchParity 和 viewParity 均为 0 不匹配；正文/摘要索引补充运行也完成。

### 删除状态与完整性审核分别结案
原先删除后的 `scope-correction` 在线回执与旧版完整性审计耦合，导致尽管网页已删除却显示 `sync_failed`。新的 [PR #632](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/632) 已合并（commit `58d017e282910b94ae9d24aab39273176d01426a`），完整跑了质量门禁但将已验证的**删除交付**与未完成的**新增文献范围审查**分开登记。验收任务 [#38499076355](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38499076355) 成功。

当前主线经回读：
- `audit/publication-release-state.json`：schema3 `scope-correction`，1087 DOI，准确四篇删除
- `audit/literature-update-state.json`：`lastScopeCorrection.status=verified`、`phase=synced_with_pending`、`lastWebsiteSync.verification.galleryDois=1087`
- `audit/scope-rechecks/scope-correction-20261014012549272-live-verified.json`：`ok=true`、`exactDoiSetMatch=true`、1087 / 1087、四篇全部缺席
- `audit/scope-rechecks/scope-correction-20261014012549272-global-quality.json`：全库语义审核**未**闭合，未错误宣称源覆盖已结束

仍未结案的其他 4 个 DOI 中，两篇既有 pending 为 `10.1021/acs.joc.6c01296`、`10.31635/ccschem.026.202608538`；另外两篇未经审查的新候选为 `10.1021/acscatal.6c06400`、`10.1038/s41467-026-77262-0`。他们均非此次删除的四篇，未被擅自纳入或排除。并保留四项跨来源覆盖异常和七项闭环异常，`verifiedThrough` 未前推。

本轮没有修改每日北京时间 08:00 的唯一正式新增发布计划，也未更改其他文献、PDF 权限或媒体采集。

**结论：四篇已从生产网站、全库数据、活动检索索引移除，并通过独立 DOI 精确一致性验收；永久排除已入正式注册表。全库其他新增文献的审核闭环仍为独立待办。**

## Related GitHub references
- Formal correction: PR #626; scope marker correctionId scope-correction-20261014012549272
- Pages fix PR #629 (merge 5c41b1991b663f7fd0435193379fb012bf5810b1)
- Pages run 38497082904
- Search index run 38498332951
- Reconciliation PR #632 (merge 58d017e282910b94ae9d24aab39273176d01426a)
- Reconciliation run 38499076355
