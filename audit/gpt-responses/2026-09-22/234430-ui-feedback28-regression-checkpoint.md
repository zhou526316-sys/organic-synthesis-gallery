# Feedback 28A — original-image routing regression checkpoint

Beijing time: 2026-09-22T23:44:30+08:00.
Context: UI and site-feedback continuation, current user request 继续. Prior checkpoints: 232633-ui-feedback28-release-checkpoint.md and 233650-ui-feedback28-live-root-cause.md.

PR #131 is merged at 004779910a2ff384dd0224201bb48a8d61442a48. PR #132 is still awaiting the final Site quality gate at this checkpoint; no success or production acceptance is asserted for that pending step.

## New verified evidence
- PR #132 current head abfa3ad29050ca7dc898cc4447377556412f04dc.
- Fetched complete PR patch: src/user-shell.ts has only the HTTP(S)-protocol guard plus two comments; tests/status-image-errors.spec.ts adds a no-network/byte-exact blob regression; tests/status-image-fixtures.ts corrects synthetic CORS/preflight handling. No capture, Bridge, literature or backend data changes.
- Initial PR original-image test 35748385095 passed 5 and failed 2; the two GIF tests reached the last pageErrors assertion and failed on a synthetic reader-counts CORS response. That assertion remains unchanged. No real service failure was filtered away.
- Fixture correction commit abfa3ad supplies explicit origin/headers/credentials and empty OPTIONS 204. It still intercepts all external traffic. Current original-image run 35749048945 succeeded with seven tests; data validation 35749048903 and migration CI 35749048931 also succeeded.
- Site quality gate 35749048911 was still in progress at the latest read; merging remains blocked until success.

## User-visible progress
本地原图请求的新增回归测试已通过；完整套件还暴露了模拟接口的跨域响应问题。我已补齐测试响应，保留全部错误检查，正在重新跑正式质量检查。

原图专项的 7 项测试现已全部通过，包括 GIF 动画、30MB 原图校验和本地地址不被改写。剩下的是原有界面回归检查，之后进行修复版线上复测。
