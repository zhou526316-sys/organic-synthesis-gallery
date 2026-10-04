# Response synchronization

北京时间：2026-10-04 14:20 +08:00
上下文：Organic Synthesis Gallery 私有 PDF 分级、捕获、阅读、PDF 辅助 TOC/正文图与摘要的长期架构。
本轮仅做架构设计，没有修改生产代码、抓取规则、账号权限或媒体数据。

## Reply body

这个想法值得做，但我会把它定义成一层新的 **“私有 PDF 证据层”**，而不是简单给现有任务再加一个“PDF 必抓项”。后者会立刻把几百篇旧文献都变成“缺 PDF”，反而把现在最重要的 TOC、正文图和新文献任务堵住。

我的推荐架构是：**一个 Tampermonkey 脚本，对用户只维护一个安装入口；脚本内部把现有媒体抓取和 PDF 捕获做成两个完全隔离的模块。PDF 解析与图文提取放到独立私有处理层，不塞进 Tampermonkey 主循环。**

### 1. 账号分级不要做成硬编码“你的邮箱 = 管理员”

当前网站已经有用户、session 和 Bearer token，但账号返回的是基本用户资料，还没有正式的角色/权限层。这里最好增加 capability/entitlement，而不是先设计复杂套餐。

第一阶段只需要三个权限：`private_pdf_read`、`private_pdf_capture`、`private_pdf_process`。你的账号拥有这三项，普通账号一项都没有。以后如果增加实验室成员或其他等级，只是授予不同 capability，不需要重写账号系统。

权限必须由 Worker 服务器端判断，不能只靠前端隐藏按钮，也不要把你的 user id、邮箱或 owner 标记硬编码进公开 JS。

### 2. PDF 必须有独立私有存储，不进现在的公开媒体链

我更建议新增一个单独的 R2 binding，例如 `PDF_PRIVATE`，而不是把 PDF 放进现在用于 TOC／正文图的公开媒体空间。这样即使以后媒体镜像或 Pages 构建出错，也不会把原文 PDF 一并镜像出去。

D1 只保存元数据：DOI、PDF SHA256、出版社、来源 URL、版本类型（Version of Record／Accepted Manuscript／Preprint／unknown）、文件大小、抓取时间、处理状态和版本关系。PDF 本体按内容哈希不可变存储，同一 DOI 后来换正式版本时新增一条记录，不覆盖旧文件。

普通账号永远只看到期刊原文链接；你的账号点击“原文”时，网页先向 Worker 查询权限和 PDF 状态。如果有权限且 PDF 已存，Worker 生成一个几分钟有效、只对应这一份 PDF 的临时访问 token，然后由私有 PDF 路由支持 Range 请求并以内嵌方式打开。真实 R2 key 不暴露，也不写进 public/media-index.json。

### 3. Tampermonkey 用一个脚本，但必须是两个任务通道

我不建议做两个互相独立的 Tampermonkey 脚本。两个脚本会争抢同一个文章页、标签页、出版社访问节奏和任务锁，后面很容易出现重复打开、重复下载和状态互相覆盖。

更稳的是同一个脚本里保持：

`MediaCapture`：现有 TOC＋正文图＋HTML 文本，逻辑尽量不动。

`PdfCapture`：owner-only，可通过服务器 kill switch 单独关闭。PDF 模块异常时，MediaCapture 照常工作。

而且 PDF **绝不能成为现有“缺项队列”的第四个硬缺项**。调度应分成三条优先级：第一条是现在的 `media-critical`，继续处理最新文献的 TOC／正文图／文本；第二条是 `pdf-rescue`，只有某篇 HTML 抓图失败、TOC 难取得或全文证据不足时，才优先尝试该篇 PDF；第三条是 `pdf-archive`，用于你想慢慢补齐历史 PDF 的后台回填。这样不会出现“785 篇全都缺 PDF，于是图片抓取被饿死”的情况。

### 4. PDF 捕获只认出版社明确提供、当前浏览器本来就能访问的 PDF

脚本只从文章页明确存在的 PDF 链接、citation_pdf_url、出版社元数据等来源发现 PDF，不猜 URL，不绕过登录、验证码、付费墙、DRM 或 403。

抓到后至少验证：响应确实是 PDF、文件头为 `%PDF-`、来源属于当前出版社、当前文章与 DOI 绑定、SHA256、文件大小和抓取时间。上传使用独立的 PDF capability token，最好是你的网页登录后临时签发给 Tampermonkey 的短期 capture lease，而不是把主登录 token 或新的永久密钥塞进脚本。

大文件可以以后升级为 R2 multipart 断点续传；第一版可以先限定一个合理大小并记录 `pdf_too_large`，但 PDF 失败只能影响 PDF 层，不能把该篇已经成功的 TOC／正文图任务改成失败。

### 5. PDF 解析不要直接在主脚本里做

