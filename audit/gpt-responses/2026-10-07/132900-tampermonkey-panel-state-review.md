# Tampermonkey screenshot review — state and recovery clarity

北京时间：2026-10-07 13:29 +08:00
任务：用户提供截图并要求“看看是否还有需要改进的”。

## Scope

Read-only review. No implementation, controller action, deployment, production capture mutation, or new automation. Preserve existing approved Tampermonkey capture repair work and the pending two RSC DOI acceptance items from 110036-tampermonkey-continuation-install-acceptance.md. Newly proposed UI/behavior adjustments are recommendations, not implemented repairs. Follow PROJECT_RULES feedback verification/decision process for adoption.

## Screenshot evidence

Attachment image(20261007-052528).png was successfully read from the supplied scratch path (the initially reported missing-file error did not persist). It shows idle/waiting-start, no active DOI, remaining 163 (pending 130 / blocked 33), TOC 157 / PDF 15, visited 36/166, fully resolved 3, attempts 52, new TOC 3, new figures 4, last progress 10:56:57 / 8895 seconds ago, and PDF incorrectly stating no capture needed while no job exists.

## Current-source verification

Read exact bounded ranges of main public/toc-mainline.user.js through GitHub connector. All returned the same blob b95133e2bbdca6629d360b6f61a63648cc3db1ea.

- Lines 155–300: captureLiveSnapshot uses summary.finishedAt || summary.startedAt for last activity when no active job exists; ignores last result finishedAt. captureLiveText defaults idle PDF to no-capture-needed. State does not describe manual ownership or orphaned run markers. Error is last raw combined reason.
- Lines 3880–4040: manualRunBlocksAutomatic returns Boolean(persisted MANUAL_RUN_KEY); forceStartFromHead revokes the old generation and recreates run.summary.
- Lines 4355–4445: requestControllerStart calls forceStartFromHead when manual marker exists; controllerRun exits immediately when manualRunBlocksAutomatic is true.
- Same-revision refresh orphaning is a supported risk path, not established as the cause of this screenshot. Do not infer another browser is live or take over a lease from these observations.

## Isolated reproduction, not user-machine runtime state

Executed current fetched snapshot/render functions with mocked GM storage: summary.phase running, no active job, startedAt 2026-10-07T02:56:57Z, results[-1].finishedAt 2026-10-07T05:04:58.787Z, now 2026-10-07T05:25:12Z, screenshot counters.

Observed: rendered state waiting-start; PDF no-capture-needed; last time still start 02:56:57Z; rendered age exactly 8895 seconds; actual last result age 1213 seconds; no stale notice. This reproduces two display defects without mutating the user's session.

## Compact live receipt evidence

GET https://api.gczhouwld.com/api/media/tampermonkey-reports?limit=3, fetched with 15-second single-URL cap through the established read-only fallback. Index updatedAt 1791350722907. The per-job finishedAt values, not later repeated uploads, indicate actual observed capture completion. Do not interpret 13:25 report delivery as proof capture was progressing then.

