# PDF Vault P1b completion

Date: 2026-10-07 (Asia/Shanghai)

Implementation commit: d876ab867a6a88d2a0fb390a37f00b2aee84c11f
Actual Pages source: 15e29d86f3ce0082db344eb5c40981b9654ae24c
Canonical Worker: 37594670214; canonical Pages: 37594651811; PDF live delivery: 37596448810. All success.

## Assistant commentary (verbatim)

### Update 1

本轮网站构建正在执行既有的文献图片与正文数据合并步骤，目前没有失败。后端、账号隔离和 PDF 功能测试都已验收完毕；这一步结束后，流程会执行新版浏览器回归并发布页面。

### Update 2

网站构建和数据校验已通过，正在执行发布前浏览器回归，目前没有失败。新版卡片与本地 PDF 两组报告出来后，就能确认正式构建中的 16/21 项结果，然后核对主域名上的实际文件。

### Update 3

正式构建中的新版结果已确认：本地 PDF 与队列 21/21、站长入口与主卡 16/16 全部通过，发布正在进行。两份报告没有意外页面异常或网络失败，并已记录 8 个实际加载文件的指纹，供上线后逐一核对。

### Update 4

正式发布和主域名核验都已通过。线上 8 个 PDF 页面、脚本、样式和字体文件与本轮浏览器验收的指纹完全一致，全部首次核验成功。我正在把最终结果和使用说明写回仓库，这一批可以收尾了。

### Update 5

网页和 API 均已上线并通过验收，使用说明与验收记录也已整理完成。现在做最后一次提交和回读核对，随后给你本批的功能与结果回执。

## Assistant final response (verbatim)

这批已完成并上线：**P1b「待电脑获取 + 卡片 PDF 状态」**。

可以从 [PDF 文献库](https://gallery.gczhouwld.com/pdf-vault/) 使用；主站每篇文献卡片也能进入对应 DOI。

## 现在可以怎样用

1. **手机先记任务。** 登录后加入“待电脑获取”。手机不支持本地目录或本地数据库时，仍能使用队列。
2. **电脑接着处理。** 同一账号在电脑上打开队列，进入出版社获取文献，再导入已下载的 PDF。
3. **保存后确认完成。** PDF 保存在选择的本地目录或浏览器存储；“标为已处理”由用户明确点击，不会被当作云端已保存或另一台设备已可读。

队列只同步 DOI、任务状态、版本和时间。不同账号相互隔离；旧手机请求不能覆盖电脑上较新的处理结果。实现细节见 [本批说明](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p1b-queue-and-cards.md)。

## 卡片按钮会显示真实状态

| 按钮 | 含义 |
|---|---|
| **本地 PDF** | 进入这篇文献的本地管理页 |
| **PDF · 本机** | 当前设备近期已实际检查过可读副本 |
| **PDF · 待检查** | 有本机记录，需要重新确认文件或权限 |
| **PDF · 待电脑** | 此账号已加入待电脑处理队列 |

“本机”检查结果有效期为 60 秒；真正打开时仍重新核对文件和权限。文件被删除、权限失效、账号切换或结果过期后，旧提示会撤下。桌面 **24 条/页**、手机 **12 条/页**继续保留，队列按当前页合并查询；首页不会读取 PDF 文件或计算内容 hash。[状态与性能说明](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p1b-queue-and-cards.md#主站卡片的实际状态)

## 验收结果

| 验证内容 | 结果 | 证据 |
|---|---:|---|
| 状态机、本地存储、队列与客户端 | **76/76** | [本地记录及同源码 CI 门禁](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/architecture/pdf-vault-p1b-20261007.json) |
| SQLite schema 与账号归属约束 | **21/21** | [P0 正式门禁](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37594651801) |
| 真实本地 PDF、阅读器与队列浏览器流程 | **21/21** | [正式 Pages 构建](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37594651811) |
| 站长入口与普通用户主卡 | **16/16** | [正式 Pages 构建](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37594651811) |
| 真实线上队列 API | **6/6** | [正式 Worker 验收](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37594670214) |
| 主域名实际文件核验 | **8/8** | [线上交付核验](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37596448810) |

主域名核验于 **北京时间 2026 年 10 月 7 日 16:50:34** 完成，8 个文件的大小和 SHA-256 全部匹配。队列验收产生的临时账号相关数据已清理，核对残留为 **0**。[完整验收记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/architecture/pdf-vault-p1b-20261007.json)

实际覆盖了跨账号隔离、手机到电脑接续、503/409、切号后的迟到响应、本地文件删除后的状态降级，以及首页零 PDF 读取。浏览器验收使用真实 IndexedDB、OPFS 和 PDF.js；Windows 系统目录权限弹窗尚未经过真人设备验收。

你的站长 PDF 入口继续使用独立的私有 PDF/R2 链路，**PDF 本体没有改存 Git**。普通用户的任务与文件也不会自动进入你的私有库。[存储边界](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/pdf-vault-p1b-queue-and-cards.md#用户流程与保存边界)

实现提交为 [d876ab8](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/d876ab867a6a88d2a0fb390a37f00b2aee84c11f)，完整验收已写入 [P1b 验收记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/architecture/pdf-vault-p1b-20261007.json)。

**这一批完成的是同账号任务接续和卡片状态。下一批是 P2：把用户的一次性 DOI 获取会话接到实际捕获流程。** 云端 PDF 同步、跨设备副本状态和 AI/MCP 仍属于后续阶段。
