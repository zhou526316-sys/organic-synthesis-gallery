# Tampermonkey PDF upload investigation and release

Beijing time: 2026-10-07 16:33:42 +08:00

Context: User authorized “找找失败原因再改” at 2026-10-07 16:13:19 +08:00. Bounded source analysis, no-credential route probe, deterministic regressions, release and exact installer verification. This answer does not claim the initial user-network upload failure is fully explained.

Related commits:
- Production repair: 703526ae312b07b2a65fbe16872b46fe64875e19
- Report fixture repair: 19d2d329a01032239f6cf276efe113375b1cf257
- Live verification evidence: 59406e0c49f911bce8a73d26b11b5df1992530e8
- Completed handoff: 762ab67ed9bb1704f4b791714ccb0398d2a3d2bf

Validation:
- Small regression 37593528774 passed; final regression with report fixture 37594305467 passed.
- Live exact API/Worker installer probe 37594126667 passed, SHA-256 201203a5715d19c80fd90c1ac091b8f27a4455f27bffaaa1bec69c054246ff2b.
- Overall Worker workflow 37593654216 failed in a separate P1b synthetic-account queue verification after successful asset deployment. That gate's cleanup remains unverified and is recorded in the handoff; no claim of all-workflow success.
- Canonical Gallery URL was still 2.2.62 at the16:29 probe; user-facing link is the independently verified API URL.

## Full reply

已修复查实的 **上传失败后重复下载、重试等待叠加，以及并发入库误删 PDF** 问题，并完成上线核验。[核验记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/762ab67ed9bb1704f4b791714ccb0398d2a3d2bf/audit/tampermonkey/2026-10-07-pdf-upload-fix-handoff.json)

### [更新链接（VPN Bridge 2.2.63）](https://api.gczhouwld.com/gallery-vpn-bridge.user.js)

更新后刷新 Gallery 一次。

你本机**首次上传为什么超时，目前还不能唯一确定**；新版已补齐每段上传的耗时与失败日志，便于继续定位。
