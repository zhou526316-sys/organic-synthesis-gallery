北京时间：2026-09-26 12:37:40 +08:00
任务上下文：Organic Synthesis Gallery 每日 12:00 派生摘要发布故障修复

已解决。根因不是单点，而是旧版重复任务、当前 handoff 协议/密钥与旧任务漂移、部署后 handoff backfill 的 R2 读取放大，以及无关的 TOC maintenance 失败会把整个部署误判为失败。现在这四处都已经处理完。

- 唯一正式任务“Gallery 摘要发布”已重新启用，固定北京时间 12:00；旧版重复任务已停用、明确标记为废弃，并清除了其中不再需要的旧密钥内容。
- Worker、契约和检查项重新对齐到正式任务持有的配对密钥，并继续使用当前的 manifest + 分片 ciphertext + gzip 协议；同时加入了“公钥部署、任务私钥、线上 manifest 三者必须一致”这一防漂移约束。
- handoff backfill 已改为先利用 R2 customMetadata 建立当前 envelope 索引，避免对大量已经是 current 的 Evidence 逐篇执行额外 R2 GET；最新部署中该步骤已由 failure 变为 success。
- TOC promotion 已与摘要发布的部署判定解耦，不再因为媒体维护步骤的瞬时故障把已成功部署的摘要链路误报为 deployment_failed。最终部署 run 36218110563 为 success，Worker 发布、runtime secrets、TOC promotion、摘要 handoff backfill 以及后续线上验证步骤均为 success。

线上最终回读也通过：healthcheck 为 ok，摘要发布时间仍为 12:00 Asia/Shanghai，实时摘要审查保持关闭，scheduled review ready=true；handoff manifest 为 version=2、schemaVersion=scheduled-summary-handoff-v1、algorithm=RSA-OAEP-256+A256GCM+GZIP、manifestOnly=true，并正常返回 60 篇待审 Evidence。最新一篇为 DOI 10.1021/acs.orglett.6c03575，evidenceLevel=partial，说明今天失败的队列没有丢失。

本次修复严格没有修改生产文献卡片、authoritative literature datasets、TOC demand、08:00/18:00 发布状态或任何文献收录决定，也没有直接伪造或补写摘要。当前 `public/scheduled-article-summaries.json` 仍保持原 blob SHA `2a47a9bcaaa7491c342694e9ef37698eea33e161`、items 为空；也就是说，今天早先失败的 12:00 轮次没有被假装成“已发布”，60 篇仍安全保留在待审队列。

本次关键功能提交：`07ddc625be2c04750c2c940956b24978b350ccf6`（恢复任务/Worker 配对密钥）、`6a80666f1d154a6675c90c81c335ba914edb77c2`（摘要 backfill 与前序失败解耦）、`e1a4a1c604104fc677fad501dc08c84a000f1bc8`（降低 backfill R2 读取放大）、`20af92593eb256d2e1296f5489018fc5d463c53e`（TOC maintenance 不再误伤摘要部署判定）。

response_sync_completed