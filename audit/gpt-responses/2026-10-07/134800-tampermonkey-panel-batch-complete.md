# Tampermonkey 第一批面板修复完成

- 北京时间：2026-10-07 13:48
- 对话：接续 Tampermonkey；截图核实后的第一批修复；用户 13:31:57 同意。
- 功能提交：2f6c1261992e63332f76612f179ad3c5818e94d6
- 测试样例修正提交：4d6228ef1b8fb9d7e29dd130f2ec6de54b77f156
- 终点证据：panel run 37577437599 成功；queue run 37577960053/job112650978887 所有实际测试和构建步骤成功；Worker deploy run37577562440/job112649769066 成功。
- 线上回读限制：TinyFish target_unreachable；本地 curl 3秒连接/8秒总预算遇 Proxy CONNECT timeout；web open 不支持该 JS URL。未将部署成功等同于已经直接读到线上 metadata。
- 后续范围：自动续跑、分层错误详情及 RSC 新回执验证仍未在本批处理。用户采集未重启；没有第二次部署。

## 完整用户回复

第一小批已完成，版本为 **Bridge 2.2.60／安装版 6.2.41**。

### 已改进的三处

| 项目 | 现在的表现 |
|---|---|
| 最近进展时间 | 根据当前任务、采集进度和最近完成回执计算；单独显示本轮开始时间，避免把整批运行时长误当成停滞时长。没有有效记录时显示“尚无采集进展”。 |
| 空闲时的 PDF 提示 | 没有当前文章时显示“等待下一篇”；正在处理文章且确实无需抓取 PDF 时，才显示“本篇无需抓取 PDF”。 |
| 控制器状态 | 区分当前控制页持有任务、另一控制页持有任务、暂停和上次任务中断，避免一直含糊地显示“等待启动”。 |

这批调整只影响状态展示，采集、暂停和自动恢复行为保持原样。[对应代码](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/2f6c1261992e63332f76612f179ad3c5818e94d6)

### 验证结果

**31 项面板状态检查、18 项队列检查均通过**，桌面与窄窗口面板、61 篇队列的实际浏览器回归也已通过。发布后发现的旧测试样例不兼容已一并修正。[面板验收](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37577437599) · [队列回归](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37577960053)

[主域部署已成功](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37577562440)。当前环境未能直接回读在线安装文件，更新后请确认 Tampermonkey 显示 **6.2.41**。

**当前没有文章正在抓取时**，通过 [固定安装入口](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js) 更新脚本，再刷新控制页。

后续待处理的是刷新中断后的续跑，以及 TOC、正文图、PDF 各自失败原因的展示；这轮先停在已验证的检查点，遵守短批次规则。
