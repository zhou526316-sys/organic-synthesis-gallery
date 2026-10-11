# Organic Synthesis Gallery｜10月11日发布故障修复结果

**已修复并合并代码，但10月11日新文献未发布。** 北京时间当天08:00发布槽允许的技术执行窗口最晚至09:00；本次处理开始时为09:26，不能把错过窗口的文献补发，也没有改变、停用或新增定时任务。

## 已完成的修复

1. 确认正式writer运行 [#38094778877](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38094778877) 在准备阶段因 `invalid_evidence_sha:pendingQueueBlobSha` 失败，`publicationCommitCreated=false`。预发布Gate [#38094754470](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38094754470) 的成功不能代替发布。
2. 修复了转换器在0条pending时不提供pendingQueue文件SHA、而writer和原子提交脚本均要求校验真实队列SHA的不一致。现在包括空队列在内均按精确 `JSON.stringify(value,null,2)+换行` 绑定真实Git blob SHA，不使用虚假hash或跳过验证。
3. 加入0 pending严格转换/写入校验回归测试，以及阻止将“按用户明确决定记录其题名所示”“证据不足”等模板描述直接当作include实证的门禁测试。
4. 上述修复已经通过 [PR #534](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/534) 合并至 `main`，提交 `e6233f7de84cbd4dd770405e64b07e42752baa6a`。PR的每日发布契约回归、前端构建与类型检查、Worker测试和生产API smoke均已通过；这不等于下一次真正固定槽writer运行已验收。

## 为何不能直接使用今天旧的审核

- 10月11日早间staging为69条候选，标记21纳入、48排除、0待定，其中10条历史pending纳入沿用了原“证据不足”的结论作为纳入依据，违反现行主要贡献与一般制备证据契约。这10条都必须重新写文章特定的两遍理由；其中 `10.1016/j.chempr.2026.103076` 已有正面合成证据，但也不能沿用错误的占位理由。其余9条需继续核实。
- 09:23生成的最新一对machine latest/compact已有 **71条** unresolved，比早间staging多出 **2条**此前未审条目：`10.1038/s41467-026-78603-9` 和 `10.1038/s41467-026-78575-w`（均为Nature Communications）。这说明旧69条审核不能作为最新完整候选集直接重发，新增2条不得被悄悄忽略或假装已经审查。
- 历史两篇用户明确排除的DOI仍保留：`10.1021/acs.joc.6c01600`、`10.1016/j.chempr.2026.103025`。生产目录没有因此改写。

## 生产结果与下一合法槽

| 项目 | 核验结果 |
|---|---|
| 10月11日新文献实际新增 | **0篇** |
| 生产目录 | **938篇** |
| 当前生产marker | **2026-10-10 08:00** |
| 10月11日原子发布提交 | **不存在** |
| 下一合法准入槽 | **2026-10-12 08:00（北京时间）** |
| 今日槽后补发或18:00发布 | **没有，且禁止** |

下一次须使用10月12日的全新机器审计、完整候选集及合格的双遍学术审核；只有既有固定writer、严格转换/授权门禁和真实Pages验收成功，才能认定新增正式上线。代码修复成功与文献实际发布成功是两件不同的事。

本次诊断已留存在 `audit/scope-rechecks/2026-10-11-expired-slot-release-repair.json`；这只是审核交接，不是发布指令或生产写入。
