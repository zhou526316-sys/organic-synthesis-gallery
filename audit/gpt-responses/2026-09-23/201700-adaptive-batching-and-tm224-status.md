# Adaptive batching + Bridge 2.2.24 status — user reply

Actual verified state before this reply:

- Adaptive paired-media PR #172 is live on main. It prefers 20–25 articles but can flush a 1–19 article validated tail after 15 quiet minutes.
- Production Pages deployment run 35858884833 succeeded with literature_authorization/build/deploy all successful.
- Its auto-body artifact 10749056318 (ZIP SHA256 01236b998bd94ba451bef5f1bb4b3dcfe2229122d52371fb69449fdf202c772a) showed 433 staged rows, 22 eligible new body rows from 7 article DOI, releaseMode=waiting, eligibleIdleMinutes=2.138, tailFlushIdleMinutes=15, added=0.
- The first real five-minute preflight run 35859400680 succeeded. Inspect output: count=22, articles=7, targetArticles=20, ready=false, mode=waiting, idleMinutes=5.75095, tailFlushIdleMinutes=15, no stage/local-capture read errors. Its publish job was correctly skipped.
- Therefore the current 7-article/22-image tail has NOT yet been claimed as published. If the paired eligible set reaches 20 first, a target batch may deploy. If no qualifying evidence changes for 15 minutes, the smaller tail may deploy. Every body article still requires a true official TOC in the same actual Pages build; Figure 1 fallback is not official TOC.
- PR #173 was closed unmerged because #172 already supplies this adaptive behavior.

Automatic reports:
- Read-only workflow 35859339940 succeeded.
- Artifact 10748438715 ZIP SHA256 06ee7baf2411ae40736ae93e09252cf050ac5d2d94369121a75ffc6d98b2fbc6.
- Read 2026-09-23T12:15:27.544705Z–12:15:31.773678Z; report index 165 DOI, 127 automatic-report DOI, errors=[].
- New reports were still arriving through updatedAt 1790165635620.
- Latest examples include ACS Catalysis 6c05787 partial 4/7, ACS Catalysis 6c05029 partial 3/5, Org. Lett. 6c03300 success TOC+3/3, ACS Catalysis 6c04996 success 3/3, JACS 6c14557 success 6/6.
- Thus the local outbox/server receipt path is active and failure logs are continuing to upload.

Critical version finding:
- The newest real client report contexts still say controllerRevision=2.2.23, captureVersion=6.2.20.
- Example ACS Catalysis 6c05787 at ~12:13Z still exhibits 2.2.23 octet-stream/TIFF behavior (view-large .tif HTTP200 application/octet-stream rejected, then alternate candidate failures).
- This is exactly the acquisition gap Bridge 2.2.24 was designed to address.
- Bridge 2.2.24 itself was already deployed and independently production-verified; however the user's current browser session has not yet produced a 2.2.24 report, so real-world 2.2.24 efficacy is not yet measured.
- Do not issue 2.2.25 solely from these 2.2.23 failures. First update the user's Tampermonkey installation and inspect new controllerRevision=2.2.24 reports.

User-facing response:

现在已经按你的新规则落地：20篇不是硬门槛。正常优先20–25篇；如果最后只剩1–19篇，且15分钟没有新的合格TOC/正文图进入，就把剩余尾批直接发。正文图只有在同一Pages构建里已经存在官方TOC时才会进入卡片，Figure 1替代图不算官方TOC。

当前实际队列是7篇、22张合格正文图。12:15那轮5分钟检查显示静默5.75分钟，所以没有提前发布；publish job被正确跳过。后续如果先凑到20篇就立即发，如果一直没有新增，到15分钟静默后会发这7篇尾批。

失败日志也确实一直在上传：最新R2报告索引165篇，其中127篇有自动报告记录，最新报告仍在持续写入，没有读取错误。

但这里发现一个关键点：你现在浏览器实际还在跑2.2.23。最新12:13左右的报告都写着controllerRevision=2.2.23，所以现在看到的TIFF/application/octet-stream失败仍然是旧版本行为。2.2.24已经上线，但还没有收到你本机2.2.24产生的真实报告。

请直接原位更新，不要卸载旧脚本、不要清空Tampermonkey存储/密钥/断点：
https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.24

更新前先暂停当前抓取并等当前任务页关闭；安装后刷新唯一Gallery控制页再继续。安装版本看2.2.24；内部captureVersion仍显示6.2.20是正常的，它是服务端兼容协议，不是脚本版本。

2.2.24重点修复ACS高清端点返回TIFF/octet-stream时的同图currentSrc回退，同时保留跨DOI防串绑和现有清晰度门槛。等你的新报告开始出现controllerRevision=2.2.24后，再根据那些真实失败决定是否需要2.2.25，而不是继续对2.2.23日志打补丁。
