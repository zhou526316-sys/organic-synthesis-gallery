# Tampermonkey 当前停滞排查

北京时间：2026-10-07 14:36:04

任务：用户 14:32:38 反馈更新后又像卡住；本轮限定只读排查，等待当前本地快照。

## 现场依据

```json
{
  "readOnly": true,
  "productionWrites": 0,
  "publisherRequests": 0,
  "installerObserved": "6.2.42",
  "bridgeVersion": "2.2.61",
  "latestReadReport": {
    "doi": "10.1038/s41467-026-78282-6",
    "jobId": "74ae16f9-21a3-499d-b275-fdafc61ef5bd",
    "startedAt": "2026-10-07T06:22:41.311Z",
    "finishedAt": "2026-10-07T06:23:13.821Z",
    "receivedAt": "2026-10-07T06:33:27.455Z",
    "status": "failed",
    "reason": "combined_capture;toc=not_found;figures=0/0;evidence=failed;published=0",
    "privatePdfStatus": "already_stored",
    "sourceUrl": "https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1038%2Fs41467-026-78282-6"
  },
  "localSnapshotUploadedAt": "2026-10-06T05:23:33.983Z",
  "limitation": "Automatic receipt upload time differs from task event time. Current controller and heartbeat live in user GM storage; latest manual snapshot predates this incident. Await fresh user diagnostic upload.",
  "codeReviewNotes": "Read-only review found awaiting inventory can take minutes, and an await resolvePublisherTaskUrl post-await run fence is missing. Neither is established as this incident root cause. No source changes or deployments made."
}
```

## 回复正文

我查到新版已经运行，但**还不能确认现在仍在推进**。刚读到的任务在 **14:23:13** 已结束：全文读取超时，TOC 和正文图未抓到；它到 **14:33:27** 才上传回执，所以这个上传时间不能证明采集还在继续。[查看回执](https://api.gczhouwld.com/api/media/tampermonkey-reports?doi=10.1038%2Fs41467-026-78282-6)

服务器保存的本地运行状态快照仍是昨天的。请在**当前 Gallery 页面点油猴图标 →「上传本地 TOC 日志」一次**，看到上传成功后回我“点好了”。我会据此核对当前任务、心跳和控制页占用，定位这次停在哪里。
