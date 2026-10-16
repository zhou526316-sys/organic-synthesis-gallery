# User-visible reply synchronization — historical body v0.2.10, 14/573 with zero new

- Beijing: 2026-10-16 09:24:22 (+08:00)
- Context: user shares actual Gallery independent historical text browser panel, status 14/573, 0 new, 69 existing, 3 uncertain rights, 11 other blocked, 2 retained tabs, 3 diagnostic events pending, last 10.1126/sciadv.aeh2073 with publisher_script_not_confirmed.
- Existing diagnosis audit: `audit/historical-body-review/2026-10-16-historical-text-v0210-14-of-573-zero-save-failure-triage.md`; commit `4b2267e0f5d6dc1681b3aee7935c4e74c5685521`.
- Read-only owner aggregate triggered by metadata trigger commit `f5fc559a9a2cf4367c1ccc667701e7d3d451624c`; no capture/parser/UI source changes or publisher visits performed in this task.
- Per-project feedback approval gate: diagnose and seek explicit approval before repairing latest complaint.

## Visible response in order

这张截图说明：**0.2.10 已经解决了之前的全库清单读取故障，但出版社正文抓取仍然没有正常工作。**

## 当前这轮的实际状态

| 指标 | 含义 |
|---|---|
| 14 / 573 | 本轮573篇待处理论文中，已尝试14篇 |
| 本机新增0篇 | **这轮没有成功保存任何新正文** |
| 已存在69篇 | 当前浏览器数据库已有69条正文记录，尚不代表69篇完整全文 |
| 许可待核实3篇 | 三篇尚未通过许可证确认 |
| 其他受阻11篇 | 其余11篇出现页面或抓取故障 |
| 留供检查2/2 | 保留了两张许可证不确定的出版社页面 |
| 待上传诊断3条 | 三条诊断事件尚未得到服务器接收确认 |

这里的573篇是本轮筛选出的**10月1日前出版社补抓任务**，不是全站文献总数。「全库开放正文补抓（本机）」则是另一条覆盖全部正式 DOI 的开放来源抓取链路。

### 另外确认了一个界面问题

截图同时显示「已暂停」和「准备暂停…」。源码中，最终暂停状态写入界面后才清除内部 `batchPaused` 标记，按钮文字没有再次刷新。因此这两个提示可能同时存在。

这属于**已确认的状态显示缺陷**，不是还在后台继续抓取的证据。

## 最新服务器诊断：新版仍没有成功新增

我刚触发了管理员只读诊断 [#38834544404](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38834544404)，已成功读取最新200条事件。

其中属于 **0.2.10** 的有15条诊断事件，对应12次已上报的独立最终尝试：

| 0.2.10 最终结果 | 次数 |
|---|---:|
| 出版社脚本未确认启动 | 5 |
| 出版社有进度但最终超时 | 4 |
| 许可证仍待核实 | 3 |
| 成功新增正文 | **0** |

这与截图中的14次本机尝试并不矛盾：本机尝试数和服务器已收到的最终回执是两套统计，截图还有3条待发诊断。

这表明故障没有被0.2.10彻底修复，不能只依靠延长等待时间处理。

### 截图最后一篇还有一个明确的授权限制

`10.1126/sciadv.aeh2073` 是一篇真实的 Science Advances 有机合成论文，PubMed Central 已提供正文，PMCID 为 `PMC13394482`。但文章声明的是 **CC BY-NC 4.0**，而不是 CC BY 4.0。PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC13394482/

当前历史正文脚本只接受 CC BY 或 CC0 进行本机自动存储。因此这篇论文即使成功打开出版社页面，也会在现有许可证规则下被排除。

这意味着当前同时存在两个不同层面的问题：**出版社页面接管失败，以及本地科研正文的许可策略过于狭窄**。后者可以研究合规的非商业本机使用路径，但不能直接扩大成公共全文分发权限。

### 已定位的启动时序缺陷及下一步

0.2.10 虽然将用户脚本设置为 `document-start`，但 `batchWorker()` 真正执行要等 `DOMContentLoaded`；控制器却在10秒内没有心跳时判为 `publisher_script_not_confirmed`。这是已确认的代码时序风险，可能把渲染缓慢误判为脚本未安装，尚不能认定全部5次真实失败均由此引起。

建议下一版本仅在独立正文脚本内增加已校验任务 token 的**早期启动心跳**、准确区分页面等待与脚本未注入；修复暂停按钮及已停止状态的残留标签，并在真实失败时保留足够的诊断材料，不修改 TOC、正文图、PDF、SI、公共 FTS 或每日08:00发布。

请先在 Gallery 点击「立即上传待发诊断」（同一浏览器内已保存的密钥无需重输），并暂时保留2个待核实出版社页面，避免在问题未修复前重新盲跑573篇。完成后可在「失败详情」查看实际HTTP状态及故障阶段。

[详细证据与待批准修复清单](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-16-historical-text-v0210-14-of-573-zero-save-failure-triage.md)

**请确认是否批准先修复“早期任务心跳 + 暂停/诊断状态显示”这两项。** 允许非商业 CC BY-NC 正文进入严格本机科研索引属于另一项许可范围决策，我不会在未授权前一起扩大。
