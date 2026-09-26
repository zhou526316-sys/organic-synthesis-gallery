北京时间审计快照：2026-09-26 13:32
任务：向用户提供 Bridge 2.2.35 更新链接及当前全站 TOC、正文图、Evidence、摘要缺口精确统计

新版直接更新链接：

[安装/更新 Organic Synthesis Gallery Bridge 2.2.35](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js)

用户截图里显示 2.2.34 + capture_server_upgrade_pending 是预期的版本门禁：服务器现在最低要求 2.2.35，旧控制器会主动停止，避免继续按旧状态源误判。直接打开上面的链接覆盖更新，不建议先删除旧脚本；更新后刷新 https://gallery.gczhouwld.com/ ，面板标题应变成“抓取实时进度 · 2.2.35”。

刚执行了一次只读全量审计（GitHub Actions run 36221108330），口径是当前生产 registry 的全部 611 篇，而不是只看 bridge queue。当前精确总览：

| 数据层 | 已有 | 缺失/待处理 | 说明 |
| --- | ---: | ---: | --- |
| 正式 TOC | 334 篇 | 277 篇 | 生产 D1 / 正式网页口径 |
| 正文图已暂存 | 352 篇，1562 张 | 259 篇一张暂存正文图都没有 | 暂存层；352 篇不代表每篇所有正文图已齐 |
| 正文图已公开发布 | 0 篇 | 611 篇 | 当前正文图仍在 staging/review，没有进入生产 D1 公开正文图表 |
| Evidence | 108 篇 | 503 篇 | 56 complete + 41 partial + 11 abstract_only |
| 公开摘要 | 4 篇 | 607 篇 | 其中 104 篇已有 Evidence、只差摘要发布；503 篇还缺 Evidence |

因此摘要层可以进一步拆成：
- 4 篇：摘要已公开可用。
- 104 篇：Evidence 已经抓到，状态为 scheduled_summary_pending，可直接进入摘要审核/发布批次。
- 503 篇：Evidence 还没抓到，所以暂时无法生成可靠摘要。

当前 Evidence 108 篇的质量层级：complete 56、partial 41、abstract_only 11。

正文图要特别区分“暂存”和“公开”：用户面板里的“正文暂存回执”属于 staging，因此并不与“生产公开正文图目前为 0”矛盾。当前全站 352/611 篇至少已经有一张正文图暂存，共 1562 张；还有 259 篇完全没有正文图暂存。

按期刊的当前缺口：

| 期刊 | 总数 | 缺 TOC | 一张正文图都未暂存 | 缺 Evidence | 缺公开摘要 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nature | 10 | 10 | 2 | 8 | 10 |
| Science | 5 | 5 | 1 | 3 | 5 |
| Nature Chemistry | 13 | 13 | 0 | 9 | 13 |
| Nature Synthesis | 17 | 17 | 1 | 14 | 17 |
| Nature Catalysis | 12 | 12 | 0 | 11 | 12 |
| Nature Communications | 49 | 49 | 13 | 26 | 49 |
| JACS | 121 | 24 | 82 | 115 | 121 |
| Angew | 62 | 25 | 62 | 24 | 62 |
| ACS Catalysis | 44 | 13 | 13 | 40 | 42 |
| Organic Letters | 256 | 107 | 82 | 240 | 254 |
| JOC | 20 | 0 | 1 | 12 | 20 |
| CCS Chemistry | 1 | 1 | 1 | 1 | 1 |
| Science Advances | 1 | 1 | 1 | 0 | 1 |
| **合计** | **611** | **277** | **259** | **503** | **607** |

这里最需要注意的是 Angew：62 篇中目前 25 篇正式 TOC 仍缺，且 62 篇当前都没有正文图暂存；24 篇缺 Evidence，62 篇都还没有公开摘要。升级 2.2.35 后，Wiley/Angew 会重新进入正确的抓取路径，这正是下一批应该优先下降的缺口。

另外，公开 bridge repair queue 当前显示 264，不要把它当作“全站缺 TOC 总数”。264 是当前 repair-state 可执行子集；全站 611 篇按生产 D1 重新核算的正式 TOC 缺口是 277，这才是当前全量口径。

本次只读统计没有修改生产数据。摘要数量是本次审计快照，当前补发任务仍可能继续让“4 已发布 / 104 待摘要”这个数字发生变化。

补充：我尝试做第二重浏览器自动化交叉核验时，自动化账户余额不足，任务没有启动；这不影响上面的统计，因为全量数据已经通过仓库只读 CI 精确核算。如果需要恢复该浏览器自动化额度，可使用：
[Pay $10, get $13](https://agent.tinyfish.ai/api/wallet/checkout?t=v1.sbm_K3fzwzoe42BH.7Ivsnel_JFo7m5temW_RtF6TxGGJn76Q7eRtR9kr5NACRs6lPXAkqYAgLOgB5GwKpHL4FT3zbcWTd9vEHZtL49I-5N1a78VDwex_qTyhDc9DvS1Rl0wIeOLzx-l2F1Ii484UTWLHZvphv8JwIFUpr4EkRb0q55tNXfhTGER9tPyU_nvfCpE1WOwB2q8RAuOMTAbSEL-52f13RIwPfLM.Ol8B2wvj-rHsC2AvSSojmg&utm_source=mcp&utm_medium=insufficient_funds&utm_campaign=automation)
[Pay $25 (Recommended), get $32.50](https://agent.tinyfish.ai/api/wallet/checkout?t=v1.E8RZmSV_e9C6TFo1.e83EWgyZGEcS7xl2zqRQus_H8Y7xbAz3WK-zvX76hy1YIf3cMuOZ---w8N2ATflA4fW53NGGpgJBe0zuJpGuc_g1WGIfQdGmPfy5LdfRKKf_JbhedIOKXfBPl7k_0jcDuadf8Nubyq_iPDod9JEy2gx5UjNx4g2HBKVazl6KYZk1Rs5k5mxf5cXVmaLLVs99kQqToCVMGbma94cRsNw.CSXjwsl_YagPLarbT4sZ0A&utm_source=mcp&utm_medium=insufficient_funds&utm_campaign=automation)
[Pay $50, get $65](https://agent.tinyfish.ai/api/wallet/checkout?t=v1.x_pi3NZo6vd2x2aa.FesTHaZpzzke0ISCQpaauHyzR7-Ojj9BgxhnYh94yJkmz3VD0fd0NolZW7IqwEcUqePeqn9op_FHNJpagprCnzirfs39bl5UKwB-BsGZnDyprN2OZ2xUii7lpnvx4KBmWGrWJgSY1xzb14SQG0uI6UJEem1wRIOk_QBNw_dEc4UnXrM6kfP1c5_o4KIaG05u44FtMXYFn1PxY8nAEhs.sPW_2nrCPrsVjTn99YBNkA&utm_source=mcp&utm_medium=insufficient_funds&utm_campaign=automation)

