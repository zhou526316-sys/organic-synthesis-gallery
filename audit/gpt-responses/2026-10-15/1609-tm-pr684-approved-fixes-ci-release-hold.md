# Tampermonkey PR #684 — approved fixes, CI acceptance and independent literature-gate hold

**Task / conversation:** 用户已批准对 2026-10-15 Tampermonkey 新浏览器日志暴露的三项问题进行修复。
**Audit date:** 2026-10-15, Asia/Shanghai (Beijing afternoon).
**Repository:** `zhou526316-sys/organic-synthesis-gallery`.
**Implementation:** [PR #684](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684), branch `fix/tm-stage-heartbeat-pdf-recovery-20261015`, current tested head `361d7e44c0112ebb62987b87d9fd47619af92a7d`.
**Status:** Code and local CI completed. Do not describe production as upgraded: PR remains OPEN/UNMERGED, **26/27** workflow checks success, 1 independently broken literature release gate. No media/PDF mutation and no additional literature releases.

## 完整用户可见答复（归档）

### 验收与部署结果

三项已批准的代码修复已提交到 [PR #684](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684)，并完成针对性回归：

| 修复项 | 已完成工作 | 回归结果 |
|---|---|---|
| 正文图 R2 暂存索引 | 原 6 MB 限制扩大为受控 32 MiB，区分索引超限/读取失败/JSON 损坏/结构错误，保持已有索引、ETag 比较写入和旧媒体 | 15/15 项存储测试成功，包括已有大于 6 MB 的完整索引不丢记录、新图片可追加、真正损坏时拒绝覆盖 |
| 出版社脚本心跳 | 未返回有效心跳时有限提前结束单篇任务；首次失联后下一篇前台重试，连续三次无心跳暂停本轮新页面派发，保留待处理 DOI 和真实失败报告，出版社 auth/challenge 不被绕过 | 4/4 项专项测试成功，相关控制器/队列回归成功 |
| 私人 PDF 上传 | 已下载 PDF 在上传截止或可重试 500/502/503/504 时进入原有 owner 本地哈希校验补传；先查远程库存，若已经完整则不重复上传；401/403/429 不绕过 | PDF replay 新旧回归通过 |

版本源码已改为 VPN Bridge **2.2.86** / 内嵌引擎 **6.2.67**，底层 capture protocol `6.2.20` 与 controller `2.2.41` 保持原样。

**CI：26/27 个工作流成功**。唯一失败 [Site quality gate #38702470614](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38702470614) 不属于此 PR 的代码修改：正式文献标记绑定 `public/rolling-supplement.json` 的预期 Git blob `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`，但另一工作线通过 `17ca9862a1d397c98d6e8890e9defd1899c66833` 给 Nature DOI `10.1038/s41586-026-11242-8` 补作者后，main 的文件 blob 变为 `28f3238f45b380855f68fc7ab79da03ba4c9f181`，没有同步相应受保护发布标记。两版文件差异是原有 DOI 的作者元数据，不是新增文献；PR #684 没改过任何正式文献文件或发布标记。Git compare 表明该 PR 的文件与并行 main 变动没有重叠。

根据 `PROJECT_RULES.md` / `docs/fixed-slot-release-handoff.md`，不能为合并媒体修复而跳过文献完整性门禁，也不能未经单独许可删除作者或改写冻结发布标记。因此 **PR #684 目前仍未合并、未部署**，现有正式安装包还是 Bridge `2.2.85` / 引擎 `6.2.66`。不能把新版 `2.2.86` 当作可用的生产下载。

已在 [PR #684](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684) 留下阻断依据及协调评论（comment ID `6187549527`）。待负责文献数据的独立工作线合法处理作者补录与发布标记一致性后，应复跑 Site quality gate，严格 27/27 通过再合并/部署并回读双域名安装包；真正的 RSC/ACS/PDF 媒体补齐仍需用户实际浏览器新日志验证，不应以静态 CI 冒充真实抓取效果。

本轮没有停掉仍运行的旧版抓取，没有覆盖 R2 旧正文图、私人 PDF、权限，也没有触发新的 08:00 以外文献发布。

## Git evidence

- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684
- tested head: `361d7e44c0112ebb62987b87d9fd47619af92a7d`
- 26/27 workflow results from `fetch_commit_workflow_runs`; 1 failure: Site quality gate run `38702470614`, job `116314109803`, `Validate current production literature marker compatibility`.
- Successful Tampermonkey ACS recovery regression run `38701955533` recorded stage 15 tests, heartbeat 4 tests and bridge bundle release assertion.
- Prior baseline owner upload: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38699137996.
- Unrelated rolling supplement author addition commit: https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/17ca9862a1d397c98d6e8890e9defd1899c66833.
- Protected literature slot marker commit: `aed08cccbe4b0135e7677e2c9d862afe70a2dd05`.
- No production media writes or migrations performed by this audit record.
