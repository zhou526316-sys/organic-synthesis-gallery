# Response synchronization

北京时间：2026-10-07 09:18 +08:00
上下文：PR #384 因 main 并发更新而 diverged；其 private-PDF / Cloudflare 相关 CI 已通过，且 main 并发提交未触及本修复的两个文件。

## Applied fix

- cloudflare/worker/src/private-pdf.js
  - RSC private PDF trusted host 增加 rscj.silverchair-cdn.com。
- cloudflare/worker/scripts/test-private-pdf-capture.mjs
  - 增加 RSC Silverchair CDN PDF 来源回归，并隔离测试夹具状态。

PR #384 已验证：
- Private PDF capture v2 regression: success
- Private PDF access v1 regression: success
- Cloudflare migration CI: success
- Worker dry-run: success

该修复以两个已验证 blob 原子移植到最新 main，使用 expected-SHA 防并发覆盖。