```json
[
  {
    "doi": "10.1021/acs.joc.6c01847",
    "status": "failed",
    "final": true,
    "jobId": "b059f7a9-8567-4c4e-9317-97fb1d5470f6",
    "tocStatus": "not_found",
    "figuresDiscovered": 4,
    "figuresStored": 2,
    "evidenceLevel": "partial",
    "privatePdfStatus": "already_stored",
    "privatePdfBytes": 2172286,
    "updatedAt": 1791350722907,
    "attempts": [
      {
        "jobId": "b059f7a9-8567-4c4e-9317-97fb1d5470f6",
        "startedAt": "2026-10-07T05:04:34.384Z",
        "finishedAt": "2026-10-07T05:04:58.787Z",
        "updatedAt": 1791350722907,
        "status": "failed"
      },
      {
        "jobId": "b059f7a9-8567-4c4e-9317-97fb1d5470f6",
        "startedAt": "2026-10-07T05:04:34.384Z",
        "finishedAt": "2026-10-07T05:04:58.787Z",
        "updatedAt": 1791350717444,
        "status": "failed"
      }
    ]
  },
  {
    "doi": "10.1016/j.chempr.2026.103282",
    "status": "failed",
    "final": true,
    "jobId": "88c938a8-5ff7-465b-a293-e048dfdd3d8e",
    "tocStatus": "",
    "figuresDiscovered": 0,
    "figuresStored": 0,
    "evidenceLevel": "",
    "privatePdfStatus": "",
    "privatePdfBytes": 0,
    "updatedAt": 1791349530081,
    "attempts": [
      {
        "jobId": "88c938a8-5ff7-465b-a293-e048dfdd3d8e",
        "startedAt": "2026-10-07T04:48:25.362Z",
        "finishedAt": "2026-10-07T04:57:23.806Z",
        "updatedAt": 1791349530081,
        "status": "failed"
      },
      {
        "jobId": "88c938a8-5ff7-465b-a293-e048dfdd3d8e",
        "startedAt": "2026-10-07T04:48:25.362Z",
        "finishedAt": "2026-10-07T04:57:23.806Z",
        "updatedAt": 1791349402434,
        "status": "failed"
      }
    ]
  },
  {
    "doi": "10.1126/sciadv.aej5227",
    "status": "failed",
    "final": true,
    "jobId": "70a40519-1cb5-49e8-b77f-df66133af8a1",
    "tocStatus": "not_found",
    "figuresDiscovered": 5,
    "figuresStored": 5,
    "evidenceLevel": "",
    "privatePdfStatus": "already_stored",
    "privatePdfBytes": 2087551,
    "updatedAt": 1791348630492,
    "attempts": [
      {
        "jobId": "70a40519-1cb5-49e8-b77f-df66133af8a1",
        "startedAt": "2026-10-07T04:33:58.499Z",
        "finishedAt": "2026-10-07T04:34:11.811Z",
        "updatedAt": 1791348630492,
        "status": "failed"
      },
      {
        "jobId": "7efccc3a-a251-4e41-a482-2c044755fa5f",
        "startedAt": "2026-10-07T04:30:35.329Z",
        "finishedAt": "2026-10-07T04:30:49.805Z",
        "updatedAt": 1791348390407,
        "status": "failed"
      }
    ]
  }
]
```

## Next bounded work

Prioritize truthful last-progress clock and no-job PDF state. For recovery, obtain a non-secret local controller/manual-run/lease snapshot; respect valid other owners and user Pause. Recover only justified existing gaps and preserve body/fulltext companion-acquisition semantics. Do not automatically fall back to all-corpus acquisition or restart healthy runs.

## User-visible reply

**有，优先要改的是“状态是否可信”和“中断后怎样继续”。** 截图已经成功读到，我也核对了当前正式源码，并做了隔离复现。现在能确认两个显示缺陷，另有一个需要重点处理的恢复风险。

## 1. “最后进展 8895 秒前”会误导，应该先修

当前逻辑在没有正在执行的任务时，会把“最后进展”取成本轮的结束时间，或者本轮的**开始时间**，没有优先取最近一篇的完成时间。

我用截图中的 10:56:57 作为本轮开始时间，同时放入一条 13:04 完成的结果，面板仍然显示 **8895 秒前**，与截图一致。因此，**这行数字不能证明采集器已经停了两个多小时。** [当前面板源码](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/public/toc-mainline.user.js)

建议分开显示：

| 项目 | 应表达什么 |
|---|---|
| 本轮开始 | 这一轮什么时候启动 |
| 最近采集进展 | 最近一次下载、上传或任务完成的时间 |
| 控制器状态 | 正在运行、其他窗口运行、等待恢复或已暂停 |

时间用“20 分钟前”“2 小时 28 分钟前”会比一大串秒数直观。

