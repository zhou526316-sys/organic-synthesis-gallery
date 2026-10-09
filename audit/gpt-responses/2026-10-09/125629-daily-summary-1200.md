# Organic Synthesis Gallery — 每日摘要重试发布报告

- 北京时间：2026-10-09 12:56:29（Asia/Shanghai）
- 对话/任务：2026-10-09 daily-summary-1200 手动重试，接续上一轮写入失败的 54 条已审核待发布记录。
- 状态：**published / deployment_success / live_verified / response_sync_success**
- 当前 main 摘要数据：原有 389，新增 54，合计 **443**；无覆盖既有 DOI，保留所有其余条目。
- 本轮证据等级：complete 21; partial 26; abstract_only 7。
- 本轮公开文本门槛：逐条检查记录结构、双语非空、证据级别提示、禁止公开名称及哈希格式；54/54 与当前线上 Evidence 哈希匹配。
- 摘要数据 commit：`40ecd62b87e884a7186506fe3f2fba5157c354e5`。
- GitHub 修改文件：仅 `public/scheduled-article-summaries.json`，提交信息 `Summary: publish daily reviewed summaries 2026-10-09`。
- 部署：`Deploy Worker frontend assets`，run `37885759483`，状态 `completed / success`，绑定上述 commit。
- 线上抽查：**54/54**，逐 DOI 检查 `/api/user-ui/article-summary` 返回 `available=true`、`state=published`、`source=scheduled_reviewed_evidence_v2`、原始两个 hash 相符及中英文非空；均通过。一篇曾因网页文本抽取转义无法被本地 JSON 解析，单独重查后确认服务端响应正常、哈希匹配，并非生产失败。
- 本轮新增记录失败：0；未进入本次已审核 54 条集合的其它在范围 DOI 仍待后续证据处理，本轮不对其冒充完成。
- 原每日 12:00（北京时间）同一定时任务已恢复启用，未创建竞争任务。
- 未修改生产文献卡片、权威文献数据、TOC demand、文献发布状态、Tampermonkey 采集代码或其它数据文件。
- 私有内容：无；审计不含解密密钥、加密载荷、证据正文或访问凭据。

## 本轮已发布 DOI（54）

- 10.1021/acscatal.6c06476
- 10.1021/acscatal.6c05806
- 10.1021/acs.orglett.6c04041
- 10.1021/acs.orglett.6c04036
- 10.1021/acs.orglett.6c03899
- 10.1021/acs.orglett.6c03796
- 10.1021/acs.orglett.6c03719
- 10.1021/acs.orglett.6c03330
- 10.1021/acs.joc.6c01961
- 10.1021/acs.joc.6c01221
- 10.1021/acs.joc.6c01012
- 10.1021/jacs.6c17393
- 10.1021/jacs.6c17387
- 10.1021/jacs.6c17360
- 10.1021/jacs.6c15884
- 10.1021/jacs.6c14243
- 10.1021/jacs.6c13660
- 10.1021/jacs.6c11855
- 10.1038/s41467-026-78455-3
- 10.1038/s44160-026-01183-5
- 10.1126/science.aef3001
- 10.1021/acs.joc.6c01636
- 10.1002/anie.5624001
- 10.1002/anie.4335022
- 10.1039/d6gc03748h
- 10.1039/d6sc06407h
- 10.1021/acs.orglett.6c03611
- 10.1021/acscatal.6c06279
- 10.1021/acscatal.6c04987
- 10.1021/acs.orglett.6c03640
- 10.1021/acs.orglett.6c03763
- 10.1126/sciadv.aed4187
- 10.1021/acscatal.6c06183
- 10.1021/acs.orglett.6c03955
- 10.1021/acs.orglett.6c03936
- 10.1021/acs.orglett.6c03882
- 10.1021/acs.orglett.6c03868
- 10.1021/acs.orglett.6c03805
- 10.1021/acs.orglett.6c03725
- 10.1038/s41467-026-78459-z
- 10.1021/acs.orglett.6c02255
- 10.1021/acs.joc.6c02116
- 10.1021/acs.joc.6c01708
- 10.1021/acs.joc.6c01435
- 10.1021/jacs.6c14748
- 10.1021/acs.joc.6c01579
- 10.1038/s41557-026-02263-x
- 10.1021/acscatal.6c05658
- 10.1039/d6sc06374h
- 10.1039/d6sc05761f
- 10.1039/d6sc03717h
- 10.1039/d6gc05783g
- 10.1039/d6gc04458a
- 10.1039/d6sc05041g

## 用户可见结果

重新尝试后，通过最新 main 文件 SHA 对已有 389 条摘要与已审核 54 条进行单次合并；新数据提交成功，部署工作流成功，线上 54/54 可用且哈希一致。每日同一定时任务已重新启用。