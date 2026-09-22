# Published Tampermonkey update — user reply

Beijing context: 2026-09-23 00:47 +08:00; public acceptance at 00:44:35 +08:00.
Task: user requested an updated clickable script immediately for overnight single-article TOC/body acquisition.
Release commit: a907fe4d02a8fa05c5f368263d8e3d0e0754cc85 (PR135).
Pages deployment: 35755216894; Worker deployment: 35755217087; final HTTP check: 35756109999.
Audit evidence commit: b45abe6ec9b516750f6e65e5a0ff10fafc99ed1f.
Initial commentary: 这批优先收尾发布：对齐新版脚本、完整抓取队列和 Worker 接口，验证线上版本后直接给你可点击安装的链接，不再只交付分支代码。

## User-visible reply

**[点击安装／更新 Gallery VPN Bridge 2.2.20](https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.20)**

**已经正式上线，可以启动连续抓取。** 我已核对线上安装文件为 **2.2.20**、内部核心为 **6.2.20**，Worker 接口版本匹配；完整的 **512 篇文献任务注册表**也已发布，不再使用隔离前那个只有少量缺口的旧队列。fileciteturn497file0L2-L2

### 你现在这样启动

1. **点击上面的链接，更新现有脚本。** 安装页确认版本为 **2.2.20**；不要卸载旧脚本或清空存储，保留现有密钥。
2. **关闭之前残留的出版社任务标签页，只保留一个 Gallery 控制页。** 刷新该页，然后在 Tampermonkey 菜单中点击 **“继续媒体抓取主线”**，解除之前的暂停状态。更新脚本本身不等于已经开始抓取。fileciteturn497file0L2-L2
3. **先观察前一两篇是否出现实际存储结果，再放着运行。** 电脑保持接通电源、不进入睡眠，浏览器和 VPN 不要关闭。可以关闭显示器，但不要让电脑休眠。

新版会**一次打开同一篇全文，同时处理 TOC 和正文 Figure／Scheme／Chart**；没有 TOC 也继续抓正文图。默认每批 8 篇，有后续任务时约 12 秒后继续下一批，不需要你每批手动点击。单篇失败会记录并继续处理其他任务，重试有间隔和次数限制。fileciteturn497file0L2-L2

抓取也加入了高清候选择优、SVG 独立判断和逐图进度保存；每次访问最多新增 20 张独立图号图片，部分完成后可接续，已确认存储的图片不必全部重下。此前恢复的 **83 篇 TOC 仍保留**。fileciteturn497file0L2-L2

**需要明确：这一版可以持续“抓图并保存”，但正文图仍先进入 R2 暂存，暂未自动转为网页正式展示。** 看到“已暂存”表示文件已保存，不表示卡片图集已经更新。出版社登录失效或验证码仍可能需要人工处理，因此不能保证所有网站整夜无人干预，也不能保证一夜抓完整库。fileciteturn497file0L2-L2
