# Official Tampermonkey reinstall: Overwrite is normal

Beijing time: 2026-10-08 16:23:48 +08:00
Context: user pasted official installation URL into Chrome and sees only Overwrite.
No code changes, deployment, account changes, or PDF/media writes.

## Response
这是正常现象。**Tampermonkey 显示 `Overwrite`（覆盖），说明浏览器已经安装了同名脚本。**

你现在要做的就是：

1. 确认安装页面显示的版本是 **2.2.71**。
2. 点击 **Overwrite（覆盖）**。
3. 等待安装完成，刷新 [Gallery 网站](https://gallery.gczhouwld.com/)。
4. 在 Tampermonkey 管理面板中确认 VPN Bridge 版本已变成 **2.2.71**。

**覆盖安装不会自动清除原有脚本存储。** 不要先卸载脚本，也不要选择清除数据。
