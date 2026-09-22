# UI / feedback continuation — static/API request separation

Beijing time: 2026-09-23T00:02:06+08:00
User request: 继续
Context: continuation of feedback 28 deployment acceptance; feedback 29/30 remain queued. Main is the baseline. Current observed src/user-shell.ts blob 55fb3883df484cf9dd642a13cf617968e45dd927 contains the blob protocol fix but still rewrites all HTTP(S) paths at API origins.
Feature branch: fix/ui-api-path-routing-20260923 (created from current main).
No publication dataset, publication slot, Tampermonkey/Bridge capture, media repair gate or production reader-count write is in scope.

## User-visible progress

这批先处理线上静态文件被误转到 API 域名的问题，再复测原图和 GIF。摘要窗口放大、可选光效仍在队列中，抓图链路不动。

最新代码仍只按域名识别 API 请求，静态文献文件也会被改写。这批把范围收紧到 `/api/`，并保留原有 API 回退和本地图片读取。

## Execution boundary

No code changes yet. Restrict fallback eligibility to exact /api or /api/ descendants, keeping non-API static/media URLs on their explicitly requested origin. Add isolated routing regressions and retain all existing image assertions. Review, CI and live acceptance are distinct stages; no feedback closure solely on merge.
