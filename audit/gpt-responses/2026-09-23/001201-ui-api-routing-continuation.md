# UI / feedback continuation response

Beijing time: 2026-09-23T00:12:01+08:00
User request: 继续
Context: feedback 28 static/API routing follow-up; feedback 29/30 queued.
PR: 133. Branch: fix/ui-api-path-routing-20260923. Head: 64bdd71d1c9acd8bfdb6413781ab3a182fc282cb.
Production-code change commit: 08985ce6405da0dd6671494bf213040651c26c56.
Evidence: audit/ui-feedback/2026-09-23-001201-api-routing-checkpoint.json (commit 84cc084ff17b991d233c8a7aeb17d0786683d650).
The feature branch was not merged or deployed this turn.

## User-visible progress after initial checkpoint

修复代码和回归用例已提交到独立分支：检查静态文件不换域名，同时验证 API 断网回退仍有效。接下来保留全部原图验收条件重测。

PR #133 已进入质量检查。本批不扩大改动范围：先修请求路由，确认它没有破坏原图、动图、收藏和阅读状态。

类型检查和构建已通过，浏览器回归正在运行。生产代码只增加了 API 路径判断；原有 GIF 播放、刷新恢复和报错检查都保留。

新增路由测试已通过，9 项回归中通过了 8 项。剩下一项捕获到阅读人数请求的跨域报错；我先查清原因，不直接重跑或忽略报错。

通用质量门禁已全部通过，但原图专项仍有这一条失败记录。这批先保留在 PR #133，不合并上线，也不把阅读人数问题标记为已解决。

## Investigation boundary

The current and prior downloaded source snapshots were inspected for optional reader-count fetches and error handling. The remaining error's root cause was not established. External Playwright route documentation and related navigation-error reports were consulted as diagnostic background; they do not prove this repository's cause. No speculative production cancellation change or test-assertion relaxation was made. The full downloaded artifact results.json and archive hash were inspected, and an explicit no-merge checkpoint was posted to PR133 (comment ID 5779894524).

## Final user-facing response

**本批已提交“静态文件误走 API 回退”的修复，PR #133；新增路由测试通过，但还有一项回归失败，因此没有合并上线。** 当前分支提交为 `64bdd71`。fileciteturn187file0L2-L13fileciteturn201file0L2-L2

### 本批改动

新代码只对 `/api` 或 `/api/…` 请求执行 API 域名回退。文献数据、中文标题、图片索引等静态文件保持原来的请求域名，不再因为位于 Worker 域名下就被误转走；上一批的本地原图 `blob:` 修复也保留。fileciteturn192file0L8-L9

新增测试覆盖了 **81 种静态文件、相对地址及第三方地址的输入组合**，并验证 API 断网回退、请求内容保留等行为没有被破坏。这两组新测试均已通过。fileciteturn201file0L2-L2

### 验收与阻塞

通用质量门禁、数据校验和 Cloudflare 迁移检查均通过。原图专项共 **9 项，8 项通过、1 项失败**；已通过的项目包括 30MB 原图校验、上传失败保护、上传中移除，以及手机端 GIF 播放与刷新恢复。fileciteturn201file0L2-L2

**唯一失败发生在桌面端测试最后的“页面是否报错”检查，不是 GIF 功能断言。** 它捕获了阅读人数接口的跨域报错。该测试已拦截真实外部请求，目前还不能确定原因是模拟请求时序、页面切换时的请求处理，还是其他前端问题；不能据此宣称真实阅读人数已经修好。fileciteturn201file0L2-L2

所以本批没有覆盖生产版本，也没有关闭第 28 条。**#29 摘要窗口放大、#30 可选光效仍未实现**；抓图链路、文献数据和真实阅读人数均未改动。fileciteturn201file0L2-L2

[查看本批测试记录与截图](sandbox:/mnt/data/feedback28-routing-first-ci.zip)
