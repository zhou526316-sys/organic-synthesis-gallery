# Historical text v0.2.11: post-merge Pages/installer/read-only diagnostic acceptance

- Beijing checked: 2026-10-16 10:42:28 (+08:00)
- Task: Continue approved two-fix historical text capture, previously merged PR #711. Read-only production validation only in this session; no new publisher visit or unapproved code change.
- Approved fixes were: exact job-bound `document-start` publisher-script activation and paused UI state coherence. Science-content rights scope and TOC/media/PDF/SI/public FTS unchanged.

## Merge and final Pages outcome

- [PR #711](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/711) merged: `8e3e669d4e629aef949ff620300501098fa59de7`.
- [Pages workflow #38837156601](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38837156601): `literature_authorization=success`, `build=success`, `deploy=success`.
- Build job `116768842314` logged exact `HISTORICAL_TEXT_INSTALLER_ARTIFACT_VERIFIED 0.2.11` after byte-for-byte source/dist match.
- Deploy job `116771712843` used Pages build `8e3e669d4e629aef949ff620300501098fa59de7`; deployment verified successfully.
- Current main `public/gallery-historical-text-pilot.user.js` has `@version 0.2.11`, `function batchEarlyPublisherHeartbeat`, `historic-body-early-bound-v031`, and corrected final-paused rendering.
- Independent external live fetch of `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js` contains `BATCH_SCRIPT_VERSION='0.2.11'` and `batchEarlyPublisherHeartbeat`, confirming production main entry serves the repaired code. The extraction service strips the opening metadata header for this unusually large userscript, so actual `@version` is confirmed by the byte-exact GitHub Pages artifact/build checks rather than that extracted header.
- Live backup `https://api.gczhouwld.com/gallery-historical-text-pilot.user.js` still contains `BATCH_SCRIPT_VERSION='0.2.10'` and does not have the early-heartbeat repair. **Do not advertise this as a 0.2.11 backup**. Avoid redeploying the entire production Worker without a separate scoped approval.

## Actual browser data (read-only)

- Re-ran existing owner-only metadata aggregate [#38834544404](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38834544404), latest job `116782894794`, succeeded with 200 recent events, 148 independent terminal attempts, zero raw event/text release.
- Event counts: `0.2.8=103`, `0.2.9=80`, `0.2.10=17`, **`0.2.11=0`**.
- 0.2.10 terminal results represented in recent view: no-handler `7`, timeout `4`, licence pending `3`, saved_local `0`. Other events are older script versions. This neither measures nor predicts post-fix v0.2.11 outcomes.
- The screenshot before repair showed 14/573 attempted, 0 new, 69 browser-local existing packet keys. Those are not independently readable through GitHub; never count them as complete science text or public FTS.
- Real browser `0.2.11` owner acceptance **remains pending**. No Edge/Chrome profile was operated remotely; user must update userscript in actual capture browser and generate diagnostics.

## Next actionable pilot

1. In the actual Edge/Chrome Tampermonkey profile, use only the canonical install URL `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`, verify `0.2.11`, and keep one historical-body userscript enabled.
2. Reload Gallery and open `历史正文 · 独立补抓`. Select the existing `出版社回执核验（最多8篇）` pilot first. It is a controlled sample for previous missing-script receipts, not a global capture limit.
3. New publisher pages should first show/record `publisher_dom_wait` (script running) followed by DOI verification/rights, avoiding a false `publisher_script_not_confirmed` merely because DOMContentLoaded is delayed. A true no-script page still needs troubleshooting of Tampermonkey permissions and redirects.
4. Inspect `失败详情` and `全库正文覆盖`. With already saved secret, click `立即上传待发诊断`; confirm pending count drains, no article text, keys or credentials placed in chats.
5. Only if the pilot confirms correct startup receipts, resume `一键补抓全部缺项` for eligible pre-Oct papers; `全库开放正文补抓（本机）` covers official OA source across full formal catalog separately. Both only save DOI- and CC BY/CC0-verified science locally, no full-corpus completion claims and no public FTS import.

## Release status

**Merged, Pages deployed, primary installer v0.2.11 live and code-integrity verified. Real publisher-session success rates not yet verified. API mirror still stale v0.2.10.** Do not modify unrelated media or publication workflows based on this acceptance note.
