# Response synchronization

北京时间：2026-10-04 21:19 +08:00
上下文：仅核对并继续 Tampermonkey 对 Chem / Chemical Science / Green Chemistry / CCS Chemistry 的媒体抓取能力；不处理文献发现、审核或补扫。

## Final response

已接续并核对完成。当前这几本刊的 Tampermonkey 能力已经统一到主线 `publisherMediaRevision=20261004-rsc-elsevier-ccs-v9`，正式在线安装包为 `2.2.43`。

本轮只处理抓取能力，未修改 discovery/audit 文献发现链。

1. Chem / Elsevier
- 保留 10.1016 -> Elsevier。
- 调度前先解析 DOI 跳转；如果经过 linkinghub PII，会转成 DOI 绑定的 ScienceDirect `/science/article/pii/...` 任务页，再附加 osg-job 绑定。
- 手动“从头抓”和自动抓走同一条 resolved/bound URL，不再各走一套。
- 增加 Elsevier Graphical Abstract 识别，仍与 Figure 1 严格分开。
- 最新真实回执仍是旧 v7：`bound_publisher_heartbeat_missing / capture_tab_job_mismatch`，因此还不能宣称你的电脑已经用 v9 实测恢复。必须更新到 2.2.43 后再跑一次再验收。

2. Chemical Science / Green Chemistry / RSC
- 10.1039 DOI 现在解析为确定的 RSC articlelanding/articlehtml 路径。
- 正文图增加 RSC 图块/图题识别。
- TOC 增加 RSC Graphical Abstract 识别。
- TOC 缺失时 article landing / article HTML 可做同源 iframe fallback。
- 两刊目前没有生产卡片，所以没有真实用户浏览器任务可跑；这里只确认 Tampermonkey 能力已经具备，不触碰发现链。

3. CCS Chemistry
- 已同步上线。
- 根因是文章页常有 Figure 1，但官方 TOC/GA 是期刊 TOC/Ahead-of-Print 列表里的每篇 `key image`。
- 新版会访问 CCS 同源的 Ahead-of-Print / Just Accepted / 精确卷期页，先把卡片绑定到唯一 DOI，再只接受该 DOI 卡片内显式 key image / TOC graphic / graphical abstract 为官方 TOC。
- Figure 1 仍然只能是 fallback，不能冒充官方 TOC。
- CCS 正文图现有高分辨率 JPG 路径仍保留。

4. PDF 范围
- 自动 PDF 抓取硬限制为 Gallery 的 `addedDate >= 2026-10-01`。
- 2026-09-30 及更早、或者没有可信 addedDate 的文章不抓 PDF。
- 不使用 publication date 兜底。
- 旧文章的 TOC/正文图/HTML 文本仍按原规则工作，不受 PDF 截止影响。

验证：
- 主线修复提交 `733e642151d6cddc517381e2371ccbdc2c293de8`。
- Target journal Tampermonkey capability regression run `37205538947` 全部成功。
- 测试产物 artifact `11304557832`，测试包 SHA256 `5555443e6b83958e57d0b5dc500f18ebb444848f2835cec534c441c1b4b6a65f`。
- canonical 在线脚本现已确认：Bridge `2.2.43`，含 v9、Elsevier bound-task v3、RSC、CCS key-image 和 Oct-1 PDF cutoff 标记。

在线更新入口：
https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js?journalfix=20261004-v9

更新后再运行一次“立即开始任务（只补缺项）”。下一次真实 Chem/CCS 回执必须出现 `publisherMediaRevision=20261004-rsc-elsevier-ccs-v9`，届时再判断真实出版社页面是否已经完全恢复。