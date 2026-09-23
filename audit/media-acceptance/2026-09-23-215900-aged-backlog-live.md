# Aged staged-body backlog anti-starvation — live acceptance

Recorded 2026-09-23 21:59 Asia/Shanghai. Media-only change; no literature corpus/title/scope changes.

## Policy and merge

PR #180 `Keep previously staged body figures draining` merged to main at commit `373a68b69b1ef0ebdc3411bb888e35a4b8c29cba`.

The current-generation automatic body publication policy now has three release modes:
- target batch: 20–25 eligible article identities;
- quiet tail: 1–19 articles after the newest eligible staged record is quiet for 15 minutes;
- aged backlog: 1–19 articles when the oldest eligible unpublished staged record has waited at least 30 minutes, even if newer eligible captures continue arriving.

Aged records are prioritized once they cross the maximum wait. Existing requirements remain: official non-fallback TOC present in the same Pages build, current corpus, current generation, capture protocol 6.2.20, exact DOI/source identity, server evidence marker, byte/digest/image-decode validation, max 25 new articles / 250 new images per build, max 10 figures per card, no publisher recrawl in the publication consumer.

PR regression evidence:
- Adaptive paired media batching regression run `35868616030`: success, including frozen real-byte/decode regression.
- Cloudflare migration CI run `35868615947`: success.
- Site quality gate run `35868616075`: success (production API smoke, Worker dry-run, frontend build/typecheck and Playwright interaction regression all passed).

## Production aged-backlog release

Backlog consumer run `35869464409` completed successfully:
- inspect: success;
- literature_authorization: success;
- build: success;
- deploy: success.

Build artifact `10754122989` / `new-body-auto-validation` reported:
- stageRows: 484;
- newEligible: 49;
- eligibleArticles: 12;
- validatedNewArticles: 12;
- releaseReady: true;
- releaseMode: `aged_backlog`;
- preferredTargetMet: false;
- tailFlushReady: false;
- agedBacklogReady: true;
- newest eligible idle: 3.6807 minutes;
- oldest eligible age: 57.1341 minutes;
- backlogMaxWaitMinutes: 30;
- publishedNewArticles: 12;
- added body figures: 49;
- held: 0;
- stagingWrites: 0;
- stagingDeletes: 0;
- publisherRequests: 0;
- automatic published snapshot after build: 172 figures;
- total public body figures after build: 395.

The 12 newly released DOI identities and new figure counts were:
- 10.1021/acs.orglett.6c03347 — 2 new;
- 10.1021/acs.orglett.6c03508 — 4;
- 10.1021/acs.orglett.6c03536 — 3;
- 10.1021/acs.orglett.6c03628 — 4;
- 10.1021/acs.orglett.6c03650 — 4;
- 10.1021/acs.orglett.6c03773 — 4;
- 10.1021/jacs.6c10183 — 4;
- 10.1021/acs.orglett.6c03438 — 4;
- 10.1021/acs.orglett.6c03389 — 4;
- 10.1021/acs.orglett.6c03295 — 3;
- 10.1021/acs.orglett.6c03293 — 6;
- 10.1021/acs.orglett.6c03180 — 7.

## Live acceptance

The initial live verifier correctly validated deployed byte identities but failed only because it still enforced the superseded >=20 article rule for all release modes. Commit `b6b98ce4616aac630e7f67c2b8d875f43bf1c7e4` changed the verifier contract to accept the same three policy modes while retaining all byte/TOC/card checks. Trigger `2e27955d58b4a77421aa10206cc0f763eeeeaddc` reran acceptance.

Live acceptance run `35870239937`: SUCCESS.
Artifact `10754508645`:
- result: passed;
- all 172 current automatic publication files passed byte/hash/evidence identity checks;
- 12 newly released cards checked;
- 12/12 cards visible;
- every expected image decoded with positive dimensions;
- exact labels and public URLs matched;
- 12/12 released DOI had an official non-fallback TOC;
- browserRenderingVerified: true;
- browserErrors: [].

## Continued draining after this release

Follow-up consumer run `35870455497` completed inspect successfully and skipped publication because the next remainder had not reached any release gate.

Its exact preflight log at 2026-09-23T13:55:30Z:
`NEW_BODY_AUTO_PENDING {"count":9,"articles":2,"targetArticles":20,"ready":false,"mode":"waiting","idleMinutes":1.1666333333333334,"oldestEligibleAgeMinutes":5.555466666666667,"backlogMaxWaitMinutes":30,"tailFlushIdleMinutes":15,"stageError":null,"localCaptureError":null}`

Therefore the publication system is continuing to reconsider previously staged current-generation records; it is not a one-shot release and it is not limited to newly captured rows. The remaining 2 articles / 9 images are correctly waiting and will become release-ready when any configured gate is met.

## Bridge client status

Bridge 2.2.26 fixed installer/live verification has passed (dedicated live verifier run `35868433942` and live-progress verifier run `35868433878`). However the latest actual Tampermonkey automatic reports read by run `35870374569` still show `controllerRevision=2.2.25`. Do not judge the 2.2.26 stable-discovery change from those old-client reports. Local user update to Bridge 2.2.26 is still required before real-client evaluation.
