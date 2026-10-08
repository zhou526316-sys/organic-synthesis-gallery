# PDF 授权诊断接续与正式站上线核验

北京时间：2026-10-08 15:24:37 +08:00；Project：抓取有机合成文献并持续更新网页；聊天背景：用户“连接已中断”，要求接续已批准的 Organic Synthesis Gallery 私有 PDF 授权诊断。

## 核实结果
- PR #413 已合并，merge SHA 7b0f2b284417595089fbf832d6c1cd09504e4a3f。
- Cloudflare Worker 工作流 37741968866：success；Worker 前端同步 37741968813：success。
- GitHub Pages 工作流 37741968787：literature_authorization / build / deploy 均 success。
- 正式 https://gallery.gczhouwld.com/release-delivery.json 实际 sourceCommit=7b0f2b284417595089fbf832d6c1cd09504e4a3f（初次核查仍是旧版 acdeeb49，后续重新核查已切换）。
- 正式 /pdf/ 页面可访问；Worker 公开健康检查 ok:true，privatePdf.readEnabled:true。
- 私有 PDF 浏览器专项 31/31 PASS，包括脱敏阶段计时、账号/权限隔离，Worker CI/dry-run 验收成功。
- 上线的是诊断，不是已证实能消除 authorize 15s 超时的性能修复。尚无该用户登录环境下真实 DOI 10.1021/acs.orglett.6c03725 的新请求分段数据。
- 诊断阶段采集在北京时间 2026-10-10 00:00 自动失效。一条“一次性到期清理” automation 已创建，将在 2026-10-10 00:10 Asia/Shanghai 检查和关闭临时 Cloudflare Worker 日志配置、诊断开关；若遇冲突或 CI 失败则停止危险修改并汇报。
- 未重新运行、取消或创建额外的文献正式发布任务，未更改 Tampermonkey、PDF 权限或生产 PDF 文件。

## 已展示给用户的答复

“接续上一轮已批准的 PDF 授权诊断，不重新开始。中断前 Worker 已部署成功，PDF 浏览器回归 31/31 通过，但 Gallery 阅读页仍在发布中。我先核对现有 Pages 工作流和主站版本；确认上线后，再检查诊断是否能区分网络、D1 和 R2 的耗时。”

“### 接续后的部署核查

| 检查项目 | 结果 |
|---|---|
| PDF 诊断 PR #413 | 已合并 |
| Cloudflare Worker 部署 | 成功 |
| Worker 前端同步 | 成功 |
| GitHub Pages 构建 | 成功 |
| GitHub Pages 正式部署 | 进行中 |
| PDF 浏览器专项测试 | 31/31 通过 |

刚刚读取正式站发布标记，仍是旧版 acdeeb49，尚未切换到本轮诊断提交 7b0f2b28。因此当前无需重新安装脚本或重新登录，也不需要反复尝试打开 PDF。等新阅读页真正上线后，才能看到完整的主、备授权线路诊断。”

“### 正式部署现已完成

**Gallery 和 Worker 均已部署成功**。GitHub Pages 正式部署成功。主站 sourceCommit 已更新为 7b0f2b28，与 PR #413 的诊断版本一致。PDF 阅读页面可以访问，Worker 私有 PDF 服务正常启用。

现在可以用原来的论文 10.1021/acs.orglett.6c03725 做一次真实复测：
https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Facs.orglett.6c03725

请使用原来已登录的 Edge 浏览器。如果仍然等待 15 秒后失败，新版页面会增加以下信息：主、备授权请求分别等待多久、是否收到 HTTP 响应，以及两条线路的公开 GET 和授权入口是否能连通。

请把新的错误页面截图发来即可，尤其保留‘授权请求’和‘脱敏线路检查’两行，不需要提供登录凭证或 PDF 临时地址。我将根据这些结果判断故障在浏览器到 Worker 的网络连接，还是 Worker 内部的 D1/R2 授权链。”

## 额外补充答复

已安排 10 月 10 日 00:10（北京时间）自动开展诊断到期清理。真正的端到端耗时尚待真实账号测试，不虚报速度恢复。
