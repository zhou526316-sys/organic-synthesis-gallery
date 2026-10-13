# Organic Synthesis Gallery — 历史正文一键补抓 v0.2.3 错误状态/许可/服务器日志专项修复验收

- 北京时间：2026-10-13 11:05:10（Asia/Shanghai）
- 用户批准语：“批注”，承接前一条明确询问的三项专项修复（错误码映射、按 DOI/尝试聚合私有报告展示HTTP/事件类型、出版社许可页面过早失败）。
- 项目和仓库：抓取有机合成文献并持续更新网页；`zhou526316-sys/organic-synthesis-gallery`；`main` 唯一生产基线。
- PR： [#582](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/582)，已通过必需 CI 并合并。
- 合并 SHA：`2ddba53ca43d64fd535ae9e3258e4b5a879f1a65`。
- 历史专项 CI [#38338428760](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338428760)：21/21 单元测试成功；Chromium 完整模拟一键批量2篇、local IndexedDB、报告上传回执、401失败保留、服务器报告归并2个尝试/3个事件与HTTP403、PDF reader无叠加、TOC/media POST=0、无正文公共上传。
- 全站 CI [#38338428721](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338428721)：Required quality gate / Playwright interaction regression / Frontend build / Worker dry-run / Production API smoke 全部成功。
- Pages [#38338910914](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338910914)：literature_authorization、build、deploy 全部成功；现有TOC+正文图原子合并、Hot/Archive、账号、PDF相关门禁均成功，未重启或跳过。
- 线上真实读回 `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`：`@version 0.2.3`，实际包含 `page_http_error`,`page_access_blocked`,`batchNormalizedStatus`,`batchGroupServerEvents`,`batchAwaitPublisherDomChange`,`失败详情`，经 TinyFish `ttl=0` 读回确认。
- 正式 `https://gallery.gczhouwld.com/release-delivery.json` 读回 `sourceCommit=2ddba53ca43d64fd535ae9e3258e4b5a879f1a65`、`productionCards=979`、`publicationSlot=2026-10-13T08:00:00+08:00`，与本轮已授权发布快照一致。
- 管理员诊断 API `GET https://api.gczhouwld.com/api/admin/historical-text/reports?limit=1` 未携带用户密钥返回 HTTP401，是权限保护生效，不表示用户凭证失败。此前已批准/部署的私有 D1 报告接口及媒体 PDF 路径这次均未修改。

## 具体修正

1. BATCH_ERRORS 新增原先缺失的 `page_http_error`、`page_access_blocked`、`page_unavailable` 等正确结果枚举，错误阶段映射 `publisher_page` 不再误显示 `finished`。实际 HTTP403、429 时，最终不再变为 `invalid_response`；浏览器未提供HTTP证据时显示 `HTTP 未知`。保留 DOI 身份检查/隔离，修正期间曾出现“跨标签页误认”单测失败，已回退到原安全行为，最终21/21通过。
2. 新增 `batchGroupServerEvents`：GET 最近100个**事件**，按 `DOI + jobId` 合并为尝试，优先展示最终结果、展开检查点历史，显示真实/未知 HTTP、阶段、英文代码、中文原因、事件数、尝试数与去重 DOI 数，避免截图中同 DOI 的检查点+终态两行被误认两篇失败；只读管理员接口，未改变任何服务器权限。
3. 页面许可判断不再简单固定两次700ms后无CC即成功/失败；逐任务验证 DOI 和页面文档就绪、文章根节点和 legal CC evidence，使用**相关 DOM 变化触发+约3.2秒总探测上限**，稳定已加载网页无授权快速按 `license_not_verified` 结束，不将其视为没权限；尚未形成完整文章则 `page_unavailable`；真正登录/人机验证 `page_access_blocked`。无额外出版社请求、不绕过限制，不使用OpenAlex许可标签单独授权全文复制。没有提高付费历史论文的默认全文再利用权限，也不会上传旧论文PDF/SI/正文图。
4. 改进显示“许可待核实”而非“无权限/无许可”，保持历史本机已保存的40+篇数据与后端原报告不删除。旧历史报告中的 `invalid_response` 不能自动变成明确 HTTP 类型，只有更新0.2.3之后的新尝试才产生新证据。

## 变更文件严格隔离

- `public/gallery-historical-text-pilot.user.js`
- `scripts/test-historical-text-batch.mjs`
- `scripts/test-historical-text-batch-browser.mjs`
- `docs/historical-text-search-pilot.md`
- `.github/workflows/github-pages.yml`（仅 v0.2.3 安装版本验证）

**没有修改**原 TOC 6.2.x、正文图、PDF、私人 Evidence/媒体上传后端，正式北京时间每日唯一08:00新增发布不变。本次用户的原有执行批次不具备自动重映射历史日志的能力，建议先暂停旧批次、更新独立0.2.3、刷新Gallery首页，查看「服务器报告」的归并详情，再按需要明确点击「复查受阻项」。仍必须维持浏览器在线，付费正文不能因校内可读而自动公开搜索。

## 本轮已发用户可见阶段性答复

1. “按前面的三项修复建议，将批注视为批准执行…先修正HTTP错误…报告…许可证检查…不触碰TOC正文图PDF。”
2. “第一轮CI发现一个回归：新增DOI不匹配处理会把其他标签页误当成当前任务…已恢复隔离…”
3. “专项测试21/21通过，Chromium验证了服务器报告按DOI+任务归并…”
4. “0.2.3已通过全站质量门禁并合并，PR#582合并SHA…”
5. Pages发布期间多次用户可见进展：文献08:00门禁通过，媒体合并不跳过，静态构建、Hot/Archive、账号、PDF验收、上传与deploy全部逐步通过。

## 用户可见终结答复（实际发前需与本记录一致）

“历史正文独立补抓 0.2.3 已部署并通过线上版本核验：正式入口 https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js，PR #582、CI与Pages全部成功。处理的3项：HTTP403/429不再被误标为无效回执，报告将检查点/最终归并并展示真实/未知HTTP，许可识别区分动态页面未就绪与稳定网页尚无CC授权、优先使用DOM变化避免无用固定等待。现有已存正文和诊断不删除，原 TOC/正文图/PDF任务及每日08:00正式发布不变。更新建议：停止/暂停原批次→安装0.2.3→刷新Gallery→点击服务器报告看按DOI/尝试分组，针对阻断项仅在有访问/许可证据时点击复查。旧0.2.2误分类的历史事件无法自行补成真实HTTP；本次模拟测试与线上部署并不等同已对用户浏览器所有743篇真实抓取成功，还需观察新的浏览器报表。” 
