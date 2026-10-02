# Response synchronization

Beijing time: 2026-10-03T01:43:38+08:00
Context: Tampermonkey full missing-queue acquisition after40attempts with0success and misleading0remaining.
User request: screenshot followed by 为什么只是40篇？我要从头到尾、.
Related source: f2a6f3875df5b04f5935f3d8b20d542d238f63b9 (PR265).
Verified online Worker installer: run37041362553/artifact11242619427 at2026-10-03T01:41:00.500+08:00. Canonical Pages was still building and serving v4 at that probe; this response supplies the actually verified Worker URL, not an unverified canonical update or a sandbox attachment.

## Progress messages

截图里是 **40篇已经尝试完，但成功为0、部分完成27、失败11、跳过2**，所以“待处理0”不能代表缺项已经补齐。我先核对为什么队列只纳入40篇，以及未完成项为什么没有继续排入；这次要保留“只补缺项”，但不能把未确认或尚未补完的文献漏掉。

找到原因了：**不是设置了“每批40篇”，而是缺项筛选漏掉了一部分待办。** 当前代码会把库存读取失败的项目留在“未确认”里、不排入队列；已经尝试过但只完成一部分的文章，也不会在本轮继续补。

刚取到的诊断记录还显示，TOC、正文图和文本库存曾同时返回503，导致 **700篇存在未确认项，队列却显示0篇**。这份记录早于你截图中的40篇那轮，但已证实这个缺陷。我要修的是库存失败后的恢复、未完成项续抓和剩余数统计，不是简单把40改成700。

连续队列的测试已经通过：一次运行处理了61篇，第21篇失败后仍继续到第61篇，最后保留显示“未补齐1篇”，不会再清成0。现在还在收尾部署；新版会继续补有进展的未完成项，无法访问或反复无进展的项目则明确保留为受阻，不拖住后面的文献。

修复已合并到正式分支。现在保留的是整份缺项待办：尝试过但没补齐的项目不会消失，日期和期刊优先级也保持不变。我正在核验线上安装入口，确认它实际返回“全队列补缺6”后，再把更新链接给你。

## Final reply

**不是设置了“每批40篇”，而是旧版漏排了待办，又把“已经尝试过”当成了“本轮不再处理”。** 你截图里的27篇部分完成、11篇失败、2篇跳过，并不代表缺项已经补齐；“剩余0”这个判断确实不对。相关逻辑已在新版中修正。fileciteturn271file0L2-L2

**[点击在线更新：Tampermonkey 2.2.39 · 全队列补缺6](https://organic-synthesis-gallery.zhou526316.workers.dev/gallery-vpn-bridge.user.js?fix=20261003-queue-coverage-v6)**

这个入口已在北京时间 **10月3日01:41** 核对为新版，文件与测试版本完全一致。核验时主站原安装入口仍是“缺项补抓4”，因此这次请用上面的新入口。fileciteturn284file0L2-L2

### 现在怎样“从头到尾”抓

**一次启动，连续处理完整的可执行缺项队列，不按40篇或其他固定篇数结束。** 已齐全的内容不重新下载；有新保存进展但尚未补完的文章，会保留已有图片，继续补剩下的部分。遇到单篇失败，会继续处理后面的文献，不让它堵住整个队列。fileciteturn271file0L2-L2

**“尝试过”与“真正补齐”分开统计。** 像你截图里的正文图5／7，仍会保留缺项，不会因为这篇处理过一次就从剩余数里消失。面板现在分别显示“已遍历”“确认补齐”“未补齐”“受阻”；持续无进展或需要登录验证的项目仍列为未补齐，不冒充成功。fileciteturn271file0L2-L2

库存接口临时失败时，会保留本轮此前读取成功的库存和已知待办，并做有限重试，不再因一次503把后面的任务清空。排序仍然是 **网站更新日期从新到旧，同一天内按Nature → Science → Nature子刊 → Science子刊 → JACS → Angew → Chem → 其他**。fileciteturn271file0L2-L2 fileciteturn272file0L2-L2

### 你现在这样更新

打开上方链接，**覆盖安装现有同名脚本，不要卸载或清空数据**。刷新文献库网页，确认标题从“缺项补抓4”变成 **“全队列补缺6”**，再点一次 **“立即开始任务（只补缺项）”**。不用先装上一份“连续到底5”。fileciteturn284file0L2-L2

浏览器模拟测试已验证：同一轮连续处理61篇，第21篇失败后仍处理到第61篇，最后如实显示60篇补齐、1篇未补齐。**这份脚本已经在线；你截图里的未完成论文，还需要更新后重新运行补抓，不能把脚本上线等同于论文已经全部抓好。**fileciteturn272file0L2-L2 fileciteturn284file0L2-L2
