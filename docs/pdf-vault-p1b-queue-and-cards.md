# PDF Vault P1b：待电脑获取与主站卡片状态

本批接续 [P1 本地保存与阅读](./pdf-vault-p1-local.md)，实现同一账号的待电脑获取队列，并把本机副本的短时检查结果接到主站卡片。前一批文档中将这两项列为后续工作的说明，由本文更新。

**状态：实现和本地回归已完成；6 项正式 API 验收及本批实际线上交付证据仍待确认。** 本文不表示生产验收已经通过，最终运行和提交证据另行补充。

## 用户流程与保存边界

1. 手机登录 Gallery，从文献卡片进入 `/pdf-vault/?doi=...`，点击“加入待电脑获取”。服务只保存当前账号的 DOI、任务状态、版本号和时间。
2. 电脑登录同一账号，打开文献库并刷新队列。任务提供“打开出版社”“导入已下载的 PDF”“标为已处理”和“取消任务”。出版社访问与下载由用户在自己的网络和登录环境完成。
3. 用户导入自己已下载的 PDF，沿用 P1 的真实文件夹或明确选择的 OPFS 保存方式，以及 PDF.js 检查、写后读回和 hash 核对。**保存本地 PDF 不会自动完成队列任务。** 用户确认处理完成后，再点击“标为已处理”。

队列面板在账号验证后独立挂载；即使手机没有 IndexedDB 或本地存储初始化失败，仍可操作队列。队列同步失败会显示“未确认本次操作完成”，不妨碍已经可用的本地 PDF 功能。跨设备任务列表需要联网和有效会话，本批不提供离线队列写入。

任务的 `pending` 只表示待处理，`completed` 只表示用户标记已处理；两者都不证明出版社权限、PDF 已下载、云端有副本或当前设备可读。本批没有同步 PDF manifest、文件路径、目录句柄、hash、PDF 字节或全文，也没有把个人文件收集到站长库。

站长的 `private_pdf_*`、`private_pdf_read`、自动捕获和 **R2 私有 PDF 存储**继续独立工作。普通用户队列和本地入口不复用站长读取能力，不把站长副本或相同 hash 变成其他账号的读取权；PDF 本体没有因此改存 Git。

## 主站卡片的实际状态

卡片按以下顺序选择本批可用状态；按钮始终进入对应 DOI 的管理页，不自动读取文件或打开阅读器。

| `data-pdf-vault-state` | 中文按钮 | 所需证据 |
| --- | --- | --- |
| `local` | PDF · 本机 | 当前账号、当前设备的副本，以及不超过 60 秒的实际可读检查结果 |
| `check` | PDF · 待检查 | 当前设备存在副本记录，但没有有效可读结果；应检查文件或恢复权限 |
| `queue` | PDF · 待电脑 | 没有上述本地副本状态，且最近 30 秒内确认该账号任务为 pending |
| `none` | 本地 PDF | 没有以上有效证据，或尚未确认账号；保留管理入口 |

本机检查结果绑定 `user_id + DOI + copy_id + content_hash + device_id`，不能来自未来时间。数据库的 `available`、`last_verified_at` 或队列完成状态不能代替实读结果。60 秒到期会撤下“本机”提示；用户真正点击打开或导出时，仍重新检查权限、文件是否存在、长度和 hash。

本地导入、打开和失败检查会持久化当前结果，并通过随机变更标记通知其他标签页。通知没有 DOI、账号、路径或文件内容。失效时先撤下旧提示，再重新读取元数据；晚到的队列响应和旧定时回调不得恢复已经失效的状态。退出或切号会撤销旧控制器、清空账号相关显示并废弃迟到结果。

主站继续采用**桌面每页 24 条、手机每页 12 条**的按数量分页。每次实际渲染由 `main.ts` 显式触发卡片绑定：本地只做一次有界 IndexedDB 只读事务，按 `by_document` 索引查询当前页 DOI；需要更新队列时至多发一条、最多 24 个 DOI 的批量请求。首页不调用文件读取、权限探测或内容 hash，也不预载 PDF.js 阅读器。

实现入口：[cards.mjs](../src/pdf-vault/cards.mjs)、[local-vault.mjs](../src/pdf-vault/local-vault.mjs)、[queue-panel.mjs](../src/pdf-vault/queue-panel.mjs)。卡片身份由独立会话验证建立，不从站长 capability 事件推导。

## 队列 API 与并发约定

固定端点：`https://api.gczhouwld.com/api/user-ui/pdf-vault/queue`。请求使用 Gallery `Authorization: Bearer …` 会话；服务端确定 `userId`，不接受客户端提交账号身份。响应使用 `Cache-Control: private, no-store`，与普通用户 library/account-sync 写入链路独立。

每个 `item` 仅含以下字段：

```json
{
  "doi": "10.9999/example",
  "state": "pending",
  "revision": 1,
  "createdAt": 1791360000000,
  "updatedAt": 1791360000000
}
```

