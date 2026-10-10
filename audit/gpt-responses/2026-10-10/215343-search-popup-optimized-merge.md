# 2026-10-10 21:53:43 Asia/Shanghai — Gallery 搜索提速与提示弹窗修复（用户批准）

本项目对话：用户反馈“搜索的速率太慢。而且有时候搜索的提示窗还会不消失，影响观感”，核实当前 main，用户明确回复“批准”，授权本轮前端优化及上线。

## 用户可见阶段答复（已发）
**已完成两项优化的代码修改，见 [PR #506](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/506)。**

**搜索速度：** 将全库搜索防抖从 220 毫秒缩短至 135 毫秒；等待索引结果时不再反复重建文献卡片或调度图片、PDF 加载；新关键词会取消过期请求，相同查询可在 30 秒内复用已验证的结果。

**提示弹窗：** 修复选择建议后遗留孤立弹窗的问题，并增加 Enter、Esc、点击外部、失焦、滚动和触屏选择时的关闭处理。

Chromium 和 WebKit 的现有刷新性能回归均已通过。正式部署仍以完整交互测试通过为前提。

## 实际代码与验证
- PR #506 已经 squash 合并到 main，commit `d97cec5fb26d0ffc58088d9b7719cef27197a5ba`。
- `src/main.ts`：D1 搜索 pending 状态只更新轻量 loading DOM，跳过重建和多余 media/PDF 调度；防抖 220→135ms；AbortController 取消正在传输的旧查询；在异步内容地址解析后再次验证代际/serial；记录只含时长的 browser dataset。
- `src/platform-api.ts`：仅对公开文献搜索 transport 传入 AbortSignal，过期取消不重试两个域名与 POST；账号/PDF/媒体保持原样。
- `src/literature-catalog-view.ts`：catalogId + query + 筛选日期/期刊/游标作为短时成功结果缓存键，TTL 30s、上限 32 条，拒绝无效/取消结果。
- `src/user-ui/search-controller.ts`：pointerdown 选择期间抑制 popover 递归创建；统一移除当前节点；支持 outside click、blur、Enter/Esc、scroll、touch、remount/destroy；注销所有额外事件监听与失焦计时器。
- `tests/architecture-frontend.spec.ts`：新增 390px/1280px 弹窗退出、短时间多次按键不反复重建文献卡片、晚到旧查询不覆盖新结果、重复请求缓存行为；校正两条旧测试对必定重新发起网络请求的过时预期。
- 质量门禁 #38056487243 success，全部 30/30 Hot/Archive browser tests pass；UI refresh cost 回归 #38056487260 Chromium/WebKit pass；Cloudflare migration CI #38056487197 pass。
- [Worker 生产部署 #38056963424](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38056963424) success；[Worker frontend sync #38056938467](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38056938467) success。
- 正式 Pages 发布 workflow [#38056938267](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38056938267) 仍 pending，前一正式 Pages 发布 #38056483318 正在执行现有 TOC/媒体/账号/PDF 浏览器完整性门禁；本轮尚不能声称 canonical Pages 已上线。
- 不修改文献 DOI/revision、正式 08:00 发布、TM 引擎、公众号、PDF 权限、账户、采集与历史摘要收录。
- 最终答复需要保留真实部署/验收状态，不能把 PR 合并当正式网页生效。
