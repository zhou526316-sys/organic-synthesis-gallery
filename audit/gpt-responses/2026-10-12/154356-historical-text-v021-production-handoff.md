# Gallery 历史正文一键补抓 0.2.1 正式验收与全历史 DOI 来源修正

- 北京时间：2026-10-12 15:43:56（Asia/Shanghai）
- 工作线：全历史检索与独立 Tampermonkey 正文采集
- 用户本轮指示：**继续**此前 0.2.0 一键补抓工作，必须不干涉 TOC / 正文图 / 私人 PDF
- 仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一生产基线
- PR #554：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/554，**成功合并**
- 合并 SHA：92246f9960aa3a9923a09658a531e64840239e3d
- Pages 正式部署：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38217995577，**全部成功**
- 正式安装：https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js，经 TinyFish live fetch `ttl=0` 实际读回 `@version 0.2.1`，且包含 `api.gczhouwld.com/api/literature/catalog-view` 与“一键补抓全部缺项”
- 正式 release-delivery.json 实际读回 `sourceCommit=92246f9960aa3a9923a09658a531e64840239e3d`、正式卡片 964、publicationSlot `2026-10-12T08:00:00+08:00`、`architectureCatalogId=8036ab484da514a046acf52fe021476d793e5859249b8343b22ec9179c8e6962`，与本部署一致。

## Read-only 核验发现与已修复事项

1. `cloudflare/scripts/build-live-toc-demand-queue.mjs` 明确排除历史 `metadata_only` 条目，故上一版 0.2.0 依赖 `toc-demand-live.json` 作为正式历史 DOI 权威目录不成立；不能证明未来创刊以来历史文章全覆盖。
2. 实测公开 `GET /api/literature/catalog-view` 完整就绪、支持 `catalogId` / `sort` / `dateTo` / `limit` / `cursor`；2026-10-01 前日期范围返回 matched 744（含约9条日期未知，按来源规范仍待验证）。发布形式 DOI 总数为964；已有735条 2026-10-01 前精确日期旧 DOI 基线（真实历史回溯将继续增长）。
3. 本次新脚本 0.2.1 从 Pages `release-delivery.json` 读取正式 DOI 与 `architectureCatalogId`，再逐页读取 D1 公共目录，逐个核 DOI 成员、原发布时间、revision、游标、去重和分页总数。全库元数据-only 历史文章未来纳入正式目录后自动成为候选，但缺原始日期不能假造并标为完成。遇到正式索引未 ready 或版本不一致时 fail-closed，绝不回退到媒体队列。
4. Nature Catalysis 正文实测 `10.1038/s41929-026-01616-6` 在文章 Rights and permissions 下以 `http://creativecommons.org/licenses/by/4.0/` 普通文字表达 CC BY 4.0。原 0.2.0 仅匹配 HTTPS 授权链接，容易误判“无许可”。新版本按 DOI 页面限定的法定授权章节读取许可，识别该传统 URL 并标准化为 HTTPS；没有把校园登陆/任意文章脚注自动认作合法复制授权。
5. `10.1038/s41467-026-77771-y` 的只读网页提取显示 Abstract + rights notice 但没有完整科学正文的页面壳风险；原 0.2.0 可能将法律信息统计为正文并报成功。0.2.1 排除 Rights, About this article, Additional information, Publisher note, Author information 等；必须有 >=250 实质 Results/Mechanism/Experimental 段落字数才计为有效正文，避免误报。
6. 保留新脚本本地 IndexedDB、GMT `gallery-historical-text-batch-v2:` 独立状态，单后台标签依次抓取、暂停/续扫/本机检索；不运行 TOC 媒体 API、私人 PDF 上传、SI 或正文图抓取。不能承诺与共享出版社网络流量绝对无竞争，应低并发并遇限流主动暂停。

## 代码范围、测试结果、部署

PR #554 变更文件严格限于：
- `public/gallery-historical-text-pilot.user.js`
- `scripts/test-historical-text-batch.mjs`
- `scripts/test-historical-text-batch-browser.mjs`
- `docs/historical-text-search-pilot.md`
- `.github/workflows/github-pages.yml`

未改写原始 TOC、正文图、PDF、文献每日08:00发布机制或公共全文 D1 搜索核心。

专属 CI：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38217411757；15/15单元测试成功；正式目录版本不匹配／越权 DOI 拒绝，Nature CC版权文本处理，正文科学证据过滤；独立 Chromium 完整模拟一键两 DOI、任务页关闭、重复跳过、本机 LMCT 召回、PDF reader 不叠加，以及正式目录分页 API调用，无媒体 HTTP 请求。通用 Required quality gate, Playwright interactions, build/typecheck, Worker dry-run, production API smoke等均 success，合并后 Pages #38217995577 文献授权、完整媒体构建、PDF隔离检查和 deploy全部success。正式脚本 live 0.2.1 读回，Release source SHA 同合并 SHA。

## 不能虚报的部分

- 成功部署不代表 735 篇历史文献都已经抓到正文，也不代表公网站点全文 FTS5 已接入。
- 真正原始出版社网页的登录后用户浏览器/Tampermonkey 实际逐期刊覆盖、访问限制与逐篇许可仍需在用户真实浏览器运行后确认；CI 浏览器是仿真。
- CC BY/CC0 以外不能因登录/院校 VPN 而自动传播全文；未核验许可不可公开全文，服务器不会保存旧 PDF、图或 SI。
- 浏览器关闭，脚本不会在云端继续执行；IndexedDB 目前存于用户当前设备和同源浏览器，不自动跨设备同步，也不等同公开全站检索。

## 本次聊天已发可见阶段性内容

1. 0.2.0 Pages 成功与正式 installer 0.2.0 实际回读。
2. 指出 0.2.0 错误使用 TOC 媒体队列为全历史 DOI 来源；正式 catalog-view 查询可用并覆盖964 DOI。
3. 指出 Nature Rights and permissions 可能被误判为科学正文，提出严格正文证据验收。
4. PR #554 15/15 专项CI通过，后续Required quality gate成功，PR合并commit=92246...
5. Pages #38217995577 正式授权/编译/完整媒体/旧PDF体验成功，deploy完成。
6. TinyFish 读回 v0.2.1 和正式 manifest 源commit一致。

## 建议终结用户回复核心

**已全部部署并通过真实线上核验。** 现有安装链接 https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js，版本 0.2.1。已有用户可在 Tampermonkey更新脚本，在 Gallery 首页找到「历史正文 · 独立补抓」→「一键补抓全部缺项」，浏览器保持开启。独立本机只抓有出版社文章本文明确 CC BY/CC0、DOI与结果/机理/实验正文通过验证的文章，自动跳过已有记录、失败可后续重试，拒绝仅摘要/权限未知。不会新增旧 PDF/图片/SI；不影响旧媒体队列，也不触发每日08:00新文章发布。**当前仍是当前浏览器本机正文索引，而不是全站公共全文检索；真实跨出版社成功率尚未经管理员真实浏览器采集证明**。
