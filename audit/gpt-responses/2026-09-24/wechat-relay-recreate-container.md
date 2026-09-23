Beijing time: 2026-09-24
Context: Diagnose stale Docker env after AppSecret synchronization

Reply body:

我重新测了，微信仍返回 40125，但这次原因基本锁定了：你虽然已经改了服务器上的 AppSecret，之前执行的 `docker restart osg-wechat-ticket-relay` 不会重新读取 `--env-file`。Docker 容器的环境变量是在 `docker run` 创建容器时注入的，所以旧容器仍然在使用旧 AppSecret。

我已经在仓库增加了一个安全的重载脚本 `ops/wechat-ticket-relay/reload-env.sh`，它会删除旧容器并用当前 `/etc/osg-wechat-relay/env` 重新创建，同时自动做一次微信 ticket 探测。

请在 SSH 里执行：

```bash
cd /opt/organic-synthesis-gallery
sudo git pull --ff-only
cd ops/wechat-ticket-relay
sudo ./reload-env.sh
```

如果最后显示：

`WeChat ticket probe: PASS (HTTP 200)`

就说明 AppSecret、固定 IP 白名单和 jsapi_ticket 全部真正打通。

如果仍显示 `40125 invalid appsecret`，那才说明服务器文件里的 AppSecret 本身仍然不对，需要回微信后台重新获取当前 AppSecret。

不要把 AppSecret 或 relay key 发给我。把 `reload-env.sh` 最后的 PASS/FAIL 输出贴给我即可。

相关修正提交：`5b4f6d2cf4930775b0c082aeac532415bb87085e`.

Related commits:
- 5b4f6d2cf4930775b0c082aeac532415bb87085e
- 5b4f6d2cf4930775b0c082aeac532415bb87085e
