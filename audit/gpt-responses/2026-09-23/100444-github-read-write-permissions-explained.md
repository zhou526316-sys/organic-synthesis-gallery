核验时间：北京时间 2026 年 9 月 23 日 10:04 起。
上下文：解释 GitHub 连接器、Actions 运行令牌与只读验收工作流的权限区别。

**不是 GitHub 连接器整体只读。** 我刚重新查询了你的仓库，返回的权限明确包含 `pull: true`、`push: true`；当前连接器也提供 `create_file`、`update_file`、`update_ref` 等写入动作。不能把某个读取工具或某个验收任务的“只读”，理解成整个 GitHub 都不能修改。fileciteturn648file0L2-L2

这次涉及三个不同层次：

**第一，`GitHub.fetch`／`fetch_file` 本身是读取动作。** 它们负责查看文件、提交和运行状态，修改文件则调用单独的写入动作。工具名称或说明里的“仅 GET／只读”，描述的是该动作，不是整个连接器的授权范围。GitHub 的内容 API 本身也区分读取接口与创建／更新接口。citeturn674486view0

**第二，刚才的“中文标题线上验收”被我主动设成只读。** 当前 `scope-title-maintenance.yml` 已转为验收任务，其中明确设置 `permissions: contents: read`。它只检查网页中文切换，不应再修改仓库；这是对这一工作流的限制，不会撤销我通过连接器修改代码的权限。GitHub 官方也明确说明，工作流中的 `permissions` 控制的是该工作流／作业使用的 `GITHUB_TOKEN`。fileciteturn645file0L2-L2citeturn674486view1

**第三，前一次修复确实遇到了权限错误，但不是“所有文件都只读”。** 当时 runner 已有 `contents: write`，却试图提交 `.github/workflows/literature-fixed-slot-release.yml`，日志明确报错：`without workflows permission`。普通仓库内容写入与工作流配置写入是不同权限；不能因为能改代码，就假定同一令牌也能改工作流。这一步是我选择执行路径不当，不是你没有授权。GitHub 官方对工作流目录的额外权限要求有明确说明。citeturn674486view0

现在，正式文献发布工作流仍保留 `contents: write`；只读的是验收工作流。**修复代码、写审核记录和执行授权发布，不会因为这个验收任务只读就全部失效。**fileciteturn646file0L2-L2

本条说明也已通过连接器写回 `main`，没有修改生产文献。你不需要因此重新连接 GitHub，也不应为了消除“只读”字样，把所有验收任务都开放写权限。
