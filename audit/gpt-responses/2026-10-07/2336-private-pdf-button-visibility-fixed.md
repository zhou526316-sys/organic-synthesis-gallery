# Private PDF button visibility repair

- Beijing time: 2026-10-07 23:36 +08:00
- User report: the private `PDF` card button disappeared and only the ordinary `本地 PDF` button remained.
- Root cause: `src/private-pdf-access.ts` synchronously revoked `private_pdf_read` UI state before every asynchronous session capability check. Any temporary auth/session delay, timeout or 5xx therefore hid the owner PDF button indefinitely even though the bearer session/capability might still be valid.
- Functional commits:
  - `130c95b99e5ab2590f8b1e521797161ebf12d9a8` — preserve verified owner button across session outages using token-bound UI continuity cache; explicit logout/account switch/server denial still revokes immediately.
  - `5f9dcb1b28a6f9db5f87f84feba2ff17e46d3c37` — publish unresolved `checking/false` state without revoking an already verified positive entitlement, preserving the existing account-switch race contract.
- Private PDF regression: run 37643291961 — success, 17/17 browser cases.
  - verified owner PDF button survives a transient session endpoint outage — pass
  - explicit server denial clears a cached owner PDF entitlement — pass
  - late owner capability response cannot reopen PDF after account switch — pass
  - logout/account switching/token watcher isolation cases — pass
- Worker deploy: run 37643378852 — success.
- Worker/frontend sync: run 37643292075 — success.
- GitHub Pages deploy: run 37643292080 — success.
- Live delivery audit: `f004ac1cad63d9a83e98758a4b6bc8ef2c311fc0` records sourceCommit `5f9dcb1b...`, pagesRun `37643292080`, status `success-live-verified`.

## Final user-visible response

问题已经修复并正式上线。

根因不是 PDF 库存丢了，而是按钮权限判断写错：以前页面每次启动或刷新登录状态，都会先把 `private_pdf_read` 设成 false、把 PDF 按钮隐藏，然后才请求服务器确认。只要这次请求稍慢、超时或临时 5xx，按钮就一直消失，于是你只看到“本地 PDF”。

现在改成：
- 已经验证过的 owner 权限会立即恢复 PDF 按钮，后台静默复核；
- 临时网络失败/超时不会再把按钮隐藏；
- 明确退出登录、切换账号或服务器明确返回无权限时，仍会立即隐藏；
- 真正打开 PDF 时后端仍再次验证权限，因此没有降低访问控制。

这次新增的相关浏览器回归 **17/17 全部通过**，包括“权限接口临时 503 时 PDF 按钮仍保留”和“明确撤权时缓存按钮必须消失”。Worker 与 GitHub Pages 都已发布成功，线上交付记录明确绑定最新修复 `5f9dcb1b`，状态为 `success-live-verified`。

你现在只需要刷新一次 Gallery 主页面。正常情况下，“PDF”按钮应该重新出现在“本地 PDF”旁边；不需要重新安装 Tampermonkey，也不要退出账号。
