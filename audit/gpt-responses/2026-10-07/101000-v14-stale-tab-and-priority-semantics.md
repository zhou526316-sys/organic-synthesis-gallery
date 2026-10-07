# Response synchronization

北京时间：2026-10-07 10:10 +08:00
上下文：用户安装 v14 并点击立即运行后，核验实际活动控制器与优先级语义。

## Findings

1. 用户点击后产生的新回执 10.1021/acs.joc.6c01927：
   - updatedAt = 1791338888613（北京时间约 10:08:08）
   - installRevision = 6.2.38
   - publisherMediaRevision = 20261007-rsc-issue-pdf-v13
   - controllerRevision = 2.2.41
   因此当前已打开的 Gallery/controller 页面仍在执行旧注入脚本；Tampermonkey 安装新版本不会替换已加载页面中的脚本实例，必须重新加载页面。

2. canonical live 已独立确认：
   - Bridge 2.2.58
   - install 6.2.39
   - RSC media revision 20261007-rsc-search-fallback-v14

3. 优先级语义纠正：
   - Tampermonkey 菜单“立即运行媒体抓取队列”映射到 forceStartFromHead。
   - manual missing-only 队列通过最新文献队列 + media/evidence/stage inventory 生成，并按 compareMissingCaptureJobs（addedDate、journalPriority、date、doi）排序。
   - automatic controllerRun 同样从 QUEUE_URL + pairedJobs/privatePdfBackfillJobs 构造本机队列。
   - 当前客户端并不读取 /api/media/bridge-queue 的 reportedPriority 来排序。
   - 因此此前将两篇 RSC 标为 reportedPriority=true 只保证 Worker repair/diagnostic queue 中为优先项，不会强制本机 forceStartFromHead 第一时间运行它们。

## Immediate action

关闭当前自动打开的出版社标签页；对 Gallery 主页面执行强制刷新，使 6.2.39/v14 重新注入；随后再启动媒体抓取。下一条新回执必须先验证 installRevision=6.2.39 / publisherMediaRevision=v14 后才继续判断 RSC 结果。
