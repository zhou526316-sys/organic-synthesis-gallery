# Response synchronization

北京时间：2026-10-05 14:57 +08:00
上下文：接续 Organic Synthesis Gallery 的 Tampermonkey/VPN Bridge 支线；先回忆、再审核、再校正基线并确立后续执行规则。此次只做只读核对与规则固化，不改抓取代码、文献数据或发布链路。

## Final response

我已经按“回忆 → 审核 → 再回忆/纠偏 → 确立规则”重新接管这条支线。

### 1. 回忆：我们真正要接续的是什么

这条聊天当前负责的是 **Tampermonkey / VPN Bridge 媒体抓取支线**，不是文献发现、范围审核或 08:00 正式发布。核心任务是：浏览器在学校 VPN/出版社登录态下，为已经进入 Gallery 的 DOI 抓取官方 TOC、正文图片、正文文本/证据，以及仅对 owner 开放的原始 PDF，并把结果上传回 Gallery。

此前已经形成几个关键约束：点击“立即开始任务”必须立即从排序后的队首重新跑；只显示真正缺项，不再把 700+ 全量文献都列出来；失败项跳过继续，不能让整个队列停住；从头跑时最新新增优先，同日再按 Nature/Science 系列、JACS、Angew、Chem、其他的优先级；正文图和正文文本的“不完整”不再单独制造任务。

PDF 是独立私有侧链，只处理 Gallery 中 addedDate >= 2026-10-01 的文章，需要同一浏览器取得 7 天 capture lease；PDF 成败不能阻断 TOC、正文图和文本任务。

### 2. 审核：前面那段对话里确实存在版本混乱

我刚重新核对了仓库 main。当前源码/构建契约已经明确指向：

- Bridge Loader：2.2.50
- TOC install revision：6.2.31
- controller revision：2.2.40
- publisherMediaRevision：20261005-rsc-elsevier-ccs-v11
- private PDF capture revision：20261005-private-pdf-session-v4

因此前面出现的 **2.2.47 / 6.2.28** 是完成 CCS v11 核心修复时的历史功能版本，不再是当前安装目标；2.2.50/6.2.31 是后续整合后的目标版本。

截图里“上来就受阻”的判断方向基本正确：当时浏览器实际仍在跑旧 controller 2.2.39，而服务端/新脚本已经要求 2.2.40，所以旧控制页会直接进入升级等待状态。这里最需要纠正的是：**以后不能因为 PR 已合并或 Actions 已触发，就直接宣称‘线上已经是某版本’。** 必须分开确认仓库目标版本、Pages 实际资产版本、用户浏览器当前加载版本三层；三层没有对齐，就不能让你继续反复点击旧脚本。

仓库现在还明确写死了“缺项队列只看 TOC / PDF”：`MISSING_CAPTURE_REVISION = 20261005-toc-pdf-only-v5`，界面文案也明确“正文图/正文不计入队列”。这一点与您最近的要求一致，后续不能再退回“正文图没抓全就重新入队”的旧逻辑。

CCS 当前规则也已明确：官方 key image 一旦找到必须持久保留，不能被下一轮空 DOM 覆盖；正文图片按 CCS 官方 DOM 顺序，`fN = Figure N`、`sfN = Scheme N`，caption 与资源类型冲突直接拒绝；CCS 不允许 Figure 1 冒充官方 TOC。Chem/RSC 的“请稍候/访问验证页”属于出版社访问态问题，不能误判成 DOI 路由失败。

PDF 当前代码也比前面更完整：先尝试同源 browser-session 下载，再用 GM 请求兜底；校验真实 %PDF 文件头、EOF、大小和出版社 host；上传必须带有效 lease。它仍然是 side channel，不得改变主任务成功/失败。

### 3. 再回忆后的正确基线

从现在开始，我把 **main 中的 2.2.50 / 6.2.31 / controller 2.2.40 / CCS v11 / PDF session v4** 作为当前代码基线；把你截图里的 2.2.39 视为“旧客户端实例”，不再把它当成当前版本。

但我不会仅凭仓库版本就说“你的浏览器已经升级成功”。以后验收必须看到客户端自己的版本/日志回执。也就是说，“main 已准备好”和“你电脑已经真正跑到新版”是两件事。

### 4. 后续这条支线固定遵守的规则

1. **范围隔离**：只处理 Tampermonkey/Bridge 的 TOC、正文图、文本证据、私有 PDF、队列调度、失败诊断和上传；不擅自改文献发现、范围审核、生产卡片或公众号规则。
2. **队列只由 TOC/PDF 缺项触发**：正文图没抓全、正文文本不完整，都不单独入队；但当某 DOI 因 TOC/PDF 被打开时，可以顺带继续抓正文图和文本。
3. **从头开始 = 立即重建缺项队列并从队首执行**：不先“复查”、不等冷却页面、不分 40 篇批次；一直跑到底。
4. **排序**：先最新新增；同日优先 Nature/Science 系列，再 JACS、Angew、Chem、其他。Science 放在 Nature 前也可以，不把这两者的先后做成阻断规则。
5. **失败不停车**：单篇失败、403、验证页、上传瞬时错误都记录原因并跳到下一篇；可重试项进入合理冷却，不能清空整轮队列。
6. **界面只显示缺项**：不再显示全部 700+；实时明确当前 DOI 缺的是 TOC 还是 PDF，以及剩余缺项数量。正文图/正文完整度只作为状态，不作为队列数量。
7. **TOC 必须优先官方来源**：不能为了“有图”而错配；CCS 尤其禁止 Figure 1 充当官方 TOC。旧 fallback 只有在新官方 TOC 成功绑定后才安全替换。
8. **正文图顺序尊重出版社语义和 DOM**：不再用字母排序制造 Figure/Scheme 错位；CCS 的 fN/sfN 规则保持强校验。
9. **PDF 永远独立**：仅 addedDate >= 2026-10-01；owner-only；7 天 lease；PDF 抓不到不能影响 TOC/正文图/文本；原始 PDF 默认私有，不公开到 Gallery。
10. **版本验收三层分开**：仓库 main、线上安装资产、当前浏览器实例必须分别核对。以后没有看到实际客户端版本和关键 revision，就不宣称“已经部署成功”。
11. **更新时只给可点击的直接更新链接**：不再让你复制代码。只有链接页面头部确实显示目标版本时才让你覆盖安装；若仍显示旧版，就先处理 Pages/cache，不让你反复试错。
12. **不随意弹前台新窗口**：保持自动抓取链路尽可能在现有任务页/后台导航中完成；失败处理不能演变成不断弹窗。
13. **每次改动先看最新真实日志**：尤其核对 `mediaNeed`、lease、publisher route、browser response、upload receipt；不能只凭代码推断“应该成功”。
14. **完成标准按回执，不按‘页面打开过’**：TOC 看 DOI-bound 官方资源上传成功；PDF 看 `private_pdf_lease active → discovery → browser_response/response → private_pdf_upload complete → stored=1`。
15. **不再混淆版本字段**：`VERSION=6.2.20` 是兼容 capture protocol 标记，不代表安装版本倒退；真正安装版本看 userscript `@version/INSTALL_REVISION`，controller 单独看 `CONTROLLER_REVISION`。

后面我就按这套规则接续。当前第一优先事项不是继续盲目改代码，而是把 **2.2.50 是否真的到达你的浏览器、controller 是否已经变成 2.2.40、PDF lease 是否被同一实例接收** 三件事一次性验清；只有这三项对齐后，才判断 PDF 侧链是否真正打通。
