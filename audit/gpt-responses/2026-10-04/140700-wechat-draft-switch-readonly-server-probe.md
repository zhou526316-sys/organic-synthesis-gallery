Beijing time: 2026-10-04 14:07 +08:00
Context: User supplied official WeChat draft/switch endpoint documentation.

Verified from user screenshot:
- Method: POST
- Endpoint: https://api.weixin.qq.com/cgi-bin/draft/switch
- Query-only parameter: checkonly=1
- No request body.
- On errcode=0, is_open=0 means closed; is_open=1 means opened.
- Documentation notes draft/publish capability is under staged rollout and this switch controls upgrade to draft box/publishing functionality.

Verified current repository deployment:
- Existing fixed-IP relay stores WECHAT_MP_APP_ID and WECHAT_MP_APP_SECRET in /etc/osg-wechat-relay/env.
- Ubuntu installer includes curl and python3.
- Relay already exists specifically because WeChat API uses IP allowlisting.

User-visible reply:
这张页面已经够了。现在不再继续翻后台，直接做**第 2 步：在你现有固定公网 IP 的 Ubuntu 微信服务器上，只读查询草稿箱/发布开关**。

先登录之前部署 `relay.gczhouwld.com` 的那台 Ubuntu 服务器。登录后依次执行：

```bash
curl -fsS https://relay.gczhouwld.com/health && echo
```

正常应看到类似：

```json
{"ok":true,"service":"osg-wechat-ticket-relay"}
```

然后整段复制下面命令执行。它不会显示 AppSecret、不会输出 access_token，也不会修改开关：

```bash
sudo bash -lc '
set -a
source /etc/osg-wechat-relay/env
set +a

python3 - <<'"'"'PY'"'"'
import json
import os
import urllib.parse
import urllib.request

def request_json(url, method="GET"):
    req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

token_query = urllib.parse.urlencode({
    "grant_type": "client_credential",
    "appid": os.environ["WECHAT_MP_APP_ID"],
    "secret": os.environ["WECHAT_MP_APP_SECRET"],
})
token_result = request_json(
    "https://api.weixin.qq.com/cgi-bin/token?" + token_query
)

token = token_result.get("access_token")
if not token:
    print(json.dumps({
        "stage": "access_token",
        "errcode": token_result.get("errcode"),
        "errmsg": token_result.get("errmsg"),
    }, ensure_ascii=False))
    raise SystemExit(1)

switch_query = urllib.parse.urlencode({
    "access_token": token,
    "checkonly": "1",
})
switch_result = request_json(
    "https://api.weixin.qq.com/cgi-bin/draft/switch?" + switch_query,
    method="POST",
)

print(json.dumps({
    "stage": "draft_switch",
    "errcode": switch_result.get("errcode"),
    "errmsg": switch_result.get("errmsg"),
    "is_open": switch_result.get("is_open"),
}, ensure_ascii=False))
PY
'
```

只把最后输出的 JSON 发回来即可。它不会包含密钥。

结果按下面判断：
- `errcode: 0, is_open: 1`：最好，草稿箱/发布开关已经开启。下一步直接测试 **draft/add 创建第一篇真实草稿**。
- `errcode: 0, is_open: 0`：账号能访问这个能力，但开关尚未开启。下一步再由用户明确执行开启，不在这次只读探测中修改。
- 非 0 `errcode`：把该 JSON 发回来，根据微信返回的真实错误码判断是接口权限、IP 白名单、AppSecret/token 还是灰度资格问题。

此前截图已经确认：群发 API 无权限；永久素材和正文图片上传有权限。这个测试通过后，我们就能确定是否可以实现“网站更新 → 自动生成目录+精选 → 自动写入公众号草稿/发布”。群发如果仍无 API 权限，就只保留最后一次人工群发动作。