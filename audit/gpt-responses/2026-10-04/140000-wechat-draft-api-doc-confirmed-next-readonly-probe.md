Beijing time: 2026-10-04 14:00 +08:00
Context: User supplied official WeChat developer documentation screenshot for 草稿管理和商品卡片.

Verified from screenshot:
- Official server-side draft endpoints are present:
  /cgi-bin/draft/switch
  /cgi-bin/draft/update
  /cgi-bin/draft/batchget
  /cgi-bin/draft/add
  /cgi-bin/draft/count
  /cgi-bin/draft/delete
  /cgi-bin/draft/get
- The first endpoint is explicitly described as setting or querying the switch state of draft-box and publishing functionality.
- This screenshot is documentation, not the account-specific permission-status table.

User-visible reply:
这张图很关键。它说明新版平台里“草稿箱 API”确实存在，而且有一个专门用于查询/设置草稿箱与发布功能开关状态的接口：/cgi-bin/draft/switch。

所以现在不用继续在权限菜单里盲找“草稿箱”。这张页面只是接口文档，还不能单独证明你账号已经开通，但我们已经找到最可靠的下一步：直接从你现有固定 IP 微信服务器做一次只读能力探测。

现在只做一件事：请点击这张图里的第一行“草稿箱开关设置”，把打开后的接口详情页截图发我。需要看到“请求方式”“请求参数/示例”那一段即可。

拿到这一页后，我会给你一条可以直接在现有 Ubuntu 微信中转服务器执行的命令：
- 不显示 AppSecret
- 不打印 access_token
- 不修改草稿箱开关
- 只查询当前草稿/发布能力状态

如果查询成功，我们马上进入第一篇真实草稿写入测试；如果返回权限错误，我们就能拿到微信的真实 errcode，而不是继续猜账号类型。

目前已经确认：
1. 群发消息 API：无权限；
2. 永久素材：有权限；
3. 正文图片上传：有权限；
4. 草稿 API：官方接口存在，但账号实际可调用状态待服务器实测；
5. 发布 API：下一步和草稿开关一起实测。

所以你现在只需要再发“草稿箱开关设置”的接口详情截图，不需要再截其他菜单。