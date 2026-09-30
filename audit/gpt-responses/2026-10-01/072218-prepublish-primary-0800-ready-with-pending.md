# Organic Synthesis Gallery 发布前主审核（2026-10-01 08:00）

状态：`ready_with_pending`。完整 compact 的 133 篇候选已完成双遍审核：16 include、111 exclude、6 pending。未修改生产文献、中文标题生产数据、TOC/媒体，也未请求 Pages 部署。

## 发布白名单

1. `10.31635/ccschem.026.202607611` — 铱催化烯丙基醚化/Claisen重排实现萘酚与乙烯基氮杂环丙烷及乙烯基环氧化物的不对称去芳构化
2. `10.31635/ccschem.026.202507282` — 协同非共价相互作用控制未活化二烯与芳香伯胺的区域选择性连续氧化胺化
3. `10.31635/ccschem.026.202507094` — N-氟代羧酰胺远程C(sp³)–H键驱动的未活化烯烃发散式官能化
4. `10.31635/ccschem.026.202607499` — 经稳定亲电体实现电催化C(sp³)–H/S–H偶联制备硫醚
5. `10.31635/ccschem.026.202607682` — 钯催化乙烯基芳烃的不对称马尔可夫尼科夫氢羰基化
6. `10.31635/ccschem.026.202607330` — Pd/羰基协同催化α-氨基酯与孤立二烯的立体发散迁移型α-烯丙基烷基化
7. `10.1021/acscatal.6c06078` — 镍催化C(sp³)–H芳基化反式选择性合成立体拥挤环丙烷及其他环烷烃
8. `10.1021/acs.joc.6c01517` — 邻氨基苯基炔丙醇与醛室温合成3-亚甲基-2,3-二氢-4-喹诺酮
9. `10.1021/acs.joc.6c01805` — N-芳氧基磺酰胺与2-溴代烯丙基砜经碱/酸顺序处理合成苯并呋喃
10. `10.1021/acs.joc.6c01447` — 烷基芳烃多类C(sp³)–X键的一锅电化学转化及C(sp²)–H酰氧基化
11. `10.1021/acs.joc.6c01791` — 模块化策略集体全合成Pandanus amaryllifolius生物碱Pandanusine A、B及Pandamarine
12. `10.1021/acs.joc.6c01127` — 钯催化炔丙氧羰基保护胍的快速脱笼
13. `10.1021/acs.joc.6c01824` — 无过渡金属区域选择性构建氰基及膦酰基四唑衍生物
14. `10.1038/s41586-026-11108-z` — 以噻蒽鎓叶立德为卡宾源的环丙烷化
15. `10.1021/acs.orglett.6c03702` — 二炔烯酰胺与溴代丙二酸二烷基酯级联重排发散合成杂环
16. `10.1021/acs.orglett.6c03826` — 可见光促进1,7-烯炔与α-溴代羰基化合物自由基螺环化制备螺氧化吲哚

## Pending

- `10.31635/ccschem.026.202608090`：题名显示外加/局部电场催化亚胺鎓化学，可能包含一般有机转化；但compact和可访问检索页未给出具体反应、底物范围、产物或分离收率。
- `10.31635/ccschem.026.202607590`：题名证实存在对映选择性合成，但未取得摘要，无法判断是两个特定分子的目标合成，还是可推广的对环芳烷构建路线。
- `10.31635/ccschem.026.202607612`：题名指向光控动态共价成键/交换，可能是真正聚合物网络重构方法；但未取得本篇摘要，不能确认单体/网络范围及主要贡献是否为制备方法还是功能材料演示。
- `10.31635/ccschem.026.202607659`：题名显示环氧树脂化学升级回收的氧化–Cope消除路线，但未取得摘要，无法确认可推广的树脂/键断裂范围、产物及制备性回收证据。
- `10.1021/acscatal.6c05520`：摘要证实存在胺与醇的无碱N-烷基化，但主要篇幅为单原子Ru配位结构、TOF和结构–性能关系，未给出胺/醇底物范围或分离产物证据，暂不能确认其主要贡献达到一般制备方法门槛。
- `10.31635/ccschem.026.202608472`：题名显示水参与的咔唑原位电化学重构，可能是骨架编辑方法，但仍无摘要、反应式、底物范围或分离收率。

历史边界项：`10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`继续 retain/include；`10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`继续 retain while pending。`10.31635/ccschem.026.202608262`继续作为越窗 durable pending 保留。

## 审计与质量门

- 范围契约：`scope-2026-09-24-v1`（blob `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`）
- 纠错清单 blob：`040902a773f72057dff59de5c66d27f568984813`
- fresh snapshot：北京时间 2026-10-01 07:11:47；handoff commit `c1ec80c78597e69a5d5921ff6cd0c9cc73e807d4`
- gallery DOI：710；source records：727；compact unresolved：133
- `criticalSourceFailures=0`；`sourceFamilyGaps=0`；`sourceCoverageAnomalies=2`；`closureCoverageAnomalies=5`
- `verifiedThrough`保持`2026-09-20`；机器审计存在2项source coverage和5项closure coverage警告，未伪装成全站闭环。
- 机器审计：[run 36789648593](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36789648593)
- 预发布质量门：[run 36790586201](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36790586201)：两项 `--allow-deferred --require-ready`、正式转换预演及严格发布包全部通过。
- staging commit：`e41109f4f319ca609a4877a181d7fc8692640576`

## 边界说明

本轮对规则版本兼容性进行了实质复核，而不是只更新版本号。四个标题明确但缺乏摘要/正文范围证据的CCS Chemistry边界项（电场催化亚胺鎓化学、应变对环芳烷、不对称/光控动态共价化学、环氧树脂升级回收）均保守暂缓；真实pending不阻塞其余16篇白名单。对高相关排除项（单一光开关重排、未完成Knightol路线、聚烯烃吸附机理、合成气高碳醇催化剂、发光/大环组装、富勒烯受体等）均保存反向challenge。

## 写入范围

- [staging review](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-01-0800.json)
- state已更新为预发布就绪；生产卡片、部署和媒体均保持不变。
