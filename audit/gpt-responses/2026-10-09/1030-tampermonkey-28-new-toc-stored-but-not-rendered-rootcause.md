# 10月9日 10:27 Tampermonkey “抓取已补齐但网页一张 TOC 都看不到” 诊断与待批准修复

仓库：zhou526316-sys/organic-synthesis-gallery; main=正式基线。
对话：用户提交 VPN Bridge 2.2.73 / TOC 6.2.54 / Controller 2.2.41 截图，质问“他显示补齐这么多，可是我为什么今天的文献一篇都没看到有toc？”
截图：10月9日约10:27，任务开始08:51:35，主图新21、正文图暂存124、确认补齐22/43、尝试26、TOC缺项19、PDF私库189 ready。
范围：自10月1日起205篇，今天新增28篇。归因不能使用旧的08:00静态 TOC demand 来否定实时抓取。

## 已发送的用户可见部分（原意保留）
开始时说明：会逐篇对照抓取回执、R2 暂存、正式发布和网页实际图片，而不仅信统计。
第二段部分结论：今天真实有主图进入生产 API。直接 GET /api/toc?doi=10.1021%2Facscatal.6c06476 为 available:true、reason:imported、含 imageUrl/contentHash；/api/toc?doi=10.1126%2Fscience.aef3001 为 available:true、reason:figure1_fallback、含 imageUrl/contentHash。新主图21表示本轮主图回执，确认补齐22表示调度器确认任务完结，正文图124是暂存回执，未必公共可见。
第三段部分结论：逐篇实时 GET 今天28篇，24篇 available:true，其中21篇 official imported、3篇 Figure1 fallback；剩余4篇 cache_miss：10.1016/j.chempr.2026.103008、10.1016/j.chempr.2026.103043、10.1039/d6sc06407h、10.1039/d6gc03748h。建议先修前端读取，不重抓已经有24张的 DOI。
第四段部分结论：已定位到 src/platform-api.ts 漏将 Gallery 自定义域名视为 static frontend，导致向网页本域而不是 Worker 发送 /api/media/batch，失败后静默回退到08:00构建的旧静态清单。这解释有已存图却无法在网页呈现。

## 核验数据与证据
1. 用户提供的实际截图为 10:27，显示主图已保存、正在处理 10.1021/acscatal.6c06476 的 Figure 2，PDF等待开始；本轮“确认补齐22”不能证明卡片已显示。
2. main public/toc-demand-live.json generatedAt 2026-10-09T00:00:22.125Z，今天28篇全在当时 no_visual 快照，是抓取前静态状态，不能用其判断10:27现场。
3. 直接只读请求真实 Worker https://api.gczhouwld.com/api/toc?doi=<URL编码DOI> 逐篇28个响应均成功，不是浏览器猜测。24 available、4 cache_miss，全部24含 imageUrl、contentHash。分类：ACS Catalysis2/JACS7/JOC4/Organic Letters6/Angew2 的21篇为 official (reason imported)，Nature Communications1/Nature Synthesis1/Science1 的3篇为 Figure 1 fallback。
4. https://api.gczhouwld.com/api/_healthcheck => ok:true、d1:true、r2:true。Gallery 静态站点的 https://gallery.gczhouwld.com/api/media/batch GET => HTTP404；该接口用于POST，GET404只是支持静态路由缺失的侧面证据，根因依靠仓库源码和 GitHub Pages 架构核实，不单凭 GET 得出 POST 结论。
5. src/platform-api.ts: staticFrontendOnly() 仅为 hostname.endsWith('.github.io') || location.protocol==='file:'，没有 gallery.gczhouwld.com；staticAwarePost('/api/media/batch') 若 incomplete 则 staticFrontendOnly()?workerRequest('POST',path):rawRequest('POST',path)，在 Gallery 自定义域名误走本域；catch {} 静默；随后返回静态 media-index.json，而这个站点构建为早间快照，不含10:27新上传图。 src/main.ts 的 hydrateMediaBatch 调 api.post('/api/media/batch')，renderToc 仅在 Image load 才替换 slot，onerror 没有显示错误。API Worker 的 CORS allow origin 包含 https://gallery.gczhouwld.com 并暴露 POST,OPTIONS；其 /api/media/batch POST 为只读。
6. 跨域图像URL由 Worker生成；分别直接读取图像URL时网页抽取层返回 empty_content（预期对二进制文件不能抽文本）。这不是图片可下载的HTTP验收，不能断言图片本身已通过用户浏览器加载，也不能误称404。
7. 这次没有修改 src/、Tampermonkey、Cloudflare Worker、正式文献、私人 PDF、部署、定时发布；仅产生此审计报告。

## 待用户批准的准确修复范围
- 修复 src/platform-api.ts 的静态站点识别：将 gallery.gczhouwld.com（和经核实受支持的 Pages 域名）纳入；媒体 POST 强制查询 canonical https://api.gczhouwld.com/api/media/batch（不要优先旧 workers.dev 外域），仅成功或显式 fallback 使用合法静态数据。保留离线静态兼容、避免扩大拉取和缓存回归。
- 修复卡片媒体失败可观测性：真实图片加载 onerror 状态/安全有限重试、Web Worker API 失败的独立诊断而非静默“未抓取”；新增测试覆盖自定义域名、24/28真实样例和 Figure 1 fallback。
- 验收时必须从正式自定义域名的真实浏览器读取 media/batch 的 24 篇已存主图，并验证图片URL 200、加载成功/可见；确认部署后才向用户报已修复。剩余4篇是 Tampermonkey 未抓到的独立缺项，继续针对 Chem/RSC 修复。不改08:00唯一正式文献发布槽，也不擅自变更 owner PDF。
- PROJECT_RULES.md 自 2026-09-23 起明确：“吐槽不要直接修，要先给我核实，我来决定”。因此对这次反馈仅诊断，修复必须用户明确批准，不能默默修改分支或生产代码。

## 计划发送的末尾结论
今日 28篇已有 24篇生产 API 返回真实主视觉，其中21官方TOC、3篇Figure1，4篇尚无；生产 API正常但 Gallery 自定义域名的媒体批量读取代码误把它视为动态站点，POST向静态站点同域并静默回退旧镜像。浏览器是否还有图片资源阻断需修复后真实验收。请用户批准定向修复前端媒体读取及错误展示，保留Tampermonkey当前有效抓取与每日08:00文献发布规则。
