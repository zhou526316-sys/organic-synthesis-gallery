# 第三季度历史回溯续作｜Nature Catalysis 逐期目录与 Q3 真实来源复算

- 北京时间：2026-10-14T13:52:39 +08:00
- 对话上下文：接续用户“继续”，PR #640后的16刊2026Q3历史回溯。
- main唯一基线、历史staging专用分支、08:00唯一文献发布槽。
- 相关更改及合并：PR #642 = 54880f02432cd5d55969982456cda2bd40861645；PR #648 = 2130a1f4a7799200cf43829ddcadcd14829a454a；PR #650 = a952fbf68ffd82b3165bbce1d27011c3520c0e2e。
- 恢复后 staging-only 审计运行：#38518825682。
- 本文是对本次聊天用户可见回复的归档；下面保留分段内容，后续数据变动以官方Git审计为准。

## 本轮用户可见回复正文

### 历史回溯续作：PR #642 已合并

刚刚重新核查 GitHub，**PR #642 的全部五类 CI 已通过，并已合并至 `main`**。

[查看 PR #642](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/642) · [合并提交 54880f0](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/54880f02432cd5d55969982456cda2bd40861645)

这次合并正式保存了 Nature Catalysis 2026年7–9月三期的28条出版社目录记录，以及15篇未收录文献的补充学术判断。其中14篇初步排除、1篇保留证据待核，没有重复纳入已收录的10篇。

**这次合并属于审核数据更新，不是新增文献上线。** 历史审核累计116篇通过、25篇待08:00入库的原有状态尚未因此改变。

### 来源队列交叉核验完成

已逐一读取 Nature Catalysis 在7–9月的12个冻结来源分片。**15篇待处理论文全部能在来源队列中找到，且每篇均有 Crossref 和 OpenAlex 来源记录**；其候选日期与已保存的出版社日期一致。

这意味着下一步可以基于真实 DOI、来源窗口及文件指纹进行状态对账，不需要重新抓取这些论文，也不需要修改原始来源数据。

### 新发现：Nature Catalysis 第三季度来源缺口

对53条季度来源记录重新去重、分类后，得到以下结构：

| 状态 | 篇数 |
|---|---:|
| 已正式收录 | 13 |
| 本轮已完成范围审核 | 15 |
| 已核实的非原创条目 | 1 |
| 仍需逐篇核验 | 24 |
| **合计** | **53** |

剩余24条中，有部分明确属于勘误、Research Highlight 或 News & Views；另有真正的原创研究，必须审查正文贡献，不能全部批量排除。

其中两篇需要重点判断：

- [5-氮杂胞苷生物合成中的酶促骨架编辑](https://doi.org/10.1038/s41929-026-01611-x)：确实揭示了嘧啶骨架向1,3,5-三嗪骨架的酶促重构，但还需判断其主要成果是生物合成机理阐明，还是具有可推广性的制备方法。
- [等离子体辅助 CO₂/CO 电催化](https://doi.org/10.1038/s41929-026-01609-5)：确实生成多种碳产物，不过其核心创新更偏向反应器耦合与产物分布调控，需要与一般有机合成方法区分。

这24条目前仍归于**未完成审核**，没有被伪装为已审核 pending 或永久排除。

### PR #648 已合并，正式启动 Q3 复算

第二阶段代码已通过全部六类 CI，并合并至 `main`。

[查看 PR #648](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/648) · [合并提交 2130a1f](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/2130a1f4a7799200cf43829ddcadcd14829a454a)

已触发原有的独立历史复算流程：[GitHub Actions #38518015247](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38518015247)。

这次复算的目标，是在保留12,286条去重来源 DOI 的基础上，准确区分已收录、审核通过、学术排除、证据待核及真正未审候选。执行过程不访问生产 D1，也不修改08:00发布安排。

### Q3 真实复算成功：未完成候选减少15条

[历史复算 #38518825682](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38518825682) 已成功，重新读取 staging 生成的两份审计文件，时间一致：**2026年10月14日北京时间13:51:02**。

| 第三季度指标 | 复算前 | 复算后 |
|---|---:|---:|
| 去重来源 DOI | 12,286 | 12,286 |
| 正式收录 Q3 | 820 | 820 |
| 历史审核通过、待08:00入库 | 25 | 25 |
| 原审核清单待核 | 2 | 2 |
| 新增出版社学术范围排除 | 0 | 14 |
| 新增独立证据待核 | 0 | 1 |
| **未完成审核或日期核验** | **11,423** | **11,408** |
| 完成的来源窗口 | 192/192 | 192/192 |

新增的14篇排除和1篇待核，都有精确 DOI 与冻结来源证据对应。季度 Research 目录完整性仍未通过验收。

**这些数字已由真实生成的 Git 审计文件确认，不是预测值。**

### 本轮补充验收结论

首次复算 [#38518015247](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38518015247) 曾因对中文“具体转化”描述不合理的25字符门槛失败，Git未把失败数据写入 staging 季度审计。经 [PR #650](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/650) 在真实DOI测试下修复，并通过全部CI后，重新执行了一次完整 staging-only 复算；结果就是上表，并非把失败运行改标成功。

本轮三项合并更改没有新增正式文献、没有访问生产D1、没有修改TOC/PDF/正文图、没有触发18:00补发或Today/Hot/公众号新增。正式目录仍是1087篇，累计历史学术审核通过116篇，25篇等待原定2026年10月15日北京时间08:00发布独立放行；本轮1篇膦甲酸待核不与原2篇合并，也不将37.5%法拉第效率误写为分离收率。

实证快照：staging `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob SHA `71ffe71130ec1a5b7fda37455f21c6be7661eb74`，`quarter-2026-q3-review-worklist.json` SHA `666f9ef0583ee8ece4ee32942bb7872baf835612`，两者同一代次 `2026-10-14T05:51:02.193Z`。16刊出版社Research完整性仍为 false，不得宣称季度验收通过。历史总追踪 Issue #498 已更新且Git GET回读：[本轮续作记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6161882084)。

仍需逐篇核查 Nature Catalysis 24条残余与其他15刊的出版社逐期Research和在线优先条目；未定案不进入永久排除或正式发布。

## Git归档与权限校验

仅在GitHub main新增本回复审计文件；不写任何密钥，不修改学术/业务数据。当前回复归档标记：response_sync_expected_success_after_readback。
