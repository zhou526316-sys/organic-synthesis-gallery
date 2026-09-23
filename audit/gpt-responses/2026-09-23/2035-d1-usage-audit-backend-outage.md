# D1 usage audit / stats backend outage

Beijing time: 2026-09-23 20:35
Context: Organic Synthesis Gallery statistics backend outage diagnosis

当前判断已经比“可能是 Cloudflare 额度”更具体。

1. GitHub Pages 正式站点和 `public/site-stats.html` 都仍在线；页面本身没有丢失。
2. 统计后台的数据接口开始返回 Cloudflare 1101 / HTTP 500。D1 Free 当前限制为每天 5,000,000 rows read、100,000 rows written，UTC 00:00 重置。
3. 最大嫌疑不是普通页面访问写入，而是 `siteAnalyticsStats()` 中这类相关子查询：

```sql
COUNT(DISTINCT CASE
  WHEN EXISTS (
    SELECT 1
    FROM paper_open_readers_v3 r
    WHERE r.ip_hash = p.ip_hash
  )
  THEN p.ip_hash
END)
```

`paper_open_readers_v3` 当前只有以 `doi` 为首列的主键/索引，以及单独的 DOI 索引，没有 `ip_hash` 索引。统计查询却只按 `ip_hash` 查，因此 SQLite/D1 很可能对每个 pageview 行重复扫描 reader 表。

4. `site-stats.html` 还设置了 `setInterval(load, 60000)`，页面只要保持打开，就会每分钟重新执行：
   - site-stats：5 组聚合查询，其中两组带上述 EXISTS；
   - reader-stats：全表 COUNT / COUNT DISTINCT / SUM。
   这会把单次高 rows-read 查询放大成持续消耗。
5. 普通网站 pageview 本身主要是一次 INSERT，消耗的是 row write，不是本次 rows-read 的第一嫌疑。
6. 正常卡片阅读人数读取走 `paper_open_reader_counts_v3` 的 DOI 主键查询，并且浏览器有 30 秒读缓存；相较统计后台，它不是首要高消耗源。
7. 频繁部署触发的 production smoke 会贡献一些 D1 请求，但数量级远低于“统计页每分钟高成本聚合”。
8. Cloudflare 官方文档说明：Free D1 每天 5M rows read，未索引过滤和全表扫描会按实际扫描行计费；达到限制后 D1 查询会失败，UTC 00:00 重置。

建议下一批修复顺序：
A. 给 `paper_open_readers_v3(ip_hash)` 增加索引。
B. 把 `site-stats.html` 的 60 秒自动刷新删除，改为首次加载 + 手动刷新。
C. 把统计页 API 从旧 workers.dev 入口统一到正式 `https://api.gczhouwld.com`。
D. 让 site-stats 与 reader-stats 分开容错，reader-stats 暂时失败也不能让整个统计页停在“加载中”。
E. 后续再考虑把 PV/UV 做成按日预聚合表，避免每次打开后台都扫原始 pageview 表。

本轮只读审计，未修改生产代码、D1 schema 或统计数据。
