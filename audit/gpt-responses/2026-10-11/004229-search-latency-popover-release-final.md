# Gallery 搜索速度与建议弹窗批准修复 — 最终答复同步
北京时间：2026-10-11 00:42:29 (Asia/Shanghai)
对话：用户“搜索的速率太慢。而且有时候搜索的提示窗还会不消失，影响观感”→“批准”→多次“继续/连接中断请继续”。

## 实施与用户可见分段回复

### 已向用户发送的第一部分
已恢复此前中断的工作，并核对了最新仓库状态。

**搜索提速和提示窗基础修复已经合并上线**：包括缩短搜索防抖、取消过期请求、短时缓存相同查询，以及修复点击建议后弹窗残留的问题。最新正式网站的 LMCT 和中文关键词检索验收也已通过。

本轮额外补上了“文献卡片加载较晚，导致关键词建议不出现或关闭后异常重开”的处理，并提交 [PR #525](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/525)。前端构建、Worker 和 API 检查已通过，桌面及手机浏览器交互测试正在执行。

### 已向用户发送的第二部分
进一步核对发现，并行工作中的 [PR #524](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/524) 已先于 PR #525 完成相同修复，而且包含更完整的手机、桌面浏览器测试。

我已确认 PR #524 的质量门禁通过，并关闭了重复的 PR #525，避免两个版本相互覆盖。最终采用 **PR #524**，其中已包含异步候选恢复、关闭后不自动重开，以及 Chromium/WebKit 双浏览器回归。

### 已向用户发送的第三部分
**搜索提示窗补充修复已正式上线。** [Pages 部署 #38067650301](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067650301) 显示完整成功，正式域名与文献交付检查也都通过。

此次上线保留了搜索提速、LMCT 全库摘要检索和原有分页功能，并补齐候选词延迟加载、关闭后不再被卡片刷新重新弹出的处理。

## 最终拟发用户答复全文

**已修复并完成正式部署、验收。**

搜索方面，已经实施 **135 毫秒输入防抖、取消过期检索、同条件 30 秒内复用已验证结果**，并避免按键过程中反复重建卡片、加载媒体和 PDF 模块。它减少的是前端不必要的等待与重复工作，不声称已测得用户国内网络的绝对耗时。

提示窗方面，修复了点击建议后旧菜单残留、加载中没有候选、卡片补齐后不显示建议，以及按 Enter/Esc、点击外部、滚轮/触屏手势、切换标签、失焦或组件重挂载后菜单再次冒出来等问题。滚动仅在用户真实操作时关闭，避免页面自动滚动误关。

**部署与验收：** [PR #524](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/524) 已合并，[Pages #38067650301](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067650301) 成功。完整 [Site quality gate #38067284091](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067284091) 通过，包括 390/1280px 的延迟候选、Esc 后不复活、重新输入、点击外部及 WebKit/Chromium 回归。最新正式浏览器 [检索验收 #38068566150](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068566150) 桌面/手机全部成功：LMCT 两端均显示 11/11；轴手性全库25篇，桌面第一页24篇，手机第一页12篇；5个关键词均使用GET，没有请求失败或JavaScript异常。

可在 [Gallery 主站](https://gallery.gczhouwld.com/) 按 **Ctrl + Shift + R** 刷新一次，再测试搜索输入、推荐提示和关闭行为。此修复不影响每日北京时间08:00发布、文献收录、原文摘要、TOC或PDF权限。

## 客观审计
- 已实施：PR #506、#512、#517、#521，以及最新合并 PR #524，最后合并 SHA `e8fc94e869c15de2d333d5ce8eac727232f42857`。
- 本轮并行分支 PR #525 关闭未合并（与已经上线的 #524 重复），避免冲突；旧 PR #520 仅作先前方案参考。
- 完整质量门禁 #38067284091 全绿，包含 Playwright WebKit/Chromium；Pages #38067650301 build、deploy、canonical verification 均 success。
- 同步后索引 #38068493122 success；首轮 #38068487630 曾遇单一静态 shard HTTP 503，随后重试成功，不标记为数据库记录缺失。
- 最新线上检索 #38068566150：desktop 1280 and mobile 390 both success, LMCT matched/shown 11/11, ligand-to-metal 11/11, 配体到金属电荷转移 11/11, 手性磷酸 11/11, 轴手性 matched25/shown24 desktop or shown12 mobile, 0 fetch failures, 0 page JS errors. 25 是同代际全库匹配数量，非期刊全部历史发表数量。
- 速度改动代码主干：`src/main.ts` 135ms debounce with pending lightweight rendering and query cancellation; `src/literature-catalog-view.ts` 30s validated result cache; `src/platform-api.ts` abortable public GET and compatibility fallback.
- 提示窗代码主干：`src/user-ui/search-controller.ts` suggestionIntent, stopSuggestions and deferred candidate rehydration; scroll intent ignores programmatic scroll, track outside/touch/keyboard dismissal.
- 未更改正式 DOI 收录或每日 08:00 发布规则；本轮最后只同步项目回复记录。
