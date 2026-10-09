# Continuous PDF scroll — response synchronization

Beijing time: 2026-10-09T10:44:44.949+08:00
Project: 抓取有机合成文献并持续更新网页
Task: User wants “我的PDF是上下滚动的，不要翻页的”.
Read-only feedback verification: [audit/pdf-reader/2026-10-09-continuous-scroll-verified-feedback.md](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/pdf-reader/2026-10-09-continuous-scroll-verified-feedback.md).
No production UI, PDF vault or Tencent gateway changes. Awaiting specific approval according to PROJECT_RULES.md.

## First user-visible fragment
已经核对了 Gallery 当前的 PDF 阅读器。你说的问题确实存在：

- **在线私有 PDF**：目前一次只显示一页，通过“上一页／下一页”按钮切换。
- **本地 PDF 文献库**：同样采用单页显示，还会在切换页面后把滚动位置重置到顶部。

我建议把两种阅读器都统一改成**连续纵向滚动模式**，像正常阅读 PDF 文献一样，滚轮向下滚动就能自然进入下一页，手机则直接上下滑动，不再需要点击翻页按钮。

## Final response continuation
具体采用**连续页面排列 + 按需渲染**：PDF 各页上下衔接，滚动位置决定当前页，顶部仍显示“第 X / Y 页”、缩放和下载功能。大文件只渲染当前可见区域及相邻少数页面，远离视口的页面释放画布，避免几十页 PDF 同时渲染造成卡顿；在线阅读继续使用现有的分段传输机制。

还有一项需要兼容：在线阅读器现在有“从 PDF 找图”和“框选原图”工具。改为连续滚动后，仍应能够定位到指定页，在**正确的原始页面**框选和导出，不得造成图像位置或化学结构失真。

这是独立的阅读界面调整，不会修改账号权限、PDF 存储、腾讯云网关或公众号服务。目前**已经核实设计问题，但尚未修改代码**。

**是否批准在线私有 PDF 和本地 PDF 一起改为默认连续上下滚动，并取消“上一页／下一页”的主要操作按钮？**
