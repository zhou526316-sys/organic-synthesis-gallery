# GPT response log

- Beijing time: 2026-09-24 19:31
- Context: Gallery 架构日审前置要求
- Related functional Git commit: none; this turn updated the scheduled review instruction rather than repository production code/data.

已改。以后每次 Gallery 架构日审都会强制按这个顺序执行：

1. **先对齐仓库**
   - 读取 `zhou526316-sys/organic-synthesis-gallery` 的 `main` 当前状态；
   - 核对最新 `PROJECT_RULES.md`、文献更新协议、生产文献/发布状态、媒体队列、Cloudflare/D1/R2、GitHub Pages 构建与相关前端实现；
   - 不允许直接沿用前一天的仓库快照。

2. **再回忆并核对上一轮结论**
   - 回忆上一版架构日审；
   - 核对你已经确定的硬约束，尤其是“三个月热区”；
   - 列出上一轮尚未解决的问题；
   - 判断哪些设计原则仍成立，哪些因为仓库已经变化需要修正。

3. **再开始当天日审**
   - 必须明确报告“仓库相较上一轮发生了什么相关变化”；
   - 然后重新挑战事实源、归档边界、迟到文献、搜索、媒体、Tampermonkey、Pages、D1/R2、用户状态、统计、审计历史、失败降级、原子发布和性能预算；
   - 明确新增洞见、被推翻/修正的旧观点和当天推荐结构。

4. **只审查，不擅自实施**
   - 日审不会因为认为某方案更优就直接改生产架构；
   - 架构变更仍然等你明确批准。

也就是说，以后日审的固定开头应该先完成 **“仓库事实对齐 → 项目记忆对齐 → 与上一版做差异比较”**，之后才有资格给当天的新方案。
