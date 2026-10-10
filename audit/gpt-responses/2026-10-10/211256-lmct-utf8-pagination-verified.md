# 2026-10-10 21:12 Asia/Shanghai — Gallery 中文检索游标与 LMCT 修复验收

对话：用户在 Organic Synthesis Gallery “LMCT 搜索仅4篇”连续修复工作中再次要求“继续”。

## 用户可见答复：第一部分

已查明“轴手性”分页失败的根因：**中文检索词被直接送入 `btoa()` 生成分页游标，导致结果超过一页时触发服务器异常。** 这解释了为什么一次请求 100 篇可以成功，而每页 12 篇或 24 篇会返回 HTTP 500。

刚核对 GitHub，相关修复实际上已由另一条工作线合并到 `main`：

[PR #502：修复中文检索词的 UTF-8 分页游标](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/502)

修复改用 UTF-8 编码，并保留英文旧游标的兼容性。对应的 Worker 部署和全库搜索自动验收均显示成功。我继续核对实际分页记录，确认第二页也能正常读取。

## 用户可见答复：第二部分

### 正式网站浏览器验收已全部通过

**桌面端和手机端的五组连续搜索全部成功。**

- LMCT：匹配 11 篇，实际显示 11 篇
- 轴手性：全库匹配 25 篇
- 手机：轴手性第一页显示 12 篇
- 桌面：轴手性第一页显示 24 篇
- 两种布局均使用新的 GET 接口，所有查询返回 HTTP 200，没有隐藏卡片，也没有 JavaScript 错误
- 之前固定发生在“轴手性”上的 `net::ERR_FAILED` 本轮没有再次出现

完整验收：[GitHub Actions #38054131192](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38054131192)。

## 用户可见答复：第三部分

### 第二页、第三页也已通过实际接口检查

又直接访问正式生产 API，使用第一页返回的真实游标逐页读取“轴手性”的全部 25 篇文献：

| 布局 | 分页返回数量 | DOI 去重结果 |
|---|---|---|
| 手机（12 篇/页） | 12 + 12 + 1 | 25/25，无重复 |
| 桌面（24 篇/页） | 24 + 1 | 25/25，无重复 |

所有分页请求都返回 **HTTP 200**，最后一页正确结束，没有漏篇，也没有重复 DOI。

因此，之前中文关键词触发的 HTTP 500、连续搜索失败和分页游标错误，这一轮都已通过生产环境验证。

## 最终结论（准备答复）

当前已入库的 938 篇正式论文中，LMCT 检索返回 11 篇，均可在桌面和手机端显示；“轴手性”匹配 25 篇，手机 3 页和桌面 2 页已使用真实游标逐页全部读完，25 DOI 无重复、无缺失。PR #502 的 UTF-8 游标修复已合并，Worker 生产部署与正式浏览器验收通过。建议刷新 [Gallery 主站](https://gallery.gczhouwld.com/) 验证。这里的数字仅限目前正式收录目录，不是目标期刊创刊以来所有论文；历史补录继续由独立工作线推进，不因搜索修复而作为当天新增。

## 审计来源与约束

- PR #502 合并提交 `8e2aacaee4b26f2168479ee2a0ae1255df7e2339`；修复 `cloudflare/worker/src/literature-catalog-index.js` 的 `encodeUtf8Cursor` / `decodeUtf8Cursor`。包含中文多页分页单元测试。
- [Worker 部署 #38053770388](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38053770388)：成功。
- [索引同步 #38054085268](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38054085268)：成功。
- [线上浏览器检索验收 #38054131192](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38054131192)：桌面/手机 5/5 连搜成功，实际可见卡片匹配，轴手性 matched=25。
- 2026-10-10 21:12 左右，直接在公开 API `https://api.gczhouwld.com/api/literature/catalog-view` 以 `catalogId=f5853af95d5ea395cbe7e529a747ce75701eb0a22aad023c8e907f6b2fdf0c6d`、`query=轴手性` 分别请求 limit 12/24，再用生产游标逐页验证：
  - mobile page counts 12,12,1；count=25，all 200
  - desktop page counts 24,1；count=25，all 200
  - DOI 全局去重 25，末页 hasMore=false。
- 本轮仅完成检查与响应同步，没有重复开 PR 或修改已修复的搜索代码。
- 生产仅覆盖当前收录目录，不得夸大为期刊全部历史论文。
