# Organic Synthesis Gallery — 八篇 DOI 用户最终纳入决定及日期核验

北京时间：2026-10-15 10:21:35。场景：用户在本对话逐篇明确决定 8/8 全部“纳入”，并授权同步 GitHub；新纳入仅下一合法北京时间08:00槽，继续核验首次在线日期。先前用户要求本日 2026-10-15 08:00 自动失败补审不构成今天非固定槽放行授权；当前消息更明确仅下一 08:00。

## 用户明确决定原文

这是我对8篇待定论文的人工范围审核决定：第1篇：纳入；第2篇：纳入；第3篇：纳入；第4篇：纳入；第5篇：纳入；第6篇：纳入；第7篇：纳入；第8篇：纳入。请同步到GitHub的审核记录，未决定的保留pending；新纳入仅在下一合法08:00正式发布槽发布，并继续核验首次在线日期。

## 执行与证据

2026-10-15 的精确配对审计 `audit/unresolved-latest.json` blob `ae0c49d6213156abc2cbd0e38a2cb1ff6e2a43a6`，其中 209 DOI 唯一。原审核 `audit/prepublish-review-2026-10-15-0800.json` 209条 29 include/172 exclude/8 pending。读取当时 main head `c82486073043de0b9ed6bcf57bb72e29c80ada51` 并验证八篇与原pending精确一致、corrections排除名单不相交。

用户指示下对以下 8 篇均执行最终范围 `include`（保留以前的 firstPass/challenge 原始pending事实和证据缺口，并标明人工override；不将批准冒充独立审阅原文）：
1. `10.1021/acscatal.6c06572` ACS Catalysis，Crossref在线2026-10-14；
2. `10.1021/acs.orglett.6c04101` Organic Letters，Crossref在线2026-10-14；
3. `10.31635/ccschem.026.202608538` CCS Chemistry，Crossref在线2026-10-13；
4. `10.1021/acs.joc.6c01296` JOC，Crossref在线2026-10-13；
5. `10.1039/d6sc06226a` Chemical Science，首发日期未证；
6. `10.1039/d6sc05550h` Chemical Science，首发日期未证；
7. `10.1039/d6sc07058b` Chemical Science，首发日期未证；
8. `10.1039/d6sc06967c` Chemical Science，首发日期未证。

日期核验：四篇 Chemical Science 的 Crossref 官方元数据 `published-online.date-parts=[[2026]]`（年份精度），而 `created/deposited=2026-10-14`。通过 TinyFish 直接读取 Crossref 四 DOI 的原始响应并逐条核对；通过其访问 RSC 官方四篇 articlelanding 页面均得到 `bot_blocked`。不得把 created/deposit 当作 first-online，原始 `date=null` 保留。四篇 owner-approved but date-unverified 另置独立发布日期验证 backlog，不列次槽可发布白名单。实际正文/SI的未核实合成泛化证据也保留在审稿记录中。

## GitHub 一次原子更新

原子 main 提交：[dc38a6d7b13911d4747043ddee85498af512eca1](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/dc38a6d7b13911d4747043ddee85498af512eca1)，包括：
- `audit/scope-rechecks/2026-10-15-user-approved-eight-pending-includes.json`：不可变用户决定及原pending证据快照；blob `6e6e98c1919a8fc09168518ca7acdebfe12dc61b`。
- `audit/prepublish-review-2026-10-15-0800.json`：209篇决定变为 37 include/172 exclude/0 scope pending，明确 `status=incomplete_review`、`readyToPublish=false`、`publicationReady=false`、`publishableDois=[]`，包括四项文章日期holds；blob `4a1e31e8512f6a1b3ac9e06894889a1d3df13954`。
- `audit/literature-update-state.json`：历史 pending 8条全部迁入保留原证据的已裁决审计记录，当前 scope pending=0；下一正常08:00（2026-10-16）日期明确候选33篇（原29+本次4）；RSC 首发日未核四篇单独放入 `publicationDateVerificationBacklog[]`；原lastPublication、verifiedThrough和生产记录均不改；blob `506234a59d9b8e1d1e5fe5a0691f90fb4825175f`。

校验： [GitHub Actions prepublish #38670438488](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38670438488) 的「Validate complete handoff and documented decisions」步骤**成功**，正式转换及严格放行检查**失败（按预期安全拒绝）**：本次故意保留不可在当天非固定槽新增、四篇RSC日期未证及次日新快照/双严格门禁尚未通过这些global blockers。`Fixed-slot literature release writer #38670481499` **skipped**。生产marker仍处于10月14日批准的deletion-only纠错，实际文献卡片1087，无本次新增/删改、Pages、TOC媒体、时间任务变化。

## 最终给用户的回报

八篇范围人工决策已全数同步GitHub；原209篇现37纳入、172排除、0篇范围待定。33篇有完整日期的候选承接到下一次北京时间2026-10-16 08:00审核/出版槽，四篇RSC单独保持日期核验阻挡，不将Crossref创建时间当发表日。本次预发布质量记录一致性成功，严格发布门禁安全拒绝，writer跳过；没有提前新增。新一天必须先有fresh同代审计、完整双严格门禁、唯一08:00 writer和Pages线上校验，方能确认真正发表。
