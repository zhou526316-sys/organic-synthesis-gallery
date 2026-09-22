# Response — uploaded window-burst log and Bridge 2.2.21 fix

Beijing response context: 2026-09-23 01:18:50 +08:00.
Production merge: 7adbb8dff5ffa8cacab85d45f50aeede1b8e1ffe (#141).
Pages success: 35759187650. Live acceptance success: 35759312312.
Acceptance audit commit: 623cca6b0f7d5aa68c008c61e9da59067231ec5f.
Prior commentary bodies are preserved in the diagnosis and acceptance audits.

## Final user-visible reply

**这是 2.2.20 的调度缺陷，不是正常的“20 路并发抓取”。已根据你上传的日志修复，2.2.21 已经正式上线，并核验了线上安装包。** fileciteturn540file0L2-L2

**[点击更新至 Gallery VPN Bridge 2.2.21](https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.21)**

### 为什么连续弹窗

你这批日志的 **20 条失败全部是 `controller_lease_lost`，TOC 和正文图保存数都是 0**。第一条仅 1 毫秒就失败，后面约每 3.5–4 秒继续派发下一篇，并没有正常等待文章抓取完成。fileciteturn522file0L2-L2

问题在于：旧版“继续”按钮可能在自动启动尚未完成时，删除正在使用的任务锁；控制器失锁后，又把它当成单篇失败，继续循环开下一页。我用旧版代码复现了同样的 **20 次开页、20 次失锁失败**。这是代码没有处理好启动冲突，不是要求你靠避开某个按钮来解决。fileciteturn522file0L2-L2

新版现在会**开页前检查任务锁，失锁立即停整批；重复点击“继续”不再抢锁；确认上一张任务页已经关闭，才允许打开下一篇**。同时停用了安装包里残留的旧抓取队列。调度测试中正常处理 20 篇时，存活任务页最多为 1 个；无法确认关闭时，不会继续开页。fileciteturn540file0L2-L2

### 现在这样恢复

1. **先中止旧批次**，关闭旧 Gallery 控制页和脚本自动打开的出版社任务页。
2. 点击上面的链接，直接更新原脚本，确认安装版本为 **2.2.21**。**不要卸载、不要清空密钥或脚本存储。**
3. 重新打开一个 Gallery 页面，在 Tampermonkey 菜单里将 **“设置每批抓取数量”暂时设为 2**，再点一次 **“继续媒体抓取主线”**。先观察前两篇是否逐篇打开、关闭，以及是否出现实际保存结果，再让它自动接续后面的批次。fileciteturn540file0L2-L2

日志里的抓取协议版本仍可能显示 **6.2.20**，这是为了兼容现有 Worker 和断点记录；判断本次修复应看安装版本 **2.2.21** 或摘要中的 `controllerRevision: 2.2.21`。原来恢复的 **83 篇 TOC 没有动**，正文图也仍按“先暂存、后发布”的规则处理。fileciteturn540file0L2-L2

**本轮已完成故障复现、回归测试和线上文件验收，但尚未验证你本机更新后的实际运行；先不要直接无人看管整夜跑。** 前两篇的真实运行结果才是接下来判断是否可以放着连续抓取的依据。fileciteturn540file0L2-L2
