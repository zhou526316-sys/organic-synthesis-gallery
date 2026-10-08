# 架构 PDF 提速续作：正式交付及用户回复同步

北京时间：2026-10-08T12:33:31.072+08:00
会话：用户提供 1.3 MB PDF 卡在 0.2 MB 的截图，随后要求连接中断后继续。
关联 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/404
代码合并提交：2d2b24875fbdc834359bb6a4f91f11686619c597
Pages 发布工作流：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37727105263
正式站公开发布标记 sourceCommit：2d2b24875fbdc834359bb6a4f91f11686619c597
正式站 PDF 页面可访问；公开 Worker 健康检查 ok=true，privatePdf.readEnabled=true。
七组 PR CI 已成功，包括此前等待的 Site quality gate。没有使用任何用户 token 或下载私人 PDF 来模拟实测。

本轮较早阶段的完整进展已同步至 audit/gpt-responses/2026-10-08/123013-architecture-private-pdf-transfer-progress.md。

## 最终用户可见回复

**本轮 PDF 提速修复已正式上线。**

针对你截图中仅 1.3 MB 的 PDF 获取 0.2 MB 后明显变慢的问题，最新版将 512 KiB–3 MiB 的已授权 PDF 改为最多 4 路并行、每段约 384 KiB 的分段传输；超过 3 MiB 的文件保留按需阅读，并预取文件头和尾部。旧服务不支持 Range 时回退整份获取。另已修复分段请求失败后阅读器可能一直等待的问题，增加安全的阶段耗时诊断。权限模型、私有 R2 存储及普通用户本地 PDF 功能均未改变。

[PR #404](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/404) 已合并，正式 [Gallery 主站](https://gallery.gczhouwld.com) 的发布标记已核实为合并提交 `2d2b2487`。七组 PR 检查和 GitHub Pages、Worker 相关发布检查均成功。

**请关闭旧 PDF 标签页，从主站重新打开之前那篇 1.3 MB 文献。** 新版应显示“正在并行获取 PDF…”。目前还缺少你所在网络和账号下的真实耗时数据，所以不能仅凭自动化测试认定速度已达标。如果仍然慢，请提供 DOI、点击到第一页出现的实际秒数，以及最后显示的进度；不要提供带 token 的 PDF 地址。
