# Gallery 界面优化主线接续与核验

北京时间：2026-10-09 11:36:59

对话上下文：用户请求“接续界面优化的工作，承接全部记忆”；恢复既定前端界面优化任务。没有未获批准的新功能代码改动。

## 本轮用户可见回复（原文）

已承接 Organic Synthesis Gallery 的**界面优化主线**。我已重新核对 `main`、项目规则、此前的反馈审计、最新合并记录和正式域名发布标记。以下以实际仓库和部署证据为准，不会重复开发已经修过的功能。

| 事项 | 接续核实结果 |
|---|---|
| **#40 卡片不显示“正文图待抓取”** | [PR #393](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/393) 已合并；保留现有修复，后续只检查中英文是否仍有残余提示。 |
| **#41 手机首屏及 TOC 加载慢** | [PR #396](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/396) 已合并，采用优先显示可见 TOC 的方案；是否仍有真实移动网络瓶颈，需要性能实测，不能凭感觉重写。 |
| **#42 状态弹窗方向、遮挡** | [PR #419](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/419) 和 [PR #423](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/423) 均已合并；正式域名手机、桌面共 **4/4** 场景通过实际可见性与点击区域验收。 |
| **10 月 9 日文献上线** | [PR #425](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/425) 修复旧正文图回源 503 阻断 Pages 的问题。正式域名发布标记核实为 **915 篇，其中 10 月 9 日 08:00 新增 28 篇**。 |
| **今日 TOC 已抓到却不显示** | [PR #426](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/426) 已修复自定义域名媒体 API 错误回退；[线上图片摘要校验](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37879810719) 已成功。10:27 的逐篇 API 核对为 **28 篇中 24 篇有主图、4 篇缺图**；这不等同于已证明所有用户浏览器都能显示每张图，剩余 Chem/RSC 缺图由 Tampermonkey 线处理。 |
| **PDF 阅读方式** | [连续上下滚动提交](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/bdacd9f3af84185a08046bde2b263da99166be7e) 已进入 `main`，在线和本地阅读器均改用 PDF.js 连续页面、按需渲染。现场读取的线上发布源提交晚于该改动，但带权限的真实 PDF 操作仍需单独验收，不能仅凭编译通过宣称全部完成。 |

原有界面要求继续保持：**桌面每页 24 篇、手机 12 篇**；手机一行一张卡片、反应图优先可读；分页按钮加大居中、可选页码和跳页；每日新增按 Nature、Science、Nature 子刊、JACS、Angew、Chem、ACS Catalysis 等既定优先级排序；卡片操作按钮齐整、TOC 与中英文摘要合理呈现。Science Advances 论文 `10.1126/sciadv.aed4187` 的正确发表日期为 **2026 年 10 月 7 日**，已有针对该 DOI 的前端展示修正，正式数据更正归固定发布写入者处理。

界面优化继续与其他工作线隔离：**`main` 是唯一正式基线，公开入口为 [gallery.gczhouwld.com](https://gallery.gczhouwld.com/)，正式新增只允许北京时间每天 08:00，绝不恢复 18:00**；10 月 1 日之后文献的 TOC、正文图、全文及私有 PDF 抓取归 Tampermonkey 链路，PDF 权限与本地存储归架构链路；三个月冷热分流不能因界面修改被破坏。公众界面不暴露内部模型名称或抓取队列术语。

**下一处明确的界面验收重点**是正式浏览器中 10 月 9 日主图的实际呈现、手机首屏 TOC 性能及新 PDF 连续滚动的真实操作。这次先完成状态接续和只读复核，**没有重写 #40/#41、改动正式文献、启动额外发布或触碰其他工作线**。对新吐槽继续严格执行“先核实并给出证据和影响，再由你批准修改”的项目规则。
