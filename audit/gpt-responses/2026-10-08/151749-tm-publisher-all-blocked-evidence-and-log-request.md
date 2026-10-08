# Tampermonkey publisher access blocked after 2.2.70.99 preview

Beijing: 2026-10-08 15:17:49 +08:00
Context: user reports all publisher visits blocked in the preview install.
Mode: read-only diagnosis, **no code edits**, no deploy, no bypass, no publisher login actions, no data deletion.

## Verified primary live evidence
- Live read-only `GET https://api.gczhouwld.com/api/media/tampermonkey-reports` latest update 2026-10-08T07:12:57.698Z.
- ACS 10.1021/acs.joc.6c01708 at 2026-10-08T07:11:12.095Z: report reason `publisher_access_gate`, route `acs_full`, 9 consecutive page state traces `access_gate` `doiMatch=true;textLength=114;accessGate=true`; discoveryMs=0, after about 13 seconds writer marked publisher-level cooldown until Unix milliseconds 1791445227390 (~15:40:27 Beijing). No TOC or body assets were collected.
- RSC 10.1039/d6gc04458a 2026-10-08T07:12:57.698Z: `partial`, `toc=not_found`, 0 figures, fulltext stored at partial level ~2321 chars; actual DOM text 2999 chars, 7 images, 0 figure/figcaption, 11 iframes, fallback iframe scans blank, TOC filter 5 noContext + 2 noKind. No valid TOC candidate found. Do not treat this as complete success.
- Older RSC 10.1039/d6sc06374h (~14:11 Beijing) had `publisher_access_gate`; older ACS 10.1021/jacs.6c07839 had `bound_publisher_heartbeat_missing`.
- Current latest `GET /api/media/local-diagnostics` is from 2026-10-08T00:38:03.084Z (08:38 Beijing), covering an earlier session. It cannot substantiate the user's newest full queue or preview installed version.
- From PR 412 draft source the one-visit route for ACS TOC+figures is `/doi/full/`, and `pageState` correctly emits an explicit access-gate class for an insufficient access page; the real initial gate cause is not identifiable from sanitized trace. Need authorized user-browser evidence before changing route behavior or assuming VPN broken.
- A separate read-only external public-web probe of ACS and RSC landing/full URLs was bot-blocked but is not decisive for the user's school VPN access.
- PR #412 still draft/unmerged, preview isolated. Do not clear rate-limit state or modify access policy.

## User-visible partial reply
我查到了最新的服务器抓取回执，确认 **2.2.70.99 测试版仍然存在实际抓取故障**，不能认定修复成功。

目前至少有两类不同的问题：

- **ACS：** 北京时间 15:11，一篇 JOC 文献返回 `publisher_access_gate`，即出版社访问验证阶段就被阻断。
- **RSC：** 15:12，一篇 Green Chemistry 文献已经取得正文文本，但 TOC 仍然是 `not_found`。这说明页面并非完全无法进入，而是图片识别或图源获取也存在问题。

因此不能简单清除冷却记录、强制反复访问出版社。那样既不能解决 TOC 抓不到的问题，还可能加重访问限制。

## User-visible terminal reply
进一步核对了两篇论文的实际运行轨迹：

- **ACS（10.1021/acs.joc.6c01708）**：脚本打开的是 `/doi/full/`，页面正文仅约 114 个字符，连续约 13 秒显示访问验证状态，之后设置了出版社级冷却，截止约北京时间 **15:40**。这不是图片选择器能直接解决的问题。
- **RSC（10.1039/d6gc04458a）**：页面实际加载约 2999 个字符，但检测到的 7 个图片节点没有形成可用 TOC 候选；页面内没有可识别的 `figure`、`figcaption`，备用 iframe 扫描也没有找到图片。它需要单独排查页面结构与抓取路径。

**我没有修改或发布新脚本。** 当前测试版修复的是任务调度和统计，并没有解决这两类出版社源头故障。

目前服务器上的最近一次完整本地诊断还是今天 **08:38** 上传的，无法据此确认你现在这一轮究竟有多少篇处于冷却、验证或抓图失败。

**请你现在只做一件事：** 在正在运行的浏览器里打开 Tampermonkey 菜单，点击 **「上传本地 TOC 日志」** 一次。完成后回复“已上传”。我能直接读取服务器上的最新记录，逐篇核对当前受阻原因，再决定是否需要调整 ACS 访问路径或 RSC 图源识别；不需要你重复下载安装包，也不要清除冷却记录或反复启动任务。
