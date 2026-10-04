Beijing time: 2026-10-04 14:40 +08:00
Context: User reported successful draft/add and supplied a real WeChat Official Account message-card screenshot plus public article URL as the visual target.

Verified user result:
- preview paper_count=5 and DOI set match the 2026-10-04 08:00 verified release.
- draft/add returned errcode=0, errmsg=ok and a media_id.
- Therefore fixed-IP server -> token -> cover thumb -> draft/add is working end-to-end.
- The example screenshot shows a native WeChat Official Account card: account identity/date/title at left and cover at right. That outer card is WeChat-rendered; automation controls article title, cover, content and source/read-original URL.
- Direct external fetch of the supplied mp.weixin.qq.com article encountered WeChat environment verification; screenshot is sufficient to establish the desired card form.

User-visible reply:

成功了。**`draft_add errcode=0` 是关键节点：服务器 → 微信草稿箱已经真正打通。**

你发的真实推文截图也把目标样式说明清楚了。截图里灰色的大卡片、公众号头像和名称、“昨天”、转发数量、剩余篇数，以及“标题在左、封面图在右”的整体框架，都是**微信自己渲染的原生公众号消息卡片**。我们不需要自己仿制这个外框。

以后我们只需要把四件事做好：

1. **标题**：决定卡片左侧显示什么；
2. **封面图**：决定右侧那张图是什么，必须清楚、有辨识度；
3. **正文**：自动更新目录 + 每日精选深度解读；
4. **阅读原文**：固定跳到当天那一批新增文献并高亮。

因此正式版不会继续使用现在这个联调占位封面。每日有“文献精选”时，优先用精选论文中最有代表性的原文 Scheme/Figure 做高质量封面；如果当天精选还没加入，就生成简洁的 Gallery 日更封面。封面会单独做微信适配，不拿正文低分辨率缩略图硬放大。

现在先做一个最终验收：**刷新公众号后台的草稿箱**。刚才成功写入后，里面应该已经出现：

**「【联调草稿】有机合成文献更新｜2026-10-04 08:00」**

请打开这篇草稿，给我一张**文章顶部 + 前几篇文献正文**的截图即可。我要确认微信有没有过滤我们的 HTML 样式，以及中英文标题、作者、期刊分组在手机排版里是否正常。

这一步确认以后，基础接口调试就结束。下一阶段我会把联调版改成正式结构：

**08:00 首批上线 → 建当天草稿 → 18:00 第二批上线 → 合并更新同一篇草稿 → 加入你上传的“每日文献精选” → 正式封面 → 文末唯一“阅读原文” → Gallery 固定高亮当天全部新增文献。**

另外，你给的那个 `mp.weixin.qq.com` 链接我尝试直接读取时被微信的环境验证拦住了，所以正文细节目前以你截图为准；这不影响我们复刻它的原生卡片形态，因为卡片本身由微信生成。