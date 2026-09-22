目前可以直接读取后台 D1 的聚合阅读数据，但需要区分“网站访问量”和“文献阅读量”。

截至本次查询：
- DOI×IP 去重阅读人次：11
- 全站独立 IP 数：5
- 至少被一个 IP 打开过的文献数：11
- 计数一致性：paper_open_readers_v3 行数与 paper_open_reader_counts_v3 汇总均为 11
- IP 统计使用 CF-Connecting-IP，经服务器端加盐 SHA-256 哈希后存储，不保存/返回原始 IP。
- 同一 IP 重复打开同一 DOI 不重复计数；同一 IP 打开不同 DOI 会分别形成不同的 DOI×IP 阅读事件。
- 当前这套 IP 阅读记录最早时间约为北京时间 2026-09-21 23:43，最近一条约为 2026-09-22 15:20。

重要限制：当前 D1 没有保存“整站每次页面访问”的 raw page view/PV，因此不能从现有后台准确给出历史总页面访问次数。现有可准确回答的是：
1. 文献阅读去重人次（DOI×IP）：11；
2. 独立访问过至少一篇文献的 IP：5。

已新增只读聚合接口 GET /api/user-ui/reader-stats，仅返回聚合数字，不暴露原始 IP 或 IP hash。相关提交：
- 70d5942ad72adebce429e3fed5371e43f5e90459
- 839568c424cb840b9557ac8f6871c59e31344d2a

如果后续需要真正的“网站总访问量 PV / 独立访客 UV / 每日趋势”，需要从现在开始单独记录 pageview 事件或接 Cloudflare Web Analytics；历史未记录的 raw PV 无法从当前 D1 精确反推。