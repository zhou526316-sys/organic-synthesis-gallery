# 2026-10-12 17:01:28 Asia/Shanghai — Tampermonkey approved PR #552 continuation, production deployment and live readback

Chat/workline: user said “连接中断请继续” while the approved Nature/RSC/DOI-scoped metadata optimization was being implemented in PR #552 of Organic Synthesis Gallery. Continued exactly the prior branch and verified that the final queue and missing-only tests had already been repaired and committed. No deletion of owner's Tampermonkey data or private PDF bytes, and no direct publisher scrape in this chat.

## User-visible result and PR
- [PR #552](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/552) on the already-authorized `fix/tm-scoped-inventory-nature-rsc-20261012` branch had **29/29 CI workflows success** at exact head `54fee27c1043ba8dd5fc3a798159a57b52bbcf4e`.
- This includes DOI-scoped capture inventory provenance tests, complete/stale unknown inventory truth, Nature issue-link checking, RSC unique-DOI graphical-abstract provenance, historical TOC-only, PDF capture authorization, browser interaction, and other required project checks.
- Squash-merged PR #552 to `main`, commit [58c9d00e10db221816fbfcadfb89156d8193573e](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/58c9d00e10db221816fbfcadfb89156d8193573e).
- New officially deployed installer: VPN Bridge **2.2.84**, integrated TOC engine/INSTALL_REVISION **6.2.65**, controller **2.2.41**, capture wire protocol remains **6.2.20**.

## Live production deployment
- Cloudflare Worker production deploy [#38225662669](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38225662669): **success**.
- GitHub Pages production deploy [#38225662869](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38225662869): **success**, after production build's media merge, desktop/mobile Hot Archive tests, owner PDF account isolation and local PDF persistence.
- Early Oct1 live acceptance [#38225662731](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38225662731) failed only because it polled while both URLs still returned OLD Bridge 2.2.83 and old INSTALL_REVISION. This is a predeploy timing observation, not postdeploy regression.
- Postdeploy runs at **2026-10-12 16:59 Beijing** all **success**:
  - [Dual domain installer readback #38226973568](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38226973568), job #114736772132: both gallery and API URLs HTTP 200, Bridge `2.2.84`, integrated `6.2.65`, matching **485,872-character** JS payloads, historical TOC-only guard present, same owner-private PDF rules; anonymous owner inventory denial verified.
  - [Verify current Tampermonkey live #38226973546](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38226973546): same version readback successful.
  - [Tampermonkey October 1 live acceptance #38226973376](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38226973376): site and API installer 2.2.84/6.2.65, cap controller 2.2.41, queue and CCS preflight all passed (read-only).
  - [Verify night capture release live #38226973479](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38226973479): success.
- Official single-script update entrypoint https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js ; backup https://api.gczhouwld.com/gallery-vpn-bridge.user.js. Install/update ONE existing script only; never clear local checkpoint data or duplicate installer.

## Independent live API read-only smoke
Used the existing connected fetch tool to read the already deployed public API after Worker success without any write or publisher visit:
- `GET https://api.gczhouwld.com/api/media/local-capture-index?dois=10.1039%2Fd6sc06407h`: HTTP success, `scopeRevision=doi-scoped-inventory-v1`, `scopeRequestedCount=1`, `complete=true`, count 0 for this particular DOI. A complete zero here is NOT proof that a PDF or a production card is missing; this is only the scoped local TOC index.
- `GET https://api.gczhouwld.com/api/article-figures/staged?inventory=1&dois=10.1039%2Fd6sc06407h`: `scopeRevision=doi-scoped-inventory-v1`, `complete=true`, count 0, expected DOI echoed.
- Positive-fixture `GET https://api.gczhouwld.com/api/media/local-capture-index?dois=10.1016%2Fj.chempr.2026.103008` returned exactly 1 indexed TOC row for Chem DOI, no foreign paper data, complete true, 3213 ms tool latency.
- Positive-fixture `GET https://api.gczhouwld.com/api/article-figures/staged?inventory=1&dois=10.1021%2Facs.joc.6c02017` returned one DOI-specific aggregated staged-figure entry, complete true, 3768 ms.
- Empty case ~2531 ms. These small read-only tests confirm scoped API correctness and bounded payloads for the examples only. They do not prove overall 964-DOI browser inventory speed or the completeness of TOCs.
- One testing-tool request had incorrectly URL-encoded the separator `&` as `%26`, unintentionally returning the legacy unscoped stage index. It was immediately corrected and a properly scoped exact-DOI response independently verified. Do not use that false unscoped result for conclusions.

## Implementation scope (prior explicit approval)
1. Media TOC/figure stage index API accepts at most 80 explicit validated DOI records and emits scope echo + completeness. Controller requests small batches instead of whole indexes first, carries verified receipts but treats partial/failed reads as unknown. Owner PDF batch size adjusted to 12; evidence pages 120. No inflated 16s deadline.
2. RSC issue cards and authenticated ArticleId AJAX require exact DOI article-card provenance and official graphical-abstract semantics; never allow unrelated images, foreign DOI, PDF page thumbnails, or arbitrary CDN paths. Preserves a bounded RSC/Chem diagnostics sample through a longer Nature pass.
3. Historical Nature `toc_only` attempts only publisher article-linked official issue source, records honest not-found/verification status, and defers redundant visits for 72 hours when real official source checks were completed. Figure 1 retains fallback identity, never claims to be an official TOC. No historical body/PDF visits.

## Still open (requires authenticated user-browser evidence, not CI)
There was a previous 141-task run (49 distinct DOI publisher pages, 51 attempts, 0 fully completed, 137 TOC + 5 owner PDF layer needs at 2026-10-12 12:42 Beijing). These old run counts do NOT represent new 2.2.84 actual results. The software deployment is verified; authentic RSC and Nature publisher capture improvements and remaining Chem PDF accesses are still **unproven** until owner updates the same extension instance and uploads a new 6.2.65 diagnostic log.
- If the user's prior pass is still running, allow it to finish before updating to avoid old/new concurrent controllers; otherwise update the existing Bridge 2.2.84 in the same Edge/Chrome Tampermonkey instance, verify engine 6.2.65, use only missing-only capture (not from-head all-DOI rebuild) if needed and upload local TOC diagnostic at the end.
- No need to redownload owner PDF 10.1039/d6sc06407h, previously indicated already_stored, unless a later verified inventory/reader check specifically proves a missing file.
- GitHub sync of this reply is made per PROJECT_RULES.md. Do not call this newly verified code publication full scientific-data/TOC/PDF completeness.

## User-visible final response substantially as delivered
“修复已合并（PR #552，29/29 回归成功；合并提交 58c9d00e），Worker 与 Pages 生产部署成功。北京时间 16:59 两个正式安装 URL 回读一致：Bridge 2.2.84 / 引擎 6.2.65，控制器 2.2.41，485,872 字符，均 HTTP 200。单 DOI 限定的 TOC/正文图库存真实 API 请求已通过（空集与非空集均正确，约 2.5–3.8 秒）。请原浏览器原 Tampermonkey 脚本更新，不卸载/重装、不清空原有本地 PDF，当前任务未结束前勿强制中断。此版本确实完成发布，但 Nature/RSC 官方 TOC 与 Chem PDF 的实际补缺仍需 6.2.65 新抓取日志验收。”
