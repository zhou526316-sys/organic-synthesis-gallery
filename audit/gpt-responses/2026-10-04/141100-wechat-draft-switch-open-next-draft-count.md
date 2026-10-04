Beijing time: 2026-10-04 14:11 +08:00
Context: User ran read-only /cgi-bin/draft/switch?checkonly=1 on the fixed-IP Ubuntu server and returned {"stage":"draft_switch","errcode":0,"errmsg":"OK","is_open":1}.

Verified:
- WeChat access_token succeeded.
- The current server's IP allowlist/credentials are sufficient for draft/switch.
- Draft/publish switch is open.
- This still does not prove draft/add until an actual draft API call succeeds.

Next step: read-only draft/count probe before creating a test draft.

User-visible reply:

结果正常：**`errcode=0` 且 `is_open=1`**。这意味着你的公众号当前已经开启了**草稿箱/发布功能**，而且我们现有固定 IP Ubuntu 服务器能够正常拿到 token 并访问这一能力。

现在不要直接发布。先做最后一个只读验证：**查询草稿总数**。它不会创建、删除或修改任何文章。

在当前 Ubuntu 终端直接复制执行：

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

def get_json(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.load(r)

token_query = urllib.parse.urlencode({
    "grant_type": "client_credential",
    "appid": os.environ["WECHAT_MP_APP_ID"],
    "secret": os.environ["WECHAT_MP_APP_SECRET"],
})
token_result = get_json(
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

count_url = (
    "https://api.weixin.qq.com/cgi-bin/draft/count?"
    + urllib.parse.urlencode({"access_token": token})
)
result = get_json(count_url)

print(json.dumps({
    "stage": "draft_count",
    "errcode": result.get("errcode", 0),
    "errmsg": result.get("errmsg", "OK"),
    "total_count": result.get("total_count"),
}, ensure_ascii=False))
PY
'
```

正常情况下会返回类似：

```json
{"stage":"draft_count","errcode":0,"errmsg":"OK","total_count":3}
```

其中 `total_count` 是你公众号当前草稿数，多少都没关系。

如果这一步也是 `errcode: 0`，权限检查阶段就结束。**下一步我会让程序自动上传一个封面，并用今天 Gallery 已正式上线的文献生成第一篇真实“每日文献更新”草稿到你的公众号草稿箱**，先不发布、不群发，供你在微信后台人工检查排版。

目前链路已经确认到这里：

**固定 IP 服务器 → access_token ✅ → 草稿/发布开关 ✅ → 素材上传 ✅ → 正文图片上传 ✅ → 群发 API ❌**

再把 `draft_count` 的最后一行 JSON 发给我即可。