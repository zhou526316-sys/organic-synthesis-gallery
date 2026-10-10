# Organic Synthesis Gallery 历史文献/TOC 队列实作验收

北京时间：2026-10-10 19:37
关联用户：继续；7—9月仍有“待核验标题”，只新增TOC不抓PDF/正文图；历史回溯23:00，不入“每日新增”；原有PDF媒体保留。
任务边界：前端、历史来源隔离、标题队列/检索预备；不修改正式文献范围审查、旧PDF存储或唯一08:00文学准入。

## 已完成
- PR #468 已合并，28/28 CI成功；历史来源、7—9月TOC-only、7月前metadata-only、每日新增和D1索引排除、前端标题验证显示、Tampermonkey抓取限制均合入正式网站，主站升级已在正式网页读回。https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/468
- PR #483/#486/#489/#494 已合并，分别补强英文题名/派生数据/中英切换及 938 篇中文覆盖；本轮真实浏览器抽样3 DOI标题全部有效且不显示新增。
- 站内7—9月静态队列原有733篇中的83条仍是英文空标题（网站视觉层已经补齐），在本轮修复了采集队列持续空标题的根源。PR #495 于2026-10-10合并为 `f090b9ae208f24e927c48e93785eb20f3543554d`，六项CI全部success，修改仅限既有83 DOI标题可信侧车的候选填补逻辑、TOC队列合并、测试与刷新触发，不篡改保护的文学源码和已有有效标题。https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/495
- 自动刷新 TOC 队列 GitHub Actions #38048854371 成功，main public/toc-demand-live.json Git blob `80cded35a419cdb641b9a1239eb33355afdf3108` 实际逐条检查：938 总 DOI；2026-07-01..09-30 共733篇，**英文title空缺从83归零（0）**，733篇全部仍标记 `mediaPolicy=toc_only`，latestAddedDate=2026-10-10，最新统计未变；仍有118篇7–9月缺官方TOC、11篇无可用首页主图；全库153缺官方TOC、25缺可用主视觉。只证明元数据队列标题修复，不代表图片采集完成。
- 用户既有主站官方链接 https://gallery.gczhouwld.com/ 读取 TOC userscript @version **6.2.63** 且确认 `tocOnlyCaptureEligible`；后台源 `main` 亦为6.2.63。用户浏览器是否实际安装此版需单独检查。
- 通过真实浏览器只读逐DOI：10.1021/acs.orglett.6c02216 标题正常，不显示NEW，TOC仍 Original graphic pending，ACS正式文章有Visual Abstract但源抓取bot_blocked，无画像字节，不宣称完成；10.1021/acs.orglett.6c02293 正确全英文标题和SVG主图；10.1038/s41467-026-77437-9 英文/中文标题正常，页面展示是 Figure1替代主图而非已经验证官方TOC，保留四张既有正文图。三张是原有7–9月卡片，原PDF按钮可继续显示；禁的是**新获取PDF/正文图**，不是删除旧文件。
- GitHub Pages 当前正式站仍提供旧版 toc-demand-live.json 标题（首个DOI仍为空），所以本轮在main安全追加已存在的原生 PAGES_REFRESH marker，commit `53b4dea674faafe40e5d51cac8d2f5d222daaa1a`，只触发媒体/静态队列刷新、不发新论文也不改08:00正式槽。新的标准Pages工作流 #38048981114 于本轮末仍 `pending`，**尚未通过线上队列刷新验收**；不能声称生产队列已显示0标题缺口，只有Git main事实如此。前序正式Pages #38046935614 success，发布源7058e099、938 DOI。
- 历史夜间实际云端collector由PR #492合并，23:00北京GitHub Actions（Crossref/OpenAlex分批+断点）仅写独立 staging/historical-archive-nightly，不在23:00发布或改主站; ChatGPT 23:40监督验收现有任务。此时 staging/state.json：completed=0, attempts=0, cursor 2026-09-22..09-30 第一刊；今晚首轮尚未实际运行完成，不能宣称已有历史新增。

## 后续验收边界
1. #38048981114 Pages必须成功并且真实 https://gallery.gczhouwld.com/toc-demand-live.json 可解析且7—9月title空缺=0；如果排队不能冒充上线。
2. #468 合并的 TOC-only 只控制**新增采集**，无法自行回填缺失的118个官方TOC；10.1021/acs.orglett.6c02216 官方 Visual Abstract需已认证的Tampermonkey浏览器获取，不准猜图片URL、使用别篇图片或绕过访问控制。
3. 历史候选需要逐篇双遍合成学科范围审核和单独的正式08:00准入门禁，未履行前只算 staging 未收录。
4. 摘要版权和引用书目仍须分别核实，不因站内检索题名修复就说所有历史文献检索齐全。
5. 不修改/重启已有正式08:00、07:05、07:35和别的工作线；历史主抓取23:00、报告23:40不重复采集。
