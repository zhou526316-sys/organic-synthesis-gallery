# 2026-10-11 00:28:23 Asia/Shanghai — Tampermonkey 2.2.82 real-browser screenshot and queue reconciliation

Task context: User sent screenshot of running Gallery in their browser on 2026-10-11 around 00:19 Beijing. This is **new** direct evidence of Bridge 2.2.82, integrated engine 6.2.63 and controller 2.2.41 running a real missing-only task. User seeks continuation of previously authorized Tampermonkey diagnosis. Before any repair to this feedback, project approval gate remains in force.

## What was visible / partial responses to user

- Panel displayed 「全队列补缺6 · 回源适配7」, 「仍有未补齐或未确认项」, current DOI 「当前没有任务页」. Panel showed `10.1起 938 篇 · 未补齐 30 篇（待执行 0 / 冷却等待 0 / 未补齐待诊断 30）; TOC 27 / 确实缺 PDF 3; PDF 云端已齐 202 / 待验证 0 / 未知 733`. Cumulative figures: 「实际访问 30 / 139 篇 · 冷却等待 0 · 确认补齐 0 篇 · 尝试 43 次 · 新主图 0 · 新正文图 2」. Run started 20:41:37. This proves browser activity but not all capture layers succeeded.
- Initially interpreted 30 blocked as completed bounded retry pass. **Important correction after code inspection**: besides genuinely blocked articles, existing historical Figure1-fallback official TOC upgrades can get silently dropped by a policy mismatch during warm-start/fresh inventory merge. Thus do not infer all 139 initially planned articles were actually tried or legitimately resolved.
- `public/toc-mainline.user.js`, version 6.2.63, lines ~5541–5594: a publisher HTTP 401/403/429, DOI mismatch, PDF not stored or no-progress retry marks a DOI `blocked`, preserves missing need and stops infinite loops. Source code lines ~5611-5630 count per-DOI pending/blocked/verified statuses. There is no justification to mark 30 fully complete.

## Read-only GitHub R2 evidence

- Triggered existing read-only diagnostics workflow by updating ONLY `audit/automation-triggers/tm-acceptance-read.json` to request an existing-R2 read (no publisher calls, capture, promotion or media writes). Commit `14963c1f3e34aeabacaa8abb2dcb712f965efaa9`. GitHub Actions #38067519833 job #114258080374 succeeded.
- R2 `local-captures/diagnostics/latest.json` was still a previous manual upload dated 2026-10-10 **17:30:35.608 Beijing** (`uploadedAt: 1791624635608`), with run started 15:15:01 and finished 16:10:07 Beijing; source used protocol version 6.2.20 and controller 2.2.41. This does not cover the screenshot's new 20:41-running 2.2.82 session.
- Report index was newer, `updatedAt: 2026-10-11 00:23:06 Beijing`, but latest per-DOI report entries printed by the bounded read were earlier (e.g. 2026-10-10 21:56 Beijing). Current 30 last-reason categorization requires the **new** manually uploaded local diagnostics, or an equivalent same-run evidence packet.
- The existing older per-DOI reports show genuine mixed acquisition issues (ACS SVG / image failures, RSC official TOC not found, Chem publisher access gates, owner PDF transfer failures), not one universal source issue.
- This read-only evidence does not prove current 30 specific DOI reasons.

## Verified queue policy conflict

- Canonical `public/toc-demand-live.json` timestamp 2026-10-10T11:34:08.442Z: 938 articles = 733 `toc_only` Jul–Sep + 205 standard. It is misleading for the panel to label all 938 「10.1起」.
- `allMissingOfficial`: 153; 118 of those are historical toc_only. `officialUpgrades`: 128, including **107 historical toc_only Figure 1 fallback upgrades** and 21 standard. `visibleGaps` 25. Those 107 historical upgrades remain genuine tasks under the existing retrospective official-TOC-only policy.
- `missingCaptureDecision` at lines ~5418–5441 correctly schedules historical `toc_only` captureToc when there is a fallback, via `tocNeeded = tocKnown && !productionOfficial && (tocOnlyCaptureEligible(raw) || !figureOneCompletesQueue)`.
- BUT `coverageJobNeeds` at lines ~5522–5525 later unconditionally does `if(job && job.captureToc===true && verifiedFigureOneSatisfiesQueue(job,job.existingTocKind==='figure1')) job.captureToc=false;`, and `verifiedFigureOneSatisfiesQueue` (line ~1233) returns `Boolean(hasFigureOne)` regardless historical `toc_only`.
- `coverageMergePlan` at lines ~5527–5539 invokes `coverageJobNeeds` on previously staged jobs when refreshing inventory; so historical DOI with a Figure1 fallback is at risk of losing its pending official TOC need despite the original discovery rule. It may remain `state='pending'` but `coverageHasNeeds===false`, invisible to blocked/pending yet included in `s.total`, which can explain the screenshot's 139 total / 30 visited / 0 confirmed / 30 blocked. Do not assert all difference of 109 without the new diagnostic.
- This is **verified code-level misalignment**; do not fix in a branch, merge or deploy without the user's specific approval under `PROJECT_RULES.md` feedback verification gate.

## Proposed user decision and next evidence

- Propose fixing `coverageJobNeeds` to protect genuine historical `toc_only` missing official TOC, with regression covering Figure1-fallback refresh, stable per-DOI pending totals, and no standalone body/PDF capture for history. Separately fix panel corpus label (938 is not all Oct1+) and completion metrics so canceled/de-duplicated tasks are not presented as successes.
- Ask user to run existing Tampermonkey menu 「上传本地 TOC 日志」 once NOW, without restarting the pass, deleting browser storage or re-downloading PDF. Read current 2.2.82 / 6.2.63 local diagnostic after upload and group 30 genuine blocked DOIs by reason; then propose per-publisher fixes.
- Do not call 733 unknown owner PDFs missing; not stored/unknown statuses are separate, private rights remain unchanged.
- The initial partial response stating the controller did not forget 30 was limited to the `blocked` records and is corrected for the historically omitted Figure1 upgrade requests.

Related read-only workflow: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067519833
