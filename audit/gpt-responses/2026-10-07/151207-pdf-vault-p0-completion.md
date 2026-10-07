# PDF Vault P0 completion

- Beijing time: 2026-10-07T15:12:07.000+08:00
- Context: accepted China-first P0/P1 continuation, bounded P0 implementation batch.
- Related implementation commit: 34b7ba38febde9329e78ed7295dddb978f1367cb
- P0 CI: 37585399538; owner access: 37585399588; owner capture: 37585399646; production schema maintenance: 37585399596.
- Installation correction: existing schema.sql maintenance applied the full schema; the dedicated P0 workflow's productionMutations=false is scoped only to itself. Earlier immutable progress logs are superseded on installation status by this record.
- Web reference: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID

## Progress replies since implementation checkpoint

### Progress 5

P0 的正式测试已通过。部署范围有一点需要更正：现有数据库维护工作流会自动执行 `schema.sql`，所以这次也把三张新表安装到了生产 D1；该流程的健康检查和测试账号清理均已通过。普通用户的 PDF 页面与读写接口仍未启用，我会按这个实际结果修正实施记录。

### Progress 6

验收完成：P0 的 48 项检查、你的 PDF 按钮 13 项浏览器检查，以及原有 PDF 自动抓取回归均已通过。生产数据库维护也已完成。这批已经具备文献和副本管理的基础；下一批接上真实本地文件夹保存、重新打开和阅读器，普通用户才会获得可用的保存体验。

## Final user-visible reply

这一批 **P0 核心基础已经完成，并通过正式回归检查**。代码已提交，新数据表也已通过现有维护流程安装到生产 D1。[实现提交：34b7ba3](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/34b7ba38febde9329e78ed7295dddb978f1367cb)

## 这批完成了什么

**1. 文献与文件副本分开管理。**

新增了三张表的定义和迁移脚本：

| 数据表 | 作用 |
|---|---|
| `user_documents` | 记录某个账号保存的文献及偏好版本 |
| `user_document_copies` | 记录 PDF 副本属于谁、在哪台设备或哪种存储中，以及版本和状态 |
| `pdf_capture_sessions` | 记录绑定账号、DOI、出版社、设备和保存目的地的一次性获取会话 |

副本只能关联同账号的文献；相同 DOI 或 hash 不会自动产生跨账号读取权。已删除或撤销的副本不能被迟到的更新重新恢复为可用，重新导入需要新的副本记录。[数据模型与约束](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/34b7ba38febde9329e78ed7295dddb978f1367cb/cloudflare/pdf-vault-v1.sql)

**2. 七种 PDF 状态的判断逻辑已经实现。**

包括 `PDF`、`本机`、`云端`、`另一设备`、`OA`、`需权限`、`获取中`。关键是：**账户记录“这里有一份 PDF”，还不足以显示“本机可读”；必须有当前设备对该副本的实际可读检查结果。** 较新的文件丢失、权限撤销或否定结果，会覆盖旧的可读记录。这些规则已经写成可测试的模块，尚未接入普通用户页面。[状态模块](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/34b7ba38febde9329e78ed7295dddb978f1367cb/shared/pdf-vault-v1.mjs)

**3. 设备标识与获取会话的基础已经补齐。**

设备标识使用 Web Crypto 随机生成；浏览器存储失败时，会明确区分“当前会话临时可用”和“能够持久保存”。随机标识本身不代表文件读取权限。genui{"citation":{"ref":"turn13view1"}}

普通获取会话限制为 **10–15 分钟**，当前只允许保存到本地文件夹或 OPFS。已实现完整绑定校验和单次消费 SQL，并验证了两次并发领取只有一次成功。**实际会话签发、PDF 校验和导入接口仍属于后续接入工作。**[实施说明](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p0-contract.md)

## 验证结果

| 检查 | 结果 |
|---|---|
| P0 状态、设备与数据库约束 | **48 项通过：27 项 Node＋21 项 SQLite** |
| 你现有的 PDF 按钮 | **13 项浏览器检查通过** |
| 原有 PDF 自动抓取兼容回归 | **通过** |
| 生产数据库维护 | **通过，注册测试、测试账号清理和健康检查均成功** |

对应的 [P0 正式检查](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37585399538)、[PDF 按钮检查](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37585399588) 和 [生产数据库维护](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37585399596) 都已保存验收证据。

## 现在到了哪一步

**现在完成的是数据和状态基础，普通用户的“选择文件夹—保存 PDF—再次打开”体验还没有上线。** 本批没有开启跨用户 PDF 共享、自动收取用户文献到你的可读库，或普通用户的新版文库写入放量。

下一批进入 **P1 的实际本地保存流程**：优先接通 Windows／Edge／Chrome 选择真实文献文件夹、校验并保存 PDF、再次打开；再补 OPFS fallback、内置阅读器和“待电脑获取”队列。你的站长私有 PDF 链路继续独立，自动抓取后的核验与启用也仍需单独接通。
