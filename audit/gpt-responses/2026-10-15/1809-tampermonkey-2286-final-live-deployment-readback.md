# Tampermonkey 2.2.86 / 6.2.67 正式双域名部署验收

Date: 2026-10-15; user request: "继续。弄好后给出更新链接". This is a retrospective, read-only verification and public response sync, not a new publisher visit or a private PDF write.

## Production deployment evidence

- [PR #684](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684) merged as `2b4b1108fd306a037e24d9f366e104d3f88dea5e`, after 27/27 workflow regression success.
- [GitHub Pages deploy #38709818908](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38709818908): `literature_authorization`, `build`, and `deploy` all `success`. Included checks: public DOI inventory, media integrity, Hot/Archive responsive Playwright, both canonical and Pages live origins.
- [Worker deploy #38709818817](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38709818817): `deploy` success, including Worker backend contracts and live verification.
- [Tampermonkey Oct-1 live acceptance #38713381456](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38713381456): `success` at 2026-10-15 09:30Z. `LIVE_ACCEPTANCE.passed=true`, 0 publisher requests and 0 media writes, both installer GET=200; `expectedVersion=2.2.86`, `expectedInstall=6.2.67`, `expectedController=2.2.41`; queue HTTP200, 1151 DOI entries and 33 latest, capabilities HTTP200, CCS preflight 204.
- [Night/installer live verification #38713381432](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38713381432): `success`; `NIGHT_LIVE_ACCEPTANCE.passed=true` and direct installer byte verification, correct Bridge `2.2.86`, embedded engine `6.2.67`, protocol `6.2.20`, controller `2.2.41`, private inventory rejects anonymous callers, `realUserBrowserOvernightVerified=false`.
- Also directly fetched the *actual public text* from both URLs using a read-only web reader. Both show script header `@version 2.2.86`, and embedded tokens `INSTALL_REVISION = '6.2.67'`, protocol 6.2.20, controller 2.2.41. They are not just files in a branch.

## Current production installation URLs

1. Primary: https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js
2. Alternate: https://api.gczhouwld.com/gallery-vpn-bridge.user.js

Install **one** URL in existing Tampermonkey, accept update of the existing VPN Bridge script, then refresh the Gallery controller page. Avoid two copies of the same runtime and preserve local caches/PDF receipts. The script provides the full engine; don't require nonexistent standalone `gallery-toc-mainline.user.js` path.

## Code & retained media readback

- Production `main` code `cloudflare/worker/src/stage-storage.js` contains bounded 32 MiB stage-index reader with distinct invalid JSON/schema errors and no index purge. Originally R2 index 6,004,600 bytes / 6,000,531 characters, 3798 records, valid JSON, incorrectly tripped old 6 million-character guard.
- Production `public/toc-mainline.user.js` contains `publisher_script_missing_3_consecutive`, foreground recovery after missing heartbeat, and `localReplayReady:pdfBytesRetained` for owner-only PDF upload recovery.
- Post-deploy read-only scoped Worker GET `/api/article-figures/staged?inventory=1&dois=10.1021/acs.joc.6c01740,10.1021/acs.joc.6c01777` returned HTTP200, `complete:true`, `count:2`, and existing staged figure inventory intact for the two DOI. No media writes.

## Scope & remaining acceptance boundary

Official binaries/deployment are **verified**, but the owner must actually update their local Tampermonkey extension and run the installed version to establish real browser capture. The R2 owner-upload diagnostic last checked in this conversation was engine 6.2.66, and the night report explicitly `realUserBrowserOvernightVerified:false`. **Do not claim all historical missing TOCs, body figures, full texts or owner PDFs now repaired.** A new user-side 6.2.67 log is required for a per-DOI live recovery count. No new 18:00 publication, PDF deletion, auth bypass or automatic publisher jobs were performed by this verification.

## User-visible completion summary

已完成且核实生产部署：Pages 和 Worker GitHub Actions 均成功；双域名实际安装包均为 VPN Bridge 2.2.86 / 内嵌引擎 6.2.67；成功通过只读线上回归，后端旧暂存索引可按 DOI 查询。用户可直接通过上述主入口更新 Tampermonkey。下一步属于用户浏览器实际运行/上传新日志的验收，而非安装包未发布。
