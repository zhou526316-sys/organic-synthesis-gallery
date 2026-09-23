# Bridge 2.2.27 deployment and five-failure diagnosis

Recorded 2026-09-23 23:48 Asia/Shanghai.

## Five consecutive real-client failures under Bridge 2.2.26

The user's observation that the five most recent jobs all failed was confirmed against stored automatic reports.

1. 10.1002/anie.2539581 — Wiley — failed — paired_capture;toc=not_found;figures=0/0;published=0. Full article text was present, but repeated isolated figure scans returned zero labels/variants.
2. 10.1021/acs.orglett.6c03389 — ACS — controller_error — controller_timeout.
3. 10.1002/anie.5617321 — Wiley — failed — paired_capture;toc=not_found;figures=0/0;published=0. Full article text was present, but repeated figure scans returned zero labels/variants.
4. 10.1038/s41467-026-77436-w — Nature — controller_error — controller_timeout.
5. 10.1021/jacs.6c12740 — ACS/JACS — controller_error — controller_timeout.

The failure classes are therefore distinct:
- Wiley: DOM/figure discovery selector gap.
- ACS/Nature/JACS: controller/browser-suspension timeout behavior.

A later success does not invalidate the five-failure streak; 10.1021/acs.orglett.6c03712 subsequently completed 1/1.

## Strong result-precedence evidence

For 10.1021/jacs.6c07049 under Bridge 2.2.26, the same jobId/start time produced:
- publisher final_result: partial, toc=stored, figures=2/7, finished 2026-09-23T15:18:53Z;
- later Gallery controller final_result: controller_error/controller_timeout, finished 2026-09-23T15:34:28Z.

This demonstrates a false controller timeout after a durable publisher result already existed.

## Official Bridge 2.2.27 fix

Main commit a31dc9ce97873b13536bf16a86ae9b79a82ba39a implements publisher-result precedence:
- completedPublisherResult(job) validates same jobId, capture protocol and finishedAt;
- waitForResult checks a completed publisher result before timeout evaluation;
- after a long browser/controller sleep crossing the 8-minute budget, controller performs a short grace re-check before returning controller_timeout;
- heartbeat-loss also re-checks the publisher final result first;
- capture protocol remains 6.2.20 and existing DOI/identity/acquisition safeguards remain.

An alternative foreground-tab PR #190 was closed as superseded; it must not be merged over the narrower official fix unless actual 2.2.27 evidence later demonstrates a remaining timeout class.

## Deployment

The first direct a31 Pages run was cancelled by concurrent Pages activity. Live verifier files also retained stale @version 2.2.26 assertions; these were corrected:
- tm224 live assertion commit 20625a57c4a3a5ddc0675df28d820916e0670cf2;
- tm222 live-progress assertion commit 00e59228c580d8736d4ae796542f2b2906911c10.

PAGES_REFRESH commit b8f17d406c46021b14efd0287f30afc59f9eb4d7 triggered a fresh latest-main deployment.
Pages run 35883263761 completed:
- literature_authorization: success;
- build: success;
- deploy: success.

Corrected live verification:
- run 35883693292 — Verify Bridge 2.2.27 live — success;
- run 35883693259 — Verify live progress installer — success.

The fixed installer is therefore actually deployed with:
- installer @version 2.2.27;
- CONTROLLER_REVISION 2.2.27;
- capture protocol VERSION 6.2.20.

## Local-client status

Read-only automatic-report run 35884052874 after verified deployment still contained only controllerRevision=2.2.26 reports. No actual 2.2.27 local-client report had arrived by that read.

Therefore 2.2.27 must be installed/activated locally before judging the result-precedence fix. Do not start 2.2.28 solely from the old 2.2.26 reports.

## Wiley

Wiley 0/0 is intentionally unresolved by 2.2.27. Public automated fetch of the two Wiley pages was bot-blocked, so selectors must not be guessed broadly. The next Wiley change should be evidence-first: emit a small sanitized DOM-structure diagnostic when article text is loaded but isolated_labels remains zero, then update selectors from real local-browser markup without relaxing DOI isolation.
