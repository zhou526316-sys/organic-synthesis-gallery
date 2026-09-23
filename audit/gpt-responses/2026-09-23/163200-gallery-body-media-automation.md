# GPT response synchronization

- Beijing time: 2026-09-23 16:32
- Context: Gallery 正文图核验上架 / media-only automation
- Related publication commit: `262934dbe8b3534c0f8fff77ea1f1e8fe8d20e16`
- Related verifier commit: `1b7aa359752f3a5e44d5f44fec0b5525a32ae8b1`
- Read-only live trigger: `c190d5d20ce7e0a0e258ae00310d4690da826c2b`
- Acceptance record commit: `a78d9026b48294568c786a450ae9deb617794615`

## User-visible reply

本轮有实际新增：**14 张新抓正文图已经完成逐图核验、静态发布和当前线上复验，全部可标记为 `published_verified`；本批 `approved_waiting_deploy=0`。** 这批不是旧封存图恢复，也没有把 `staged` / `success` 或新抓取标记直接当成语义批准。

| DOI | 本轮新增正文图 |
|---|---:|
| `10.1021/jacs.6c09678` | Scheme 3，1 张 |
| `10.1021/jacs.6c13635` | Figure 3–4，2 张 |
| `10.1021/jacs.6c13760` | Figure 1–2，2 张 |
| `10.1021/jacs.6c13989` | Figure 1、2、3、5，4 张 |
| `10.1021/jacs.6c15781` | Figure 1–5，5 张 |

发布链路已经闭环：受控 R2 读取 `35833001369` → 对象/审批清单物化核验 `35834507427` → PR #158 合并为 `262934dbe8b3534c0f8fff77ea1f1e8fe8d20e16` → Pages 发布 `35835289087` 成功。之后并行 UI 的 Pages 发布 `35836549349` 也成功，并再次通过 `literature_authorization`，因此较新的线上版本仍包含本批媒体，不是只存在于旧部署产物中。

我同时把原来只验证首批正文图的线上验收器做了通用化，PR #159 只修改验收脚本并通过完整 Site Quality Gate，合并为 `1b7aa359752f3a5e44d5f44fec0b5525a32ae8b1`。随后只读线上验收 `35837208982` **SUCCESS**：重新读取并 SHA256 校验当前全部 **45 个显式批准的 body-batch 文件**，DOI + 图号 + 完整 SHA256 + `evidenceSha256` 与线上 ledger/media-index/真实文件全部一致；最新这 5 篇真实卡片均可见，图片全部成功解码，原有 TOC 均保留。`6c09678` 卡片目前显示 6 个正文图条目，是此前 5 个已批准正文图加上本轮新增 Scheme 3，并不是本轮新增了 6 张。

当前批准媒体构建状态为 `approvedItems=45`、`ledgerCount=75`、`totalPublishedFigureEntries=81`，且 `retainedDifferentFile=0`、`notInCurrentCorpus=0`。这些数字是当前媒体库存/批准账本状态，不代表已经完成全库正文图复核或每篇文章都抓齐全部图片。

待处理方面，`10.1021/jacs.6c13641` 的 4 张仍保持原有 scope-review hold，没有删除或重抓；`10.1021/jacs.6c10810` 的 3 张未进入本轮五篇上限，继续待核验。更新后的受控读取 `35836464378` 已成功且无读取错误，可供下一轮继续小批处理；其中 `10.1021/jacs.6c13517` 已不属于当前收录语料，因此即使抓取成功也会直接排除，不会获批上架。

本轮没有发现新的 cross-DOI 污染或重大连续抓取/存储故障。**没有改文献卡片、中文标题、收录范围或生产文献数据，没有发布新 userscript；隔离世代仍是 `1790082000000`，原 R2 暂存对象和真实时间保留，整库自动 promotion 仍关闭。** 完整验收记录已写入 `audit/media-acceptance/2026-09-23-162856-jacs-maint14-live.md`，提交 `a78d9026b48294568c786a450ae9deb617794615`。
