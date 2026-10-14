# 2026-10-14 — 第五组正式历史 DOI 科学 OA 来源验收（80–99）

- 精确正式目录：1087 DOI，`catalogId = f263e943427a16c8fa52c828d786fb90fc7366d6e01bd74e1b2b1bd148d69870`。
- 完整发布日期可核实的 2026-10-01 前历史 DOI：826；历史日期未知 10。已扫描偏移量 0、20、40、60、80 的**100 篇**，未跨代次。
- 本窗只读 GitHub Actions：[运行 #38500747243](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38500747243)，源结构与许可元数据产物 11865428955；`offset=80`、`nextOffset=100`、`hasMore=true`。
- 本窗分类：`needs_independent_review=1`，`reuse_restricted=3`，`pmc_oa_missing=11`，`metadata_doi_missing=5`；XML全文保留0、公共章节入库0、PDF抓取0、出版社浏览器访问0。
- 新复审候选 `10.1038/s41929-026-01576-x`（Nature Catalysis；官方 Europe PMC PMCID 与精确 DOI/CC BY 4.0），JATS科学结构 44 sec / 9 fig / 1 table，`complete_candidate`（**仅候选**），XML SHA256 `dad2cde26c460a430bb940ed2478e46aa1fe34b60fde7ccf20f229a0ee5268af`。
- 前四窗不可变来源汇总见 [windows 0–79](2026-10-14-formal-oa-windows-0-79.md)。五窗累计：已核100／正式有日期历史826，许可证与结构可独立复审9，限制性再利用21，PMC OA条件不满足41，PMC元数据未匹配28，许可证未明1，全部累计公共全文入库**0**。
- 下一安全游标：**100**；使用完全相同的 `catalogId` 才可继续。若下一次网站正式目录发生增删、版本哈希改变，则立即停止跨版本拼接，先依据新的正式 DOI 集审计差异再安排续扫。
- 这里的 `reuse_restricted` 不能自动当作可用CC BY；`metadata_doi_missing` 不代表文章不存在；`pmc_oa_missing` 不表示出版社没有全文。独立学术审阅必须验证科学内容章节、图注、出处、第三方材料许可证后才可在已有管理员隔离 FTS 接口导入；不得把模拟可用性当作科学全文完成。

**生产与用户端**：历史脚本 0.2.7 已上线。原先527次浏览器复查新增0的问题仍需用户在已登录的Edge/Chrome中执行至多8篇「出版社回执核验」并回传纯脱敏结果，不能用服务器自动OA来源扫描替代真实浏览器页面回执诊断。原有TOC、正文图、PDF和每日唯一08:00发布机制不变。
