# Tampermonkey 接续：Gallery TOC/正文图线上验收完成

北京时间：2026-10-09 13:05 +08:00
任务：用户在项目「抓取有机合成文献并持续更新网页」中说「继续」，要求承接已批准的 TOC / 正文图不显示问题，完成部署和真实验收。
仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一基线。无任何账号密码、API key、Cookie 或私人 PDF 材料。

## 本次已先发送给用户的阶段性答复（内容同步）

### 最新部署结果
此前两项修复现已完成合并和生产部署：
- PR #430 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/430 修复网页长期打开后 TOC、正文图清单不自动刷新的问题。
- PR #431 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/431 更新线上验收规则，正确识别经过验证的 Figure 1 替代主图。

线上数据：自动验证发布的正文图累计 1049 张，网站公开媒体清单正文图总数 1616 张；最近一批新增39张，涉及8篇文献。前一轮浏览器验收在 DOI 10.1038/s41929-026-01566-z 归档卡片处失败，必须继续诊断，不可宣称所有用户可见。

### 四篇仍然缺失主图
10.1016/j.chempr.2026.103008、10.1016/j.chempr.2026.103043、10.1039/d6sc06407h、10.1039/d6gc03748h 在线 /api/toc 均为 available:false, reason:cache_miss。这些需要 Tampermonkey 专项修复，不能用前端改动冒充 TOC 已抓到。

### 正式浏览器验收通过
GitHub Actions https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37886720069，2026-10-09 13:04（北京时间）返回
NEW_BODY_AUTO_LIVE {"result":"passed","files":1049,"cards":8,"pairedToc":8,"browserRenderingVerified":true}
- 1049张已发布自动正文图逐个源文件 SHA-256 校验；
- 8篇文章云端 Chromium 浏览器真实卡片通过；
- 8篇主图配对通过；
- 正文图加载、图号、URL 和图片解码通过；
- 零生产写入与零私人 PDF 访问。

## 中断后续修复代码及证据
- PR #433 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/433，merge SHA deffac5112484dd9259e9c27d1be03a98c5f6e6f，修改只读验收器网络拦截。此前脚本一律阻止 POST，也误伤纯读取历史文献 D1 catalogue-view 及媒体 batch。修复仅允许严格域名+端点的只读 POST，拒绝写入请求，补充 DOI/页面/媒体状态诊断。独立严密单测与 Required quality gate/Playwright通过。
- 首次生产回归 37885952279：1049 文件哈希通过，但归档 DOI 未出现，诊断 search:null、resultCount864、catalogIndexCapability:null。测试器在 HTML input type=search 填写 DOI 后使用 Escape，Chromium 清空了输入值，故回到 Hot 默认列表。
- PR #434 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/434，merge SHA 5a429f4fe7a3c81ccd865831ad946f608da1c4fd。删除验收器的 Escape，等待 architecture-v1 挂载并断言 DOI 搜索值保留；针对禁用错误按键增加单测。CI TypeScript/安全只读测试/浏览器回归通过。
- 仅更新已存在的 audit/automation-triggers/new-body-auto-live.json 触发一次只读验收，触发提交 3fae12f0bf421ca211c0e2360bf6027b6962b121，没有新增任何文献发布、PDF、抓取或自动任务。
- 旧 CI 的另一个 verify 工作仍因历史 GitHub Actions artifact HTTP 410 Gone 失败，与本次程序逻辑无关；不能将其谎报为绿色，也不能放宽 SHA/来源等约束。

## 最终答复拟文（应与用户可见终稿基本一致）
网页 TOC 和已发布正文图的读取、媒体清单长期缓存及浏览器验收流程均已修复、部署和校验通过。正式网站 https://gallery.gczhouwld.com ，可打开 Science https://gallery.gczhouwld.com/?doi=10.1126%2Fscience.aef3001 和 ACS Catalysis https://gallery.gczhouwld.com/?doi=10.1021%2Facscatal.6c06476 查看 TOC 与编号正文图。若长期开着旧标签页，先切换标签页或手动刷新一次以加载最新前端代码，后续媒体清单会定期有上限地刷新。
Tampermonkey 正式版维持 VPN Bridge 2.2.73 / Engine 6.2.54 / Controller 2.2.41，原脚本链接 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js，不需要为这轮网页显示问题重复安装或重新抓已存图。最新的4篇新文献主图缺项仍为 cache_miss，及 JACS 10.1021/jacs.6c17387 正文图超10张受到媒体发布上限保护；此外 Chem 历史正文图需完善原图来源证据，RSC 私人PDF403不是有效媒体回执。这些是后续真正抓取/媒体准入缺项，不得报告“全部解决”。RSC 公开 HTML 重试遭 bot_blocked，Owner-VPN 诊断仍为后续正确来源。