DOI 规范化后最长 512 字符；状态为 `pending | cancelled | completed`；时间为 Unix 毫秒整数，revision 为正安全整数。

| 操作 | 请求 | 成功响应 |
| --- | --- | --- |
| 待处理列表 | `GET ?limit=50&after=<DOI>`；两参数均可省略 | `{userId, items, nextAfter, hasMore}`；仅 pending，按规范化 DOI 升序 |
| 单条查询 | `GET ?doi=<DOI>` | `{userId, item}`；未建立记录时 item 为 null |
| 批量查询 | `GET ?doi=<A>&doi=<B>` | `{userId, items}`；最多 24 个不同 DOI，包含已存在的 cancelled/completed 记录 |
| 改变任务 | `POST` JSON，仅 `{doi, action, expectedRevision}` | `{userId, item}`；action 为 `queue | cancel | complete` |

列表默认和最大页长均为 50；有下一页时 `nextAfter` 是本页最后一个 DOI，否则为 null。DOI 查询与 `after/limit` 不混用。POST 不接受查询参数、额外字段或非 JSON 内容，实际请求体上限为 2,048 字节。

表 `user_pdf_acquisition_queue` 以 `(user_id, doi)` 为主键。创建只能使用 `action: queue, expectedRevision: 0`；已有记录必须提交当前 revision。每次实际成功写入都将 revision 加一，包括提交相同状态的写入。取消和完成保留原行与 revision，再次入队更新该行，避免旧请求按 revision 0 重新创建任务。

比较 revision、验证有效会话和检查容量在同一条受条件保护的 SQL 写入中完成。旧 revision 返回 **409**：`{error: "pdf_vault_queue_revision_conflict", userId, item}`，item 是当前记录或 null；界面重新读取后让用户核对，不自动重放旧操作。

每账号最多 **500 条 pending**，最多 **10,000 条不同 DOI 的任务记录**，后者包含 cancelled/completed 历史。完成或取消释放 pending 名额，不删除历史行；再次处理已有 DOI 不增加历史行数。超限返回 **429**，分别使用 `pdf_vault_queue_pending_limit` 或 `pdf_vault_queue_total_limit`。未登录、失效或已撤销会话返回 401；非法字段返回 400；超大请求体返回 413；非 JSON 返回 415；数据库或服务不可用返回 503。

服务读写前后重新确认会话；客户端在请求、响应和外层异步返回处也检查账号有效性。409 后重新读取列表的异常处理同样受账号约束，不能把旧账号状态写入新账号面板。

实现：[Worker 队列模块](../cloudflare/worker/src/pdf-vault-queue.js)、[独立 SQL](../cloudflare/pdf-vault-queue.sql)、[客户端](../src/pdf-vault/queue-client.mjs)。表定义也纳入现有完整 schema 和正式维护流程。

## 验证与上线证据边界

本批本地验收覆盖 **76 项 Node、21 项 SQLite schema、21 项本地 PDF 浏览器、16 项站长入口及普通卡片浏览器检查**。原有 17 项本地流程与 13 项站长回归保留在扩展后的浏览器套件中。

浏览器测试实际使用 Chromium IndexedDB、OPFS、FileSystemHandle 持久化和 PDF.js；手机与电脑使用独立 BrowserContext，共享按上述接口实现的队列服务 fixture。它们验证跨账号与跨设备任务隔离、503/409、迟到响应、真实本地保存与重新打开、跨标签页状态更新、60 秒过期、24/12 单批查询及首页零文件读取。目录选择器仍以真实 OPFS 目录句柄替代系统弹窗，不等于真人 Windows 权限提示验收。

主要命令：

```sh
node --test scripts/test-pdf-vault-v1.mjs scripts/test-pdf-vault-device.mjs scripts/test-pdf-vault-local.mjs scripts/test-pdf-vault-queue-client.mjs cloudflare/worker/scripts/test-pdf-vault-queue.mjs
python3 scripts/test-pdf-vault-schema.py -v
npx vite build
node tests/pdf-vault-local-browser.mjs
node tests/private-pdf-access-browser.mjs
```

正式 API 的 [6 项验收脚本](../cloudflare/worker/scripts/verify-pdf-vault-queue-live.mjs) 检查认证/CORS、同账号不同会话、账号隔离、CAS、独立 revision 和拒绝伪造身份。该脚本会创建独立合成账号、会话和队列，结束时清理并核对零残留，属于有界生产写入；**尚待正式运行结果确认，不能以本地 fixture 成功替代。**

前端仍由正式 Pages 工作流发布；浏览器小型报告记录实际加载文件的大小和 SHA-256，随后由既有只读主域名核验确认交付。API 验收、合成数据清理、发布源码与主域名静态文件核验应分别记录。本文不提前填写成功 run、上线时间或生产验收结论。
