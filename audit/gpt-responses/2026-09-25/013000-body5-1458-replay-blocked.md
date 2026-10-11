本轮有实质进展，但没有把未真正部署的图片标记为 `published`。上一批 PR #208 的 **5 篇、22 张**已审核正文图已经在最新 `main` 基线上完成 exact-blob 重新对齐：当前 PR diff 只剩原始审核记录、review packet、canonical batch 和 22 个冻结资产，共 25 个文件；旧的 read-request trigger 和旧 hold 回复已从结果树中排除。所有资产继续复用原来的 Git blob，不重新编码、不重新抓出版社，也没有改动卡片、中文标题、收录范围、TOC、userscript 或生产文献数据。

当前基线为 `ce7ab9805397d0097fc34f675182e933c161ebc1`。我生成了一个干净的直接子提交 `96b706a009f51646ed80aada6ac283a96e79e039`，相对该 main **只新增上述 25 个媒体审核文件**，没有任何 protected-literature 或功能代码变化。PR #208 的实际 head 也已通过无强推的 merge-reconciliation 前进到 `7f4cd69bd8b29be9394cab0fd1760966e29c30c6`；重新读取后 PR 为 `mergeable=true`，文件范围已再次核对。

本轮新触发的只读证据读取 run `36034182109` 已成功。push-only 的 `Materialize approved body assets` run `36034181875` 在“Resolve explicit new review manifests”步骤失败；日志已明确定位原因：该 helper 比较旧 PR head 与 replay head 时找不到“新新增”的 packet/manifest，因为这次是**已经物化过的不可变 batch 的 exact replay**，并非图片、SHA256、DOI 绑定、R2、索引写入或语义审核失败。后续物化/发布步骤因此被跳过，没有发生 publisher 请求、R2 写入或生产媒体写入。

真正阻止本轮继续上线的是当前执行环境对 **PR merge / main ref 写入** 的写操作进行了阻止；因此我没有绕过它，也没有用 force-push 或其他方式抢写 main。当前 main 仍保持 `ce7ab9805397d0097fc34f675182e933c161ebc1`，所以这 22 张的准确状态仍是 **`reviewed_pending_merge / approved_waiting_deploy`，新增 `published=0`**。隔离世代继续保持 `1790082000000`。

下一轮应直接从这个已重新对齐的 exact-blob 状态继续：先确认 main/SHA 没有新并行变化；若 main 写入门禁可用，就合入相同 22 个冻结资产并用现有 `PAGES_REFRESH` 触发 Pages，等待 `literature_authorization`、build、deploy 全部成功后，再运行 reviewed-body live verifier，逐项核验线上 URL、SHA256、图号、真实卡片解码和原 TOC 保留。只有通过这一步才会把这 22 张改标为 `published_verified`。这仍不是正文图全库复核完成声明。