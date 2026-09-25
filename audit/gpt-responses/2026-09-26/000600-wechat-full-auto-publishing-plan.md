北京时间 2026-09-26 00:06；上下文：微信公众号全自动推文发布方案。

可以。按“真正全自动、真正推送给粉丝”来设计，而不是只把文章放到公众号里。

先纠正一个关键点：freepublish/submit 是“发布”，不会主动推送给粉丝；如果你要公众号像正常推文一样推到关注者，需要走群发接口 message/mass/sendall。两条链路不要混淆。

1. 先确认公众号权限。进入 mp.weixin.qq.com → 设置与开发 → 接口权限，确认至少有“获取 access_token”“群发接口”。如果没有群发接口，官方 API 无法实现真正的自动推送给粉丝；只能做到自动发布文章。认证订阅号通常可以做群发，服务号的推送额度更严格，最终以你后台实际权限和额度为准。

2. 准备一台有固定公网 IPv4 的 Linux 服务器。不要让 GitHub Actions 直接调用微信接口，因为其出口 IP 不固定，不适合作为微信 IP 白名单来源。把服务器公网 IP 加到公众号后台的 IP 白名单。以后所有微信 API 请求都从这台服务器发出。

3. 在服务器只保存密钥，不写进 GitHub。创建 /opt/gallery-wechat/.env：
WECHAT_APPID=你的公众号AppID
WECHAT_APPSECRET=你的公众号AppSecret
OPENAI_API_KEY=你的OpenAI_API_Key
GALLERY_FEED_URL=https://zhou526316-sys.github.io/organic-synthesis-gallery/wechat-feed/latest.json
WECHAT_MODE=mass

OpenAI API key 也只在服务器环境变量或 secret manager 中保存。ChatGPT 订阅与 API 计费是两套体系，自动化调用要单独使用 OpenAI API。

4. 让 Gallery 每天生成一个“公众号输入文件”，不要让公众号程序重新抓文献。建议 18:00 文献正式更新完成后生成 public/wechat-feed/YYYY-MM-DD.json，同时维护 latest.json。字段至少包括当天 08:00 和 18:00 两批新收录的 DOI、英文标题、中文标题、期刊、日期、摘要、TOC URL、全合成标记、Gallery 卡片链接。这样公众号链路只消费已经审核通过的数据，不重新做文献筛选。

5. 用 OpenAI Responses API 自动写公众号正文。服务器脚本读取 daily feed 后调用 gpt-5.6-sol。提示词硬性要求：只能使用 feed 中已有事实；不得编造产率、机理或底物范围；所有 DOI 必须来自 feed；输出固定 JSON：title、digest、html、selected_dois、cover_text。建议再调用第二次模型做自动审稿，逐句检查是否有 feed 之外的事实；只有二审通过才进入微信发布。

6. 处理图片。公众号正文里的外部图片不要直接引用 Gallery/Nature/ACS URL。程序先下载当天选中文献的 TOC，统一压缩成 jpg/png，再调用微信正文图片上传接口 media/uploadimg，拿到微信自己的 mmbiz 图片 URL，然后替换 HTML 中的 img src。封面图单独上传为永久图片素材，拿到 thumb_media_id。

7. 生成可群发的图文素材。真正推送粉丝时，使用 /cgi-bin/media/uploadnews 创建 mpnews，传 title、author、digest、content、content_source_url、thumb_media_id。不要把 freepublish/submit 当成群发。若你的账号只有“发布”权限没有“群发”权限，才改走 draft/add → freepublish/submit。

8. 自动群发。拿到 mpnews 的 media_id 后调用 /cgi-bin/message/mass/sendall，filter.is_to_all=true，msgtype=mpnews。返回 msg_id 只代表群发任务已提交，不代表已经发送完。随后每隔 20–30 秒调用 /cgi-bin/message/mass/get 查询状态，直到 SEND_SUCCESS 或明确失败。

9. 定时运行。对 Gallery 最合适的是每天北京时间 19:10 执行一次，把 08:00 和 18:00 两批合并成一篇日更。Linux 上用 systemd timer，比 ChatGPT Scheduled Task 更适合作为最终生产触发器。如果你的公众号是认证订阅号，常见群发额度是每天 1 次；服务号用户通常每月只能接收 4 次群发，所以服务号不能按“每天一篇推送”来设计，需以你的后台额度为准。可以做到每天自动 freepublish，但只在允许的日期做 mass send。

10. 必须做防重复和失败恢复。用 SQLite 保存 job_date、feed_sha256、openai_response_id、wechat_media_id、msg_id、status、published_url。feed_sha256 已成功发送就禁止再次发送。如果 message/mass/sendall 已返回 msg_id，网络超时后不要直接重发，先查 msg_id 状态。错误日志记录微信 errcode/errmsg，但绝不记录 access_token、AppSecret 或 OpenAI key。连续失败时给你发告警，而不是无限重试。

推荐生产链路：
Gallery 08:00/18:00 审核发布
→ 生成 wechat-feed/latest.json
→ 19:10 VPS systemd timer
→ OpenAI 生成 + OpenAI 二审
→ 下载/处理 TOC
→ 微信 uploadimg / 封面素材
→ media/uploadnews
→ message/mass/sendall
→ message/mass/get
→ 写回发布状态与永久文章链接

第一步先去公众号后台确认“接口权限”页里是否有“群发接口”。有的话，下一步就按固定公网 IP 服务器方案搭；没有的话，官方 API 不能做真正的粉丝群发，只能做全自动发布。
