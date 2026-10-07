# Architecture completion status clarification

Beijing time: 2026-10-07 13:17:03 (+08:00).
Context: user asks whether the whole architecture is finished. This is a read-only status review; only this response log is added to Git.
Reviewed main: `a7cca5b3c4488798e9ddbd8803d261d552a616c5`.
Reviewed current-contract blob: `b20980711c42ac84094373c38563433b8a2c44b8`.
Related deployed code: `a999f73eea47f5aebaf391303744aafaf74edf89`; acceptance commit: `323a53fbcc13780d86fb761cebaba87c3c4114e5`.
Evidence priority: current authoritative contract plus latest production acceptance supersede historical phase to-do items and older 826-card canary counts. D3c ordinary-user write authority rollout remains 0%; dormant D2b2 is not a required active-summary cutover. Existing evidence does not establish arbitrary-scale load capacity.

## Assistant progress replies

这批已经上线，但还不能说整个架构都完成了。我会核对当前架构清单，把已完成的部分和仍待收尾的项目列清楚。

核对后，主站防卡顿相关的核心项目都已上线。清单里明确尚未完成的是个人文献库的写入迁移：新方案和切换控制已准备好，但普通用户仍保持 0% 切换，不能算全量迁移完成。

## Final assistant reply

**核心主站架构已经做好并上线，但还不能说所有架构迁移都完成了。** 我上一条说的“完成”，指的是这一批改造。

你最关心的“文献越来越多以后，网页不要因为加载全历史数据而变卡”这部分，核心措施已经落地：

| 项目 | 当前状态 |
|---|---|
| **三个月冷热分流** | 已上线。首页以近三个月为主，旧文献保留，按需查询和访问。 |
| **限制页面加载与显示数量** | 已上线。桌面 24 篇、手机 12 篇；首屏和异常降级都有数量边界。 |
| **历史文献搜索** | 已上线。使用独立索引和分页，当前 859 条记录的一致性验收通过。 |
| **图片展示读取** | 已完成按当前显示窗口处理，避免一次处理所有历史卡片的图片。 |
| **访问统计** | 已上线汇总快照，公开查询无需每次重新计算全部访问历史。 |
| **发布流程归属** | 已整理，前端和 API 各走明确的正式发布流程。 |

以上依据是仓库的[当前架构清单](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/a7cca5b3c4488798e9ddbd8803d261d552a616c5/architecture/CURRENT-CONTRACT.md)和[最新生产验收记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/323a53fbcc13780d86fb761cebaba87c3c4114e5/audit/architecture/responsive-pagination-20261007-production.json)。

### 明确还没完成的部分

**个人文献库的新写入结构，还没有切换给普通用户。** 新结构、回填、切换控制和回退验证已经准备好，但普通用户的切换比例仍是 **0%**，所以这一项只能叫“迁移准备就绪”，不能叫“全量迁移完成”。这是当前需要继续收尾的明确项目。[当前迁移状态](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/a7cca5b3c4488798e9ddbd8803d261d552a616c5/architecture/CURRENT-CONTRACT.md#15-current-priority-order)

另外，已有验收覆盖当前 859 条生产记录、46 项本地回归和 16 项浏览器回归；这些记录还没有提供超大规模文献量和高并发用户的容量实测结果，因此不能承诺任何规模下都不会变慢。[验收范围](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/323a53fbcc13780d86fb761cebaba87c3c4114e5/audit/architecture/responsive-pagination-20261007-production.json)

停用的旧摘要候选模块不属于必须重新开启的收尾项，当前每日摘要不依赖它。[摘要链路说明](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/a7cca5b3c4488798e9ddbd8803d261d552a616c5/architecture/CURRENT-CONTRACT.md#15-current-priority-order)
