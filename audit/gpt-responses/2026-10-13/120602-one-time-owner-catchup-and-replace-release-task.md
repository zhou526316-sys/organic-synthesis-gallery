# 一次性补发正式上线与定时任务替换：最终回报
北京时间：2026-10-13T12:06:02.549+08:00
用户授权：2026-10-13 七篇 DOI 人工定案，五篇纳入、两篇排除，同日一次性越过普通 09:00 技术截止补发，然后替换每日 08:00 正式发布定时任务。
关联提交：PR #587 合并 a72286afe18d1da10407967f091879e231f7d274；原子发表 b9dcbc10c7d58ce41f172289d40610b10e3aa676；部署请求 01b99598f1f66e9229441ea3d188fc0f4324c125；质量状态更新 694e11e4073cf25d11bf252742f59e67a0e27c0c。
仓库记录：audit/owner-catchup/2026-10-13-title-decisions.json，audit/review-2026-10-13-owner-catchup.json，audit/publication-release-state.json。

## 同步用户可见回复正文

### 10 月 13 日一次性补发：仓库已提交

本次按你逐篇确认的意见完成数据提交：批准补发 **5 篇**，人工排除 **2 篇**，仓库 DOI 总数 **984 篇**。

原有 979 篇保持不变。新的原子提交为 [`b9dcbc10`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/b9dcbc10c7d58ce41f172289d40610b10e3aa676)。

最新机器审计显示 `missingFromGallery=0`，且真实生产快照的特殊授权校验通过，失败项为零：[验收运行 #38343031334](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38343031334)。

**以上是仓库提交和发布授权通过，不等于正式网页部署已经成功。** 两种状态会分别核验。

### 正式发布定时任务已替换

**新任务：Gallery 08正式发布（新版）**。

新任务已启用，从 **2026 年 10 月 14 日北京时间 08:00** 起每天运行。它会承接完整候选审核、固定槽发布、Pages 部署及线上验收。

原“Gallery 08正式发布”已经**停用并更名为旧版**，不会再定时执行。任务管理功能目前支持停用，但没有提供永久删除操作，因此保留了一条已停用的历史任务记录。

07:05 主审核、07:35 补审和 23:00 历史回溯均未改动，18:00 仍不发布新文献。

### 正式网页补发已成功

[Pages 部署及线上验收 #38342963897](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38342963897) 已全部通过，包括正式域名和 Pages 镜像的文献数据校验。

**今天批准的 5 篇已随 984 篇目录发布，2 篇排除文献未收入。**

正式入口：[Organic Synthesis Gallery](https://gallery.gczhouwld.com/)。

本次正常发布流程仍保持每天北京时间 08:00，今天的槽后补发权限仅适用于这一次。

### 最终验收

正式页面发布回执显示 `productionCards=984`，实际验证于北京时间 2026-10-13 12:02:16。正式站点与 Pages 镜像完整 DOI 集合、中文标题和版本归属全部通过，已将发布协调状态更新为 `synced` 且 `publicationChecksPassed=true`。

新增 DOI：
1. `10.1038/s44160-026-01189-z` Nature Synthesis，硫脲介导氧杂环丁烷骨架编辑
2. `10.1021/acs.orglett.6c04027` Organic Letters，铑催化三组分合成 α-羟基羧酸
3. `10.1021/acs.orglett.6c03617` Organic Letters，铱催化哒嗪盐不对称氢化
4. `10.31635/ccschem.026.202608252` CCS Chemistry，铼(V)氮化物亲电反应性
5. `10.1021/acs.orglett.6c03893` Organic Letters，氢键增强卤键活化催化

排除 DOI：`10.31635/ccschem.026.202608292` 与 `10.31635/ccschem.026.202607973`。所有七篇已根据用户准确 DOI 审核决定结案，独立机器审计剩余未决为 0。铼氮化物及卤键催化论文系用户明确按题名纳入，完整实验底物范围仍未取得；审计没有臆造相应数据。

后续质量门禁 [#38344656381](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38344656381) 和复核 [#38344740219](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38344740219) 均通过。TOC 需求总量为 984。仍存在 4 项跨来源覆盖预警和 6 项闭环覆盖预警，因此 `verifiedThrough` 不应误当前进，不能把机器未决 0 解释为全部 16 刊已完全查全。一次性槽后补发授权不会延伸至明日以后的发布。
