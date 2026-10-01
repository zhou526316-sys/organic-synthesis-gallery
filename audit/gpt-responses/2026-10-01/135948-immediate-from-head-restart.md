# Response synchronization

Beijing time: 2026-10-01T13:59:48+08:00
Context: Tampermonkey explicit immediate-start behavior change.
User request: 不要什么复查，只要我点击立即开始任务，就立马重新开始从头抓
Functional commit: a3efa1d64d6dd71c3f774f49ae752ba236aad7ee (PR263).
Production evidence: audit/media-acceptance/2026-10-01-immediate-restart-v3-live.json, commit67c76b4844e163aab8159dadbed4c919b632fa26. Exact canonical and Worker installer bytes verified2026-10-01T13:57:58.475+08:00, followed by direct confirmation that all Pages deployment jobs completed successfully. Earlier verification workflow's overall false result is preserved, not relabeled, because its earlier deployment-status snapshot was still in progress.

## Actual progress messages

我会把“立即开始任务”改成强制重新开始：点击后立即作废旧任务，从最新文献优先的队首重新抓，不再等待旧锁或安排复查。已经保存的图片和全文不会删除。

“立即开始”已改成独立的强制重启入口：不用先点暂停，也不等旧任务收尾；每次点击都会重新从队首抓 TOC、正文图和全文。正在测试连续点击和多个控制页的情况，确保旧任务迟到的结果不会覆盖新一轮。

## Final user-visible reply

**已改好并上线。“立即开始任务（从头重抓）”现在就是强制重启：点击后立即作废上一轮任务、重置本轮进度，按最新文献优先，从队首重新抓 TOC、正文图和全文。不等待旧锁、不等待旧任务收尾，也不走恢复复查。**fileciteturn155file0L2-L2

**[点击更新：Tampermonkey 2.2.39 · 立即从头抓](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js?fix=20261001-immediate-restart-v3)**

覆盖安装现有同名脚本后，刷新文献库网页一次，确认面板标题显示 **“立即从头抓”**。以后直接点面板里的 **“立即开始任务（从头重抓）”**，不用先暂停、清锁或点“继续”。再次点击，就再次从头开始。fileciteturn139file0L2-L2

这一模式下，上一轮抓过的文章也会重新进入本轮；**已保存的图片、全文和密钥不会删除**。点击就启动新一轮，但论文页面仍需要正常的网络加载时间，出版社登录和限流也仍然有效。线上安装包已经核对为本次更新，尚未验证你电脑上的实际运行结果。fileciteturn155file0L2-L2

备用文件：[立即从头抓脚本](sandbox:/mnt/data/gallery-vpn-bridge-immediate-restart-v3.user.js)。
