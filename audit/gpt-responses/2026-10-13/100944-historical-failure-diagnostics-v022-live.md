# Organic Synthesis Gallery — 历史正文补抓失败诊断 0.2.2 继续与正式线上验收

北京时间：2026-10-13 10:09:44（Asia/Shanghai）
项目：抓取有机合成文献并持续更新网页
本聊天上下文：用户批准了历史正文 0.2.1 增加逐 DOI 失败详情、专属实时诊断上传/回执、分原因重试、哈希和 IndexedDB 真正落盘验证，此轮用户说“继续”以推进 GitHub PR、Worker 与 Pages 验收。
仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一生产基线。
重大边界：未修改原 TOC、正文图及 PDF 采集队列，不影响北京时间每天08:00唯一正式文献发布；历史正文不上传原始受限全文、PDF、图片、SI 或凭证。
原混合 PR #562 因旧 Private PDF 回归禁止 Pages release 与 Worker source 同 PR 更改而关闭，拆分：
- 后端 [PR #564](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/564)，合并 SHA 1796e82274c690be620f4ce07a53442fd846db5d，真实 Worker deploy [#38332262568](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38332262568) completed/success。新增 `historical_text_capture_reports_v1` 专表与 `GET/POST /api/admin/historical-text/reports`，复用现有管理员 Bridge Bearer token 双向鉴权，脱敏固定字段，DOI+eventId幂等保存，服务端回执。
- 浏览器 [PR #565](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/565)，合并 SHA df22771538f5854f8af5dd0564a41e4d7b12307c，全部 Required quality gate、Playwright、Worker dry-run、Frontend Typecheck、历史专项回归通过。历史专项 17/17，Chromium 无真实出版社登录的模拟通过：两篇正文成功写入本机、旧媒体调用为0、PDF reader不叠加、离线待发队列保留、401不删除报告、授权模拟的回执清除待发事件、失败详情可见。增加纯本机管理员 Bridge 写入密钥配置，脚本不会读取其他 TOC 脚本密钥或向聊天发送凭证。
- 正式 [Pages run #38334513326](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38334513326) literature_authorization、build、deploy全部 successful。真实线上 `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js` 经 TinyFish `ttl=0` 读回 `@version 0.2.2`，同时确认包含按钮「失败详情」「服务器报告」「复查受阻项」及专用诊断/outbox路径。正式 `https://gallery.gczhouwld.com/release-delivery.json` 实际 `sourceCommit=df22771538f5854f8af5dd0564a41e4d7b12307c`、`publicationSlot=2026-10-13T08:00:00+08:00`、`productionCards=979`。新私有诊断 API 匿名 GET 实测 HTTP401。
- 后端真实授权 POST=200 通过 Node D1/Worker integration 测试；**没有在用户真实浏览器使用已有真实管理员密钥进行线上 POST 成功验收，不能称已经实际收到某次用户历史抓取失败报告**。
- 旧 0.2.1 遗留本机 IndexedDB attempts 仅有状态+时间，无法事后恢复已丢失的 HTTP 或页面失败过程。0.2.2 后才记录具体阶段、原因码、真实可证 HTTP 状态，且仅在管理员本机完成专属密钥配置后才近实时向服务器发送。未配置密钥会显示「仅本机/待发送」，原文始终不上传。测试用假 token 不能等同真实生产回执。

## 本次实际用户可见回复（合并的阶段性与终结性答复）

## 历史正文诊断后端已上线

[后端 PR #564](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/564) 已合并，正式 Worker 部署成功。

我还实际访问了新的历史诊断接口：

`https://api.gczhouwld.com/api/admin/historical-text/reports`

未携带管理员凭证的请求返回 **HTTP 401**，确认该接口没有向普通访客开放。自动化测试也通过了授权写入、报告查询、重复事件去重和敏感字段拒绝检查。

浏览器端 [PR #565](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/565) 的必需 CI 已全部通过，接下来进行合并与正式部署。此时线上脚本仍为 0.2.1，尚未启用新版失败上报。

## 0.2.2 浏览器端已合并

[PR #565](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/565) 已通过全部必需检查并合并至 `main`，提交为 `df22771538f5854f8af5dd0564a41e4d7b12307c`。

正式 Pages 发布任务 [#38334513326](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38334513326) 已自动触发。现阶段不需要修改现有 TOC、正文图或 PDF 脚本。

新版启用后，你可以直接在 Gallery 首页左下角的「历史正文 · 独立补抓」面板操作：

1. 点击 **失败详情**，查看每篇 DOI 的失败阶段、原因和时间，并按 DOI 或原因筛选。
2. 点击 **配置诊断上报**，在自己浏览器中填入已有的管理员 Bridge 写入密钥。这只需配置一次，**不要把密钥发到聊天中**。
3. 点击 **服务器报告**，查看服务器实际收到的诊断记录；上传失败时报告会保留在本机，待重新连接后发送。
4. **一键补抓全部缺项**会继续尝试可恢复的失败；**复查受阻项**则用于你主动决定重新检查许可或页面访问受阻的文献。

旧版 0.2.1 已经丢弃的详细失败原因无法自动还原；新版本会从之后的真实抓取尝试开始保留完整记录。即使不配置服务器密钥，本机失败详情仍然可以使用。

## 0.2.2 已正式上线并通过线上回读

[安装／更新历史正文补抓 0.2.2](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)

[Pages 发布 #38334513326](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38334513326) 已成功。我重新读取了正式安装脚本，确认它实际包含 `@version 0.2.2`、「失败详情」「服务器报告」「复查受阻项」及独立诊断上传队列。

同时，正式网站发布清单与本次前端合并提交 `df22771538f5854f8af5dd0564a41e4d7b12307c` 一致。当前正式目录为 **979 篇**，没有因为本次历史正文功能改动而重新发布历史论文。

新诊断接口的匿名读取仍返回 **HTTP 401**，符合管理员访问保护要求。

## 终结说明

现在可以更新这一条历史正文 Tampermonkey 脚本，原 TOC、正文图、PDF 脚本不需要修改。只要在你的浏览器中开始或继续批量补抓，就能在「失败详情」中看到新版 DOI 级失败阶段/状态；在「配置诊断上报」中自行填入现有管理员 Bridge 密钥后，诊断元数据近实时上报，「服务器报告」能查询收到的记录。如果网络或服务器未给出有效回执，脚本会显示待发送并保留本地记录，不会误报上报完成。不会保存/上传旧文献 PDF、SI、正文图或受限全文，也不重置 TOC/PDF 的任务队列。当前已通过部署、403/401安全门禁及 Chromium模拟，**尚未在用户真实浏览器完成一个真实出版社的失败记录→云端授权回执闭环，因此不能断言已经收到了用户的真实失败日志**。旧版缺失的详细诊断无法反推。
