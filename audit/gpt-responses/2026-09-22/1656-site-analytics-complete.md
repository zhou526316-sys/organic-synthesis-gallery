网站访问统计这一批已经完成上线并验收。

当前已新增：
- site_pageviews_v1：记录真实页面 PV，保存加盐后的 IP hash、页面 path、来源域名、设备类型、北京时间日期和时间；不保存原始 IP。
- POST /api/user-ui/pageview：前端真实页面加载时上报。
- GET /api/user-ui/site-stats：返回总 PV/UV、今日 PV/UV、7/30 天趋势、来源域名、设备分布、访问但未点文献/访问且点过文献人数。
- GET /api/user-ui/reader-stats：保留 DOI×IP 去重文献阅读统计。
- public/site-stats.html：聚合统计后台页，noindex/noarchive，不在主导航暴露。

部署：
- Worker analytics 相关提交：d949c9e49db948714b0791a226f086e0bb5de8ac、12378618ca1e6f2c37b0ee0b54f26691473ac51e、f82a499b8b275259b69adaa10a86b3e47b843cb2、d97d30dc2693ec1f51320b148701f19572e9b655。
- 前端 beacon：ffb02a9f4190aa804fa79bc8f1076daa6220b320、da0f970f47512bebcd315aa9473c70855e20a524。
- 统计后台页：493b354dfb95c996c5a499027946db2d090431b8。
- Pages 发布触发：69cd4d1f5b11e24c7c6714ae1ae4cc3e7e3211b7。
- GitHub Pages run 35708077729：build=success，deploy=success，线上 CSS smoke=success。

生产验收：
- 统计页已上线：https://zhou526316-sys.github.io/organic-synthesis-gallery/site-stats.html
- site-stats API 正常。
- reader-stats API 正常。

截至 2026-09-22 16:55 北京时间的实时统计：
- 新 PV 统计自 2026-09-22 16:23:32 起开始累计。
- 累计 PV：5
- 累计 UV（独立 IP hash）：4
- 今日 PV：5
- 今日 UV：4
- 访问且至少点过一篇文献的 UV：2
- 访问网站但尚未点任何文献的 UV：2
- 来源：direct 5 PV / 4 UV
- 设备：desktop 4 PV / 3 UV；mobile 1 PV / 1 UV
- DOI×IP 去重文献阅读人次：31
- 文献阅读独立 IP：8
- 至少被打开过一次的文献数：28
- 文献阅读最早记录：2026-09-21 14:05:02 北京时间
- 文献阅读最近记录：2026-09-22 16:42:46 北京时间

重要边界：
- 历史网站 PV/UV 在新 pageview 统计上线前没有原始事件，因此不能精确倒推；PV/UV 从 2026-09-22 16:23:32 开始是完整新口径。
- 文献阅读数据沿用 article-open-v3，因此当前已有 31 次 DOI×IP 去重阅读、8 个独立阅读 IP。
- raw IP 从不保存；只保存服务器端加盐 SHA-256 hash。
