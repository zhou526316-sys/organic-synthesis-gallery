北京时间：2026-09-26 13:39 +08:00
任务上下文：Organic Synthesis Gallery 批量摘要能力升级

能做到，而且当前问题不是缺正文。

当前 scheduled handoff 返回的 60 篇 Evidence 中：
- complete：28 篇
- partial：27 篇
- abstract_only：5 篇

也就是说至少 55/60 已经具有正文级证据，可以直接进入摘要审核；只有 5 篇只能按 Abstract 级规则总结。

此前吞吐慢的根因是执行编排：逐篇解密、逐篇双遍审核、频繁提交/部署，把本可批量处理的正文拆成了低吞吐流程。现已将正式契约升级为“一次触发、内部微批次连续处理”：
- 按 capturedAt 从新到旧；
- 每批 8–12 篇；
- 同一批先完成双遍审核，再一次性合并 public/scheduled-article-summaries.json；
- 一批只部署一次，不再每篇部署；
- 单篇失败不阻塞同批其它 DOI；
- 一批部署完成后，在执行预算允许时自动继续下一批；
- 已发布且 hash 仍匹配的 DOI 直接跳过；
- complete / partial / abstract_only 各自保持原证据门槛，不为吞吐降标准。

契约提交：8593ef82e97e1bf1753394e8a6899030c6c0363c。
“Gallery 摘要立即补发”已按新契约重新触发，用同一条正式生产链继续批量发布到 https://gallery.gczhouwld.com/ 。