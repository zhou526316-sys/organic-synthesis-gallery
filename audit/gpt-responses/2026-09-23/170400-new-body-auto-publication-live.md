# Automatic new-body publication — user reply

Beijing context:2026-09-23 17:04 +08:00. Final live acceptance16:58:15.334.
Task: continue the requested new-capture automatic publishing path without historical-image review for every new file.
Production PR160 merge:fa71eedf1a14096ed9ff980745405f845921cc9e.
First deployment35839047474; continuous consumer35839856913 (trigger commit7cad01dabd303910eaf0dd2287e759c1ad98571a); live verifiers35839198914 and35840067251.
Completed audit22265aa4aa0d462bb8c0d4ee169e00dde84fc142, audit/media-acceptance/2026-09-23-165815-new-body-auto-live.md.
Same workflow's push-trigger continuation verified; natural schedule tick not yet observed. No collector/Worker/corpus changes in this publication feature; installedBridge2.2.23 unchanged.

## User-visible reply

**已经接通“新抓正文图 → 自动校验 → 自动上架”。本轮两次生产运行实际新增了37张正文图，不再只是给图片加一个“待审”标记。** 最新线上验收完成于**9月23日北京时间16:58**。fileciteturn901file0L2-L2

### 已经实际跑通的结果

第一轮自动上架14张；随后用同一套持续发布流程接续，又上架23张，并完整保留了第一轮的14张。**主站发布索引中的正文图从本轮开始前的81张增加到118张，此前恢复的101篇官方TOC仍保留。** 中间其他已批准批次的增长没有算入这37张。fileciteturn901file0L2-L2

两轮共检查了10篇文献的真实卡片，**37张线上图片的文件哈希、所属DOI、图号、图片地址和发布记录均通过核对，卡片图片均成功解码**。第二轮还专门验证了“新增图片时，上一轮已发布图片不会丢失”。fileciteturn901file0L2-L2

### 后续新图怎样上架

现在仓库内配置了**每15分钟检查一次新增图片**：发现符合条件的新记录后，自动校验并调用正式网页发布流程；没有符合条件的新增记录，就不进行无意义的重建。每轮暂按**最多5篇、30张新增图片**处理，并遵守当前每篇最多展示10张正文图的限制。文献本身的08:00／18:00发布安排没有改动。fileciteturn901file0L2-L2

**这一轮已实测“检查新增 → 自动发布 → 线上验收”的完整流程。** 定时配置也已上线，但目前验证的是对同一流程的主动触发，尚未观察到一次自然定时触发；另外，GitHub定时任务可能延迟，所以15分钟是检查间隔，不是保证15分钟内一定显示到网页。fileciteturn901file0L2-L2 citeturn541608view0

自动校验会重新确认任务与页面DOI、图片来源、图号与图注、实际文件哈希及能否正常解码，而不是只相信脚本的success。**合格的新图不再等我逐篇手工打包；异常条目单独保留，不拖住其他合格图片。** 这属于来源与文件的自动技术核验，不等同于逐图人工解读，也不代表全文图集已经收齐或都是最高分辨率。fileciteturn901file0L2-L2

**首批自动开放的是带完整新标记的JACS、Organic Letters、JOC和ACS Catalysis正文图。** Nature、Wiley以及来源无法明确绑定的图片，暂时仍走单独处理；历史封存图片没有混入这条新图通道，旧图隔离也没有解除。fileciteturn901file0L2-L2

### 你这边不需要再更新脚本

继续使用**2.2.23**即可，不需要重装、清空记录或重新抓这37张图。暂存原件仍保留：**抓取回执中的“已暂存／未发布”描述的是保存当时的状态，之后是否上线，应以发布账本和卡片为准。** 查看新效果时，等当前文章任务结束、暂停抓取后，再刷新同一个Gallery控制页。fileciteturn901file0L2-L2

本轮解决的是新正文图的自动上架；**上传503、部分ACS格式识别和Wiley图片发现问题仍未被这次改动解决**，没有将“上架成功”冒充“所有抓取故障已修好”。fileciteturn901file0L2-L2

[查看最新5张卡片的实测截图](sandbox:/mnt/data/new-body-auto-live/cards-overview.png)　｜　[37张自动上架图片及两轮验收明细](sandbox:/mnt/data/new-body-auto-live-verification-20260923.json)
