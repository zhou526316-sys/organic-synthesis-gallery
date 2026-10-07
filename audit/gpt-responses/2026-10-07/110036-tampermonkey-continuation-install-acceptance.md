# Tampermonkey continuation — bounded acceptance checkpoint

北京时间：2026-10-07 11:00 +08:00
上下文：用户要求接续 Tampermonkey，并再次强调避免过长任务和连接超时。

## Scope and execution

Read-only acceptance of latest installed capture revision, queue activity, and two outstanding RSC DOI receipts. No capture controller restart, code change, deployment, publication, or production data mutation was performed. The response log is the only repository write.

Timeout preflight: reuse existing checkout for bounded reads; do not clone full repository or download CI logs; query narrow per-DOI receipts with per-URL timeout 15 seconds. Public web reader could not access the API and direct HTTP hit a proxy connect timeout after 5 seconds; TinyFish JSON fetch was used only as a read-only fallback. The manual local-diagnostics endpoint returned a stale manual upload from 2026-10-06 05:23 UTC and was excluded from current-state acceptance. Latest per-DOI auto reports were used instead. The raw diagnostic endpoint unexpectedly contained a large retained trace bundle; avoid using it on continuation, and prefer per-DOI reports or compact summaries.

## Verified compact evidence

```json
{
  "mainObserved": "0ed01a84100ecd40ffd2ce2d93e2bd5507fadc1b",
  "lastReleaseCommit": "4f55e7d70a22ff2bc1f2a580e15ff42ec98f7196",
  "acceptance": [
    {
      "doi": "10.1021/acscatal.6c06481",
      "finishedAt": "2026-10-07T02:55:03.783Z",
      "updatedAt": 1791341730283,
      "status": "success",
      "tocStatus": "stored",
      "figuresDiscovered": 6,
      "figuresStored": 6,
      "evidenceLevel": "complete",
      "privatePdfStatus": "stored",
      "privatePdfBytes": 4625336,
      "installRevision": "6.2.40",
      "publisherMediaRevision": "20261007-rsc-search-fallback-v14"
    },
    {
      "doi": "10.1039/d6sc06421c",
      "finishedAt": "2026-10-06T15:43:59.804Z",
      "updatedAt": 1791301771798,
      "status": "partial",
      "tocStatus": "already_available",
      "figuresDiscovered": 0,
      "figuresStored": 0,
      "evidenceLevel": "partial",
      "privatePdfStatus": "failed",
      "privatePdfBytes": 0,
      "installRevision": "6.2.37",
      "publisherMediaRevision": "20261006-rsc-preview-reject-v12"
    },
    {
      "doi": "10.1039/d6gc03161g",
      "finishedAt": "2026-10-07T01:34:33.811Z",
      "updatedAt": 1791336976998,
      "status": "failed",
      "tocStatus": "not_found",
      "figuresDiscovered": 0,
      "figuresStored": 0,
      "evidenceLevel": "partial",
      "privatePdfStatus": "failed",
      "privatePdfBytes": 0,
      "installRevision": "6.2.38",
      "publisherMediaRevision": "20261007-rsc-issue-pdf-v13"
    }
  ]
}
```

## Sources

- Current main source header: public/toc-mainline.user.js, blob b95133e2bbdca6629d360b6f61a63648cc3db1ea; @version and INSTALL_REVISION 6.2.40, capture protocol VERSION 6.2.20, publisher revision 20261007-rsc-search-fallback-v14.
- Release fix: 4f55e7d70a22ff2bc1f2a580e15ff42ec98f7196; audit/gpt-responses/2026-10-07/103600-manual-abort-controller-stall-fix.md.
- GET https://api.gczhouwld.com/api/media/tampermonkey-reports?limit=4
- GET https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1021%2Facscatal.6c06481
- GET https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1039%2Fd6sc06421c
- GET https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1039%2Fd6gc03161g

## Next bounded batch

Continue only the two RSC DOI acceptance paths. Reuse per-DOI latest reports; do not infer installation version from captureVersion and do not infer private PDF completion from discovered links or a combined success flag. If neither RSC has a v14 receipt, inspect its existing queue eligibility and dispatch position before changing code or asking the user for any action. The newer ACS receipt proves at least one active publisher capture used install 6.2.40, not that all browsers or pre-existing tabs have upgraded. Do not mark either RSC resolved based on these stale reports.

## User-visible reply

已接续，**这一批已确认新版正在实际工作，队列也在继续推进；两篇 RSC 文献仍需新版重抓验收。**

### 本批已核实的结果

服务器收到的 **10 月 7 日 10:55（北京时间）**采集回执，明确记录了：

- **安装版：6.2.40**
- **RSC 抓取逻辑：v14**
- 文献 `10.1021/acscatal.6c06481`：TOC 已存入、正文图 **6/6**、文本完整度为 `complete`、PDF 已存入，大小约 **4.63 MB**。

这证明新版已经实际执行并产生结果。这里确认的是采集入库情况，正文图在网页上的展示仍属于另一层验收。[查看该篇采集回执](https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1021%2Facscatal.6c06481)

另外，回执中的 `captureVersion=6.2.20` 是保留兼容性的协议号；判断实际安装版本要看 `installRevision`，不能据此误判为没有更新。

### 两篇 RSC 还没有验收通过

| 文献 | 本次读到的最近回执 | 当前判断 |
|---|---|---|
| `10.1039/d6sc06421c` | 10 月 6 日 23:43，安装版 6.2.37；正文图 0，PDF 返回 403 | 尚未读到新版重抓回执 |
| `10.1039/d6gc03161g` | 10 月 7 日 09:34，安装版 6.2.38；TOC 未找到、正文图 0，PDF 返回 403 | 尚未读到新版重抓回执 |

因此，这两篇暂时不能标记为“已修好”，也不能用旧版失败记录判断 v14 的效果。[Chemical Science 回执](https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1039%2Fd6sc06421c) · [Green Chemistry 回执](https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1039%2Fd6gc03161g)

### 防超时规则继续执行

已核对仓库中的规则：**长步骤先评估风险，每批完成一个可验收节点，远程调用限时、日志按需读取，完成后保存进度。** 本批到新版运行验收为止，下一批从两篇 RSC 的新版重抓结果继续，核对正确 TOC、正文图、完整文本和 PDF 的实际入库状态。

正式更新入口仍是：[Gallery VPN Bridge 更新链接](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js)。这次已经看到 6.2.40 的工作回执，无需为这项验收重复安装。