原始 PDF 上传后进入独立的私有 Processor。这个 Processor 只做确定性处理：解析页码和文本块、识别 Figure／Scheme／Chart caption 与坐标、提取嵌入图片，必要时高分辨率渲染图区域，并生成一个 `pdf-manifest`。

我不建议用公开 GitHub Actions 来处理这类机构订阅 PDF，因为仓库和日志链路是公开基础设施。更合理的是私有 Cloudflare 处理服务／隔离容器，或者你的本地持久 Bridge。PDF 解析器应无外网、有限 CPU／内存／执行时间，不执行 PDF 内嵌 JavaScript。

最终保存的不是只有“全文字符串”，而是：

`PDF -> pages -> text blocks + captions + bbox + extracted/rendered figures + source hash`

这样后面摘要模型要找“Figure 3 对应什么结论”时，可以直接定位页码和图，而不是每次重新理解整份 PDF。

### 6. PDF 不直接覆盖现在的 TOC、正文图和摘要，而是成为第二证据源

这部分我认为最关键。

TOC 的优先级应保持：**出版社 HTML 官方 TOC > PDF 中明确标注的 Graphical Abstract／TOC graphic > Figure 1 fallback。** PDF 第一张图、模型觉得“很像 TOC”的图，都不能自动升级为官方 TOC。

正文图应保持：**出版社 HTML 原始图 > PDF 中具有精确 Figure／Scheme／Chart 标签的图 > 缺图。** PDF 图进入现有公共网页前，仍然经过 DOI、图号、SHA256、尺寸、解码、安全和整包发布规则；不能因为“来自 PDF”就绕过现有媒体闸门。

摘要也不要简单规定“有 PDF 就一定用 PDF”。应该做 Source Resolver：优先选择当前 Version of Record 且内容最完整的来源；如果 HTML 已经是完整正式版而 PDF 只是 accepted manuscript，就不能让旧 PDF 覆盖新 HTML。PDF/HTML 每次都保留自己的 sourceHash，摘要记录最终采用了哪个证据版本；PDF 更新后旧摘要自动进入 stale，而不是悄悄沿用。

PDF 提取出的图文默认先保持私有。如果以后要把 PDF-derived 图公开到 Gallery，只在现有公开媒体规则明确允许时才把已验证的派生图复制到公开 MEDIA；授权不清楚的内容只供你的账号和摘要处理使用。

### 7. “原文”按钮可以做到普通用户完全无感

普通用户的卡片不需要增加任何请求或视觉变化，仍然直接跳出版社页面。

只有服务器告诉前端当前账号具备 `private_pdf_read` 时，才拦截你的“原文”点击：

| 状态 | 你的账号 | 普通账号 |
|---|---|---|
| 私有 PDF 已就绪 | 打开站内私有 PDF | 出版社 |
| PDF 正在处理 | 出版社，可显示仅你可见状态 | 出版社 |
| PDF 没抓到／访问失败 | 出版社 | 出版社 |
| PDF 有新版本待处理 | 默认仍打开当前有效版本，可手动看版本 | 出版社 |

所以即使 PDF 整套系统关掉，现有网站仍然退化回今天的行为，不会影响整体使用。

### 8. 我建议按四阶段落地

1. **权限与私有阅读层**：D1 entitlement、`PDF_PRIVATE`、短期访问 token、Range 流式 PDF、owner-only 原文重定向。此阶段完全不动 Tampermonkey 抓取。
2. **PDF 捕获层**：在当前脚本中加入隔离的 PdfCapture；只抓当前浏览器已经合法可访问的 PDF，独立状态和回执，失败不阻塞现有队列。
3. **PDF 证据处理层**：私有 Processor 生成文本、caption、页码坐标和图像 manifest；摘要 resolver 接入 PDF evidence。
4. **媒体救援层**：只对 HTML 持续失败的 DOI 启用 PDF-derived TOC／正文图候选，并通过原有严格发布闸门上线。

我会额外加两个保险：服务器端 `pdfCaptureEnabled/pdfProcessingEnabled` kill switch，以及 PDF 功能独立健康检查。如果出现异常，可以在不更新 Tampermonkey、不改网页、不停止现有 TOC/正文图抓取的情况下，瞬间关闭 PDF 子系统。

最终我会选择的架构可以概括成：

`账号 entitlement -> 同一个 Tampermonkey 的独立 PDF 模块 -> PDF_PRIVATE -> 私有 PDF Processor -> PDF evidence/figure candidates -> 现有摘要与媒体闸门`

而现有主链 `TOC/正文图/HTML 文本 -> MEDIA/evidence -> Gallery` 保持独立。

**这是我认为风险最低、长期也最容易扩展的方案。** 最重要的设计原则不是“能不能抓 PDF”，而是做到：PDF 功能坏了，Gallery 仍然像现在一样正常运行；PDF 抓到了，也不能绕过已有的 DOI、质量和发布规则；普通用户永远接触不到你的私有原文。