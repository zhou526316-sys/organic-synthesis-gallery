# Gallery PDF owner authorization both-failed: 只读诊断、审批待定

北京时间：2026-10-08T14:31:42.518+08:00
对话：2026-10-08 Gallery PDF 架构续作，用户上传 DOI 10.1021/acs.orglett.6c03725 的 PDF 阅读错误截图。
当前模式：read-only diagnosis, approval hold。没有更改 src/、Cloudflare Worker、生产数据、账号权限、PDF 存储、文献发布或 Tampermonkey。

## 截图证据
- DOI: 10.1021/acs.orglett.6c03725
- 阶段 authorize, pdf_authorize_timeout, 总计约 15.0 s, 授权 15044 ms, PDF.js 组件 801 ms，授权线路 both-failed。
- 尚未获得签名 PDF 文件地址；无证据表明 1.3MB 文件获取/Range 本身是本次错误点。
- both-failed 是 getPdfSource() deadline fallback，不能认定两条 Worker 线路均返回了错误状态。

## 主仓库 main（只读核查）
- PROJECT_RULES.md：吐槽必须先核实并由用户批准具体条目/批次后才能写修复代码。
- src/private-pdf-reader.mjs：主域 https://api.gczhouwld.com 与备用 https://organic-synthesis-gallery.zhou526316.workers.dev；主路超 3500ms 则启动备用；总超时 15000ms；授权结果丢失分阶段细节。
- cloudflare/worker/src/private-pdf.js：openPrivatePdf() 顺序调用会话 D1，用户 capability D1，文献 D1，R2 16byte Range 验证，发出票据（必要时写 D1）。
- cloudflare/worker/src/index.js：POST 授权使用带 Authorization 的跨源请求，存在 CORS OPTIONS 预检。健康接口只返回 DB/R2 绑定和开关状态，不执行 D1/R2 授权依赖。
- .github/workflows/deploy-worker-frontend.yml：生产端 wrangler.frontend.toml 动态生成，未包含 observability tracing 配置。 cloudflare/worker/wrangler.toml 也未包含 tracing 配置。
- 备用域名与正式 API 实际共用 Cloudflare Worker/D1/R2，并非独立容灾。

## 安全且有限的匿名端点检查
TinyFish 公开 GET，无用户凭证/私有 URL：
- primary /api/_healthcheck 约326ms，primary /api/user-ui/private-pdf/status?doi=... 匿名约331ms；
- backup /api/_healthcheck 约337ms，backup 同匿名状态约286ms；
- 两条返回的是匿名 authenticated:false 等状态，无法推断用户网络/登录 D1/R2 访问速度；
- gallery release-delivery sourceCommit acdeeb49cb57a1b421051b53e84eabd453fc2f3c。
- CaaS 环境 curl DNS 解析失败，该失败不属于用户连接诊断，不作为结论。

## 外部技术依据
Cloudflare Workers Tracing 自动观察 D1/R2 span 的官方文档：
https://developers.cloudflare.com/workers/observability/traces/
https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/
Cloudflare Workers Logs:
https://developers.cloudflare.com/workers/observability/logs/workers-logs/

## 本轮用户可见回复内容（合并三段分次答复及结论）
这张截图确认：上一轮 PR #411 的授权容错没有解决实际问题。
针对 DOI 10.1021/acs.orglett.6c03725：
- authorize，pdf_authorize_timeout；
- 授权 15044ms；阅读组件 801ms；线路 both-failed；
- 尚未开始传输 PDF 文件。
不建议继续增加下载并发或仅调大 15s 的超时。

仓库核查：两个 Worker 域名不是后端独立容灾；openPrivatePdf 有多次 D1、R2 顺序操作；UI 当前没有 OPTIONS/POST/后端内部时序。公开匿名状态与健康检查从远程环境很快，不等于授权请求没有问题。
Cloudflare 提供原生 tracing，可见 D1/R2 子请求。仓库和生产生成的 wrangler 配置都没有 tracing 明确开启的配置（不能排除 Dashboard 另有设置）。

最终追加回复：
进一步核对实际生产部署脚本 `.github/workflows/deploy-worker-frontend.yml` 后发现，它动态生成的 `wrangler.frontend.toml` 同样没有启用 Tracing 的配置。Cloudflare 官方文档支持对 D1、R2 调用进行自动追踪，但要取得这次真实失败的内部耗时，仍需要生产环境中的追踪数据。

截图中的「按需阅读」「浏览器阅读」「下载 PDF」均复用授权接口，所以单纯切换按钮不能避开本次 `authorize` 超时；如果你已在本地保存该 PDF，则可以暂时使用独立的本地阅读功能。

**本轮只做了只读核实，没有再次提交性能修复或修改生产数据。** 按项目现行的反馈审批规则，我建议先开启短期、受控的 PDF 授权链追踪，区分浏览器 OPTIONS/POST 与 Worker 的 D1/R2 耗时，再依据证据做单点修复，而不是继续盲目更换线路。

**是否批准我先针对这个授权故障部署脱敏诊断，再按诊断结果进行定向修复？** 我不会要求你提供账号令牌或完整 HAR。

response_sync: committed, code_change: none.
