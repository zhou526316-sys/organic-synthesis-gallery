# Organic Synthesis Gallery — 16-journal historical backfill verification

- Time: 2026-10-11 09:33:24 Asia/Shanghai
- User correction: “一共应该有16本期刊啊”
- Main baseline read: c3a87ae084f429bfc01880fdd0345a78f1f7d645
- Sources: main shared/literature-journals.js; staging/historical-archive-nightly/audit/historical-staging/state.json; all 16 JSON files audit/historical-staging/batches/2026-09-22_2026-09-30_*.json.
- Scope: Historical metadata discovery only, no media/PDF writes and no formal inclusion or 08:00 new paper publishing.

## Confirmed facts
- The journal registry has exactly 16 journal names. The first status report listed **8 completed in the first collection batch**, not the total target journal set.
- The second 8 have now completed. Staging `completed.length=16`, `attempts.length=16`, `lastRun.blocked=false`, cursor has moved to 2026-09-15..21 / journalIndex 0.
- All 16 root batch files were fetched, parsed and sourceStatus checks passed. Each has `status=source_enumeration_complete` and `consistency.complete=true`. No failed files.
- Journal: candidates / already in Gallery / unfinished candidate:
  * JACS: 155 / 34 / 121
  * Angew: 213 / 41 / 172
  * Nature: 153 / 2 / 151
  * Science: 44 / 2 / 42
  * Nature Catalysis: 4 / 1 / 3
  * Nature Synthesis: 9 / 2 / 7
  * Nature Chemistry: 16 / 2 / 14
  * Nature Communications: 272 / 3 / 269
  * ACS Catalysis: 46 / 15 / 31
  * Organic Letters: 94 / 82 / 12
  * Chem: 3 / 0 / 3
  * Chemical Science: 0 / 0 / 0
  * CCS Chemistry: 11 / 1 / 10
  * Science Advances: 133 / 2 / 131
  * Green Chemistry: 0 / 0 / 0
  * JOC: 53 / 43 / 10
- Total 1,206 DOI candidate records across one calendar range; explicit cross-DOI dedup check of all 1,206 records confirms 1,206 unique DOI (zero duplicate DOI). Of these, 230 are already in Gallery and 976 are still unfinished and not approved for inclusion.
- The count of 0 for Chemical Science and Green Chemistry is an observed 0 response from both Crossref and OpenAlex for this narrow 2026-09-22..30 window, **not a finding that no papers exist**. They merit independent source/ISSN and publication-date review to detect metadata gaps.
- main journal registry activeFrom is prospective current-new-paper policy; the currently deployed historical discovery script explicitly iterates all 16 and does not filter by activeFrom.
- Earlier project goal: historical search to journal founding, not merely 2026-09-22..30, preserving per-date historical media and review policies. This single week window being complete must not be described as the full historical archive being complete.

## User-facing report
User is correct: all 16 journals belong to the archive. Previously listed 8 were just the first run. The staging branch now contains a completed 2026-09-22..30 batch for every journal. The names/counts above represent raw metadata candidates only. 1,206 unique DOI; 230 existing in Gallery; 976 still pending semantic screening. Two RSC journals show 0 source results and need source coverage review. Next checkpoint is Sep15..21/JACS. Only 08:00 publishes new papers; historical admissions remain separate and never appear in daily new or WeChat daily-new. No runtime or publication change made in this verification.
