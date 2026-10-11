# WeChat mobile draft save anomaly: cloud intact; device refresh required

Beijing time: 2026-10-11 15:54:32
Chat/task: user demands "把问题解决了啊。让手机端的也同步。"
Source screenshot: Android subscription-assistant app displaying “第1篇草稿保存异常，已保留本地副本” on Oct 11 after 14:49 cloud update.
Live authenticated, strictly read-only fixed-IP WeChat draft/get: GitHub Actions run 38122783756, successful at 2026-10-11T07:51:39Z Beijing 15:51:39.
Cloud content HMAC matches last approved R5 preview exactly; cloud article count=2, images in bodies=[14,19], both thumb media IDs match server upload caches; publish_id=null, no cloud change.
Confirmed preview: https://relay.gczhouwld.com/wechat-preview/0c6a5b8965d6401973a288b4.html
Code changes: added read-only audit to ops/wechat-publisher/create-draft.py (09d0b33), separate diagnostic receipt to GH Actions (ad7b505), date-guard future request (2f1f870), ongoing protocol docs (f982817).
Incident record: audit/wechat-working/2026-10-11-mobile-draft-sync-incident.json (1ed990a1c11b65c23fac830d346baea3c390ea5f).
No remote draft updates, cloud duplications, deletions, mass sends, or destructive phone cache operations.
Cannot force refresh user device local storage through WeChat draft API; remaining step is user Android app force-stop + restart and verify; do not claim actual client sync until observed.
Sources: official Android support force-stop and cache/storage distinction.

## User-visible response, including previously streamed partial

**已经查明：微信云端草稿没有丢失，也没有被手机端的异常保存覆盖。**

我刚通过固定 IP 通道重新执行了实时、只读的微信 `draft/get`，结果如下：

| 检查项目 | 实际结果 |
|---|---|
| 云端草稿 | 正常，原 `media_id` 未变 |
| 与 14:49 成功版本比对 | 内容指纹完全一致 |
| 两篇正文图片 | 第一篇 14 个图片标签（含二维码），第二篇 19 个 |
| 两篇封面 | 均与服务器已上传素材记录一致 |
| 云端内容修改 | 本次没有修改 |
| 正式群发 | 没有 |

[查看实时核验记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38122783756)

这意味着**问题集中在手机端保留的本地副本或同步状态**。服务器端的 R5 正文、封面和链接均保持完好，因此不应该再重复创建或覆盖微信草稿。

服务器端我已完成能安全完成的修复：加入实时只读检查，确认两篇云端内容和封面均与最终 R5 相同，并避免为排查问题重复覆盖草稿。**但微信公众号 API 不能远程操作你手机上的订阅号助手本地副本，所以“手机红色保存异常提示已经消失”目前还没有实机证据，不能宣称已完全解决。**

现在请在这台安卓手机上做一次**不清除数据的重新同步**：

1. 退出“第1篇草稿”的编辑页面，**不要点击保存、覆盖、删除或发表**；如本地副本有你额外修改的文字，先保留一份。
2. 长按手机桌面的「公众号助手」图标，进入「应用信息」→「强行停止」（有些机型在「设置」→「应用管理」中）。这是结束应用进程，不是清除草稿数据。<Cite ref="turn127832search6" />
3. 重新打开公众号助手，进入草稿箱，向下刷新列表，再打开 **10 月 11 日双篇草稿**。第一篇应当是**没有绿色框、反应式放大的 R5 封面**；第二篇仍是你确认的蓝色 Nature Synthesis 概念封面。

如果手机刷新后仍提示保存异常，**先不要清除应用数据或卸载**；这些操作可能删除手机保留的本地副本。清除缓存与清除存储并不相同，后者会永久删除应用数据。<Cite ref="turn127832search0" />

你也可以直接在手机浏览器查看 [已实时确认的 R5 云端草稿预览](https://relay.gczhouwld.com/wechat-preview/0c6a5b8965d6401973a288b4.html)，但这只是查看正确云端版本，不代表手机助手的本地副本已经同步。

**现在唯一待完成的是手机端实际刷新验收。** 请按上面操作后告诉我红色提示是否消失；如果还在，把刷新后的草稿列表截图发来，我会继续排查应用本地副本，不会动已经正确的云端正文。