## 2. 剩余 130 篇待执行，却显示“等待启动”，解释不够

这个面板只读取本浏览器脚本保存的状态，没有展示当前由哪个控制页负责执行。服务器回执中还有 **12:34、13:04 完成的任务**；而最新上传时间到达 13:25，部分是同一个任务的重复回执。因此，需要区分**实际采集时间、回执上传时间、本窗口状态**，不能混成一个“最后进展”。[本次读取的近期回执](https://api.gczhouwld.com/api/media/tampermonkey-reports?limit=3)

源码还存在一个恢复风险：手动运行标记会保留，但执行过程保存在页面内存中；页面刷新后，可能留下旧标记，让自动调度直接退出。**这可以解释“旧累计还在、没有当前任务、状态等待启动”的情形，但是否就是你这次的原因，还需要本机控制器状态来确认。**

建议把状态明确区分为：

- **另一控制窗口正在运行**：展示当前 DOI。
- **等待重试**：展示原因和下次重试时间。
- **上次任务已中断**：提供“恢复剩余待办”。
- **用户已暂停**：保留暂停状态。

恢复前应先确认其他窗口是否仍在执行，再接手剩余任务。现在的“立即开始任务”实际会重新建立缺项队列、重置本轮计数；最好把“继续剩余任务”和“重新扫描缺项”分成两个清楚的操作。[控制器与启动逻辑](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/public/toc-mainline.user.js)

## 3. 没有当前任务时，PDF 不该显示“本篇无需抓取”

这一点已经在当前代码中复现。截图上方写着“当前没有任务页”，下面却写“本篇无需抓取”，容易让人以为 PDF 已经不缺了。

建议按实际状态显示：

| 实际情况 | 建议文案 |
|---|---|
| 当前没有任务 | 等待下一篇 |
| 本篇 PDF 已有有效存储回执 | 已保存，可复用 |
| 本篇需要 PDF，但还没开始 | 待抓取 |
| 下载或存储失败 | 未完成，并说明原因 |

全队列“还缺 PDF 15 篇”单独保留，这样本篇状态与总体库存就不会混淆。

## 4. “最近问题”应说明哪一层失败，并保留已成功的成果

截图中的 `combined_capture;toc=not_found;figures=…` 太难读，也容易让人理解成整篇全部失败。

实际回执就有这样的例子：`10.1126/sciadv.aej5227` 的 **正文图 5/5 已保存、PDF 已有存储回执，但 TOC 未找到**，总状态仍然是 `failed`。面板更适合显示：

> 最近处理：该篇 TOC 未找到；正文图 5/5 已保存；PDF 已保存。

再附上 DOI、时间和可展开的技术详情。这样你能看清已有成果，也能知道下一次具体要补什么。[该篇回执](https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1126%2Fsciadv.aej5227)

“受阻 33 篇”也应该按原因展开，例如页面验证、访问被拒、图片源无效、任务超时；目前不能把这 33 篇一概解释成学校权限不足。

## 5. 计数基本对得上，主要应改名称和说明

这张图里的数字没有明显矛盾：

- **166 − 3 = 163**：本轮队列减去已补齐的篇数。
- **130 + 33 = 163**：待执行与受阻合计。
- **52 次尝试超过 36 篇已遍历**：同一篇可能有续抓或重试。
- **TOC 157、PDF 15 不能直接相加**：同一篇可能两项都缺。

但“确认补齐 3 篇”容易被理解为 TOC、正文图、全文、PDF 全部齐全。当前它主要表达的是**本轮排队的 TOC/PDF 缺项已清除**，正文图和全文是访问时附带抓取的部分。建议把这个口径直接写清楚，同时区分“已采集保存”和“已在网页展示”。

**下一批建议先处理第 1、3 项显示缺陷，并补上第 2 项的中断原因识别；随后再处理恢复剩余任务和受阻原因展示。** 这样每批都有明确的验收点，也符合你要求的防超时规则。
