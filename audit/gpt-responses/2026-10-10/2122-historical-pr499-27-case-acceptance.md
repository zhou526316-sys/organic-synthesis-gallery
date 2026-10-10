# Historical archive PR #499 — comprehensive adversarial test and approval hold

- Beijing time: 2026-10-10T21:22:14+08:00
- Context: Organic Synthesis Gallery history archive continuation; user requested “再测试全面一点”.
- Production repository: `zhou526316-sys/organic-synthesis-gallery`. Formal baseline `main` was `1f294d89dc0806a2045cff0086f8f962648c73b3` at report snapshot.
- Feature branch: `feature/history-resumable-window-splitting-20261010`; draft PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/499
- Final tested feature commit: `5ed17f8e3f57c626ad0ca69c9311bce28c1a4352`.
- Tracking issue: https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498
- PR comment with full test matrix and safety hold: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/499#issuecomment-6097934592
- Latest historical test CI: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38055272246

## User-facing answer (partial messages and substantive final response)

The 9 previously passing historical-window regressions were expanded first to 19 tests, then to 25 and **27**.
The 19-test run initially had **16 pass / 3 meaningful safety failures** after fixing initial mock/RegExp typos:
1. A corrupted resumed checkpoint with omitted date days could falsely close a root window.
2. A reversed or invalid pending subwindow could reach the request path instead of being rejected.
3. After a legitimate 08:00 release between resumed nightly fragments, prior `unfinished` status could persist even though its DOI was now in the production registry.

All three were corrected **only inside the unmerged draft PR** through contiguous, nonoverlapping date-coverage evidence checks, valid-date and parent-range guards, and a fresh published DOI-membership reconciliation at parent completion.

The first red evidence CI is https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38054984945 (19 tests, 16 pass, 3 fail). The clean remedial 19-test CI is https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38055070276 (19 pass), and the final source-window regression is https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38055272246 (**27 tests passed, 0 failed**, ~10.7 s). No live publisher fetches are performed by these Node tests.

The final mock scenarios include:
- 16 journals, journal-specific ISSN sets and complete window->previous-week rollover.
- Both Crossref and OpenAlex source failures: HTTP 403/429, transport exceptions, missing cursors, inconsistent count, source combined with truncation, and API request-budget exhaustion.
- Normal empty source completeness vs unavailable source (never conflate zero with a failed request).
- Deep nested bisection, resumability over separate simulated nights, one-day unbisectable truncation and leap-year boundary.
- Partial/root checkpoint corruption, segment journal identity mismatch, completed leaf receipt missing on disk, and a range with missing calendar coverage.
- Duplicate DOIs across nonoverlapping subwindows, once-only parent DOI aggregate, and the 08:00 cross-run published-membership update.
- Stage-only guard denial of unauthorized main ref write, no changes to production release marker/DOI queue.
- July–September `toc_only` media policy and pre-July-2026 `metadata_only`: no new body, SI, PDF or protected publisher abstract text copied to staging.

The latest PR changes exactly three files: `scripts/historical-nightly-discovery.mjs`,
`scripts/test-historical-nightly-discovery.mjs` and `docs/historical-window-splitting.md`.
The formal 08:00 publication workflow and independent 23:00 historical collector were not touched or merged.

Other CI runs for final PR SHA:
- Target-journal Tampermonkey capability: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38055272258
- Private PDF capture v2: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38055272261
- Full site quality gate / browser regression: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38055272248
When written, the historical collector and Tampermonkey dedicated suites had passed; PDF verification and site-quality completion were still being independently checked.

## Clearly unresolved/not claimed
- No source-live acceptance or verified 23:00 historical candidate run was performed in this chat. The historical staging branch still had 0 completed windows when last read; first actual scheduled collector run remains to be checked separately.
- No multi-decade archive completed, no legally reusable abstract text indexed, no two-pass scoped historical admission, no historical search D1 release; all tracked by #498.
- The existing default 8 date×journal units/night was not increased. The full-archive throughput limitation remains.
- Draft PR #499 was not merged; neither `main`, formal literature admission, retained media/PDF bytes, nor the approved 08:00-only daily release schedule were altered by this testing.
- This audit-only branch intentionally does not alter the actual PDF or TOC production system.

## Visible message reconciliation
User-visible progress reported:
1. Expanded 19-test batch reproduced three draft-code faults; explained dates, windows and stale DOI status.
2. Corrections limited to PR #499; 19/19 passed in real GitHub CI.
3. Final 27/27 historical-source regression passed, including 16-journal traversal and before-July-2026 policy.
Final user-facing completion also reports related CI status and the draft-only production hold without suggesting historical crawl or live search is finished.
