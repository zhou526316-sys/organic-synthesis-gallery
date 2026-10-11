# Read-only diagnosis · WeChat Official Account mobile "第1篇草稿保存异常，已保留本地副本"

Beijing time: 2026-10-11 15:32:27 (Asia/Shanghai)
Context: screenshot supplied by user; appears to show the first article of the Oct 11 two-paper WeChat draft with a client-side local-copy save warning and old green promotional rectangle still in its thumbnail.

### Evidence verified
- Screenshot time about 15:27 Beijing; draft item updated at 14:49 Beijing; client warning says '第1篇草稿保存异常，已保留本地副本'.
- Latest successful WeChat publisher GitHub Actions run 38119295417 at 2026-10-11T06:49Z = 14:49 Beijing.
- Latest production receipt stored under audit/wechat-publisher/latest.json: stage=draft_update, draft_readback=ok, media_id same, publish_id=null, relay preview 0c6a5b8965d6401973a288b4.html.
- No later WeChat Draft Publisher run among latest 60 GH Actions checked; no running WeChat Publisher/Import observed.
- Earlier read-only report audit/wechat-working/2026-10-07-mobile-draft-mismatch-diagnosis.json likewise documented server-updated/old-mobile-display as an unverified client-cache hypothesis.
- The server source cover has no green box, but screenshot thumbnail seems to show old green text/rectangle, compatible with client/local thumbnail stale state, not conclusive.
- Current live authenticated draft/get as of 15:27 was not called (fixed-IP relay offers only an authenticated writer endpoint and public health; do not mutate cloud draft to diagnose).
- ROOT CAUSE NOT VERIFIED. Possible local save/sync/network/old editing state/last-write-wins conflict, not a proven server draft failure.
- No production edits, draft writes, publish actions, media replacements, or state mutations this turn. Follow project feedback approval gate: provide verified observations and allow user to approve any changes.

### Complete user-visible response, including partial updates

从截图看，微信提示的是：“第1篇草稿保存异常，已保留本地副本。”这说明微信客户端在保存或同步第一篇文章时发生了异常，但不等于通过微信公众号 API 更新草稿的操作一定失败。

需要区分两个状态：
- 微信后台草稿：通过固定 IP API 执行 draft/update，此前返回成功，并通过 draft/get 回读。
- 手机端草稿：微信客户端显示保存异常，并提示已经保留本地副本。这可能涉及客户端同步、版本冲突或草稿内容校验，目前不能直接确定是哪一种。

先不要删除这份草稿、覆盖本地副本，也不要点击“发表”。核对 10 月 11 日最新 API 写入记录与草稿状态。

## 核查结果

**服务器端最后一次草稿更新及回读成功。**
- 北京时间 14:49:31，微信 API 更新成功。
- 返回状态为 draft_update，随后 draft/get=ok。
- 仍使用原来的双篇草稿 ID，没有重新创建草稿。
- publish_id=null，没有群发。

生产执行记录：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38119295417

截图中第一篇右侧的小封面似乎仍显示旧版绿色说明框，但 R5 已经删除该框并换成放大的纯反应式。这进一步提示手机端可能保留了旧缩略图或旧编辑状态。

当前最值得怀疑的是手机端保存状态与 API 更新后的草稿内容没有完全同步，而不是已经证实服务器保存失败。14:49 的成功回读证明当时服务器端正确，不代表 15:27 之后手机端没有再发生变化。

## 处理建议（先无损排查）

**先不要重新通过 API 连续覆盖同一份草稿。** 14:46 和 14:49 曾连续更新；如果手机客户端也处于编辑/同步过程，存在版本竞争的可能，但目前缺乏微信客户端错误码，不能确定。

请在电脑登录 [微信公众号后台](https://mp.weixin.qq.com/)，进入“草稿箱”，只查看 10 月 11 日的双篇草稿，确认第一篇封面是否已经是**没有绿色说明框、反应式放大的 R5 版**，并查看两篇是否完整。可对照 [服务器此前已成功回读的 R5 预览](https://relay.gczhouwld.com/wechat-preview/0c6a5b8965d6401973a288b4.html)。

- **电脑后台是 R5 新版**：优先视为手机客户端缓存/本地同步问题。保留本地副本，退出手机编辑状态后重新打开/刷新草稿列表；不要清除 App 数据、重装或点“保存覆盖”。
- **电脑后台也显示旧版或缺图**：需要再进行一次受控的、只读实时 draft/get 与平台返回码核对，然后根据结果修复；不能仅凭前一次成功回执继续假定云端状态正确。

这次只是核查，没有重传、覆盖或群发。**电脑端当前显示的是新封面，还是仍有绿色说明框的旧封面？**
