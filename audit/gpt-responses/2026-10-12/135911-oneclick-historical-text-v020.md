# Organic Synthesis Gallery — 历史正文一键批量补抓 0.2.0 实施回报

- 北京时间：2026-10-12 13:59:11 Asia/Shanghai
- 所属工作线：摘要统一采集、历史正文检索、Tampermonkey 自动补抓独立模式
- 用户要求：取消逐篇手动抓取；Gallery 增加独立一键按钮抓取正式入库、实际原发表日期在 2026-10-01 之前且缺少本机文本索引的历史论文；不得干涉现有 TOC、正文图、私人 PDF。
- 唯一生产基线：`main`；仓库 `zhou526316-sys/organic-synthesis-gallery`
- PR #551：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/551 （已合并）
- Merge commit：`9c57c5dc18117cf6817bcc9edd07f2b43c1e4a7c`
- GitHub PR 合并前全量 CI：Required quality gate、Playwright interaction regression、Frontend build and typecheck、Worker dry-run、Production API smoke、历史/媒体专项验证全部 success。
- 历史专项单元测试：12/12 success；Chromium fixture 真正点击 1 次批量按钮，模拟处理 2 个历史 DOI，保存 2 份本机 IndexedDB 结构化文本，后台页打开与自动关闭、成功重复跳过、LMCT 本机检索、PDF reader 页面无叠加面板均 pass；对应 Actions #38209223591。该夹具不代表真实出版社抓取成功率。
- 正式历史 DOI 覆盖基线：公开 `toc-demand-live.json` 当轮共 964 篇，735 篇有完整原发表日期且早于 10/1，另外 9 篇日期不明不能凭空推断。
- 新版本：`public/gallery-historical-text-pilot.user.js` @version 0.2.0；保持先前 userscript @name/@namespace 标识，添加官方 updateURL/downloadURL；在 Gallery 根页面显示独立浮动面板「历史正文 · 独立补抓」，主按钮「一键补抓全部缺项」，有暂停、续跑、状态统计、局部全文检索。
- 自动工作原理：只读正式 DOI 目录；独立 GM `gallery-historical-text-batch-v2:` 存储命名空间；一条后台 `GM_openInTab` publisher 页面依次处理，使用 DOI、出版日期、授权源、SHA256 验证；只在本文存在明确 CC BY 3.0/4.0 或 CC0 1.0 许可时抓取；只有 Abstract/正文不足、403、登录挑战、无法识别 DOI、许可不明不记成功。保存到当前 Gallery 浏览器同源 IndexedDB，尚不进入线上 D1 FTS。合规失败/访问限制不得绕过，只能记录。默认成功不重抓，失败有界按约24小时后重试。
- 媒体隔离：没有修改或调用原 TOC 6.2.x/VPN Bridge 队列、旧 `osg-toc-v6:` GM key、媒体上传、PDF 下载、SI或正文图抓取、现有 Evidence v2 import；绝不新增历史 PDF 云端归档；仅单后台页，文章结束后最低 2 秒间隔，对共享出版社网络资源仍可能有有限消耗，逻辑隔离不代表网络零竞争。
- 既有 08:00 唯一正式文献新增发布、所有历史 scope 双遍审核、7–9 月 TOC-only 与 pre-July metadata-only 媒体合同均保持，唯历史正文独立文本试验受本指令许可的例外。
- 正式上线状态：截至 2026-10-12 13:59:11，Pages run #38209936841 `literature_authorization=success`，`build=in_progress` 且卡在既有「Validate and atomically merge completed TOC plus body packets」步骤，尚无法断言正式域名 @version 0.2.0 已可安装。**不取消、不重启、不绕过**该媒体构建步骤。待真实 GitHub Pages 成功并对目标 URL 内容回读才能宣称部署成功。
- Pages 实际运行：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38209936841
- 使用者电脑需保持浏览器运行才能继续 Tampermonkey 批量访问，浏览器关闭不会云端继续处理；OpenAlex/合法开放全文云端审计仍是独立工作，前一轮 50 DOI 元数据审计 20篇TEI入口并非全文已入库。

## 最终用户可见答复（计划与部分可见答复拼接意义保持一致）

已将「逐篇手动导出」改为可在 Gallery 页面点击一次后自动批量访问正式历史 DOI 的独立按钮。PR #551 已通过全部代码和浏览器回归门禁、合并为 `9c57c5dc18117cf6817bcc9edd07f2b43c1e4a7c`；12/12 单元测试和独立 Chromium UI/本机数据验收通过，额外检查了 PDF 阅读器不会叠加历史控制面板。原有 TOC、正文图、PDF 的自动队列与权限不变。

本轮技术验收在 964 正式 DOI 中确认 735 篇有完整历史发表日期、可成为独立候选；9 篇发表日期不明留待来源核实。浏览器队列默认只在论文页存在可靠 CC BY/CC0 许可且正文足够完整时保存为本机结构化文本，登录阻断/权利不明不会误报成功，也不会上传出版社原文至公共数据库。可以暂停和恢复，已成功的 DOI 不重复抓取。它不是电脑关闭时持续运行的云端任务。

正式站点部署仍在执行 Pages #38209936841 的现有 TOC 与正文图构建，尚未取得上线成功和 URL 0.2.0 回读，因此暂时不能提供已验证的 0.2.0 正式安装链接。脚本源码已在 main，可经 GitHub 查看；不能把 Git 合并等同于生产发布。保留现有媒体构建，不取消或重启它。
