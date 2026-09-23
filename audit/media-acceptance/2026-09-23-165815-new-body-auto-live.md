# New marked ACS body auto-publication — production and continuation accepted

Task: user requested continuing publication of newly captured body images without repeatedly treating them as historical contamination. Recorded 2026-09-23 17:00 Asia/Shanghai; final live acceptance completed 16:58:15.334. This is a separate automatic technical-provenance path, not invented individual semantic approval.

## Deployed implementation and tests

PR160 merged at2026-09-23T08:46:33Z as fa71eedf1a14096ed9ff980745405f845921cc9e. Final functional head fcf94ab3bf9d8af5d9b1281debbc072c71801c4e passed full PR CI (Cloudflare migration35838538529, site quality35838538469) and strict real-byte workbench35838535154 with22 new tests, including isolated Chromium decoding of9 actual server-marked stored files. Artifact10740930115 was downloaded and independently rehashed as bebb65db089d7b8b5085048f849173aa254d11034bb4e1315c3ac83564ba8d35; its22-pass summary and exact tested head were read.

See earlier prepublication record 2026-09-23-163200-new-body-auto-prepublish.md for the initial filename-pattern error and tee-masked false-green. That earlier false-green was caught before merge and was never treated as acceptance. Exact owning-article asset basename validation and strict pipefail+required completed-summary detection replaced it. The final22-test run also challenges stale/mixed public snapshots, proving that a shorter old auto snapshot cannot silently erase newer published images.

No collector/userscript, Worker capture intake, frontend UI, production literature input, R2/D1 media object or original capture timestamp was changed by this PR. Fixed quarantine1790082000000 remains unchanged. Existing individually reviewed approvals and both restored TOC batches are preserved.

## First actual production run

Pages deployment35839047474: all jobs successful, including unchanged literature_authorization107109439657, build107109520177 and deploy107109835345.
Actual automatic merge checkedAt1790153258874 (16:47:38.874 Beijing): stageRows355, newEligible58, added14, held0, retained0, automatic publication count14, overall public body entries95. No stage read error, publisher requests, staging writes or staging deletes.

First14 additions by DOI:10.1021/jacs.6c15694=2;10.1021/acs.orglett.6c03595=5;10.1021/acs.orglett.6c03382=5;10.1021/acs.orglett.6c03353=1;10.1021/jacs.6c13515=1.

Build artifact10740965966 was downloaded and independently SHA256-checked as53fe09c611249a2fa374e024c551cea1505125d24c2f799508f8cb8c54bbd645. Both auto-body-status.json and auto-body-publication.json were parsed.

Live acceptance35839198914 succeeded. Artifact10741170372 was downloaded and independently rehashed as a259a9143c7b0cbd5e7db2fb21013862f5110254143cea73279de434eb707418. checkedAt08:48:48.002Z; completedAt08:49:02.651Z. All14 actual public files had matching SHA256, exact owning DOI/id/label/source evidence, published manifest and ARRAY-format ledger state. Five actual production cards displayed and decoded the expected counts2/5/5/1/1, with matching exact labels and image URLs, no browser errors. The screenshots were downloaded, assembled and visually inspected. This is a display check, not retroactive individual semantic approval of all images.

## Continuous consumer actually invoked and previous publication preserved

At16:54, a read of the newest schedule-event runs did not yet show a naturally scheduled new-body tick. Instead of claiming one, issued a single explicit push trigger at audit/automation-triggers/new-body-continuous.json, commit7cad01dabd303910eaf0dd2287e759c1ad98571a at08:55:02Z. This exercises the SAME deployed workflow used by its fifteen-minute schedule; it is not a substitute new task or a recurring assistant poll.

Workflow Publish validated new body figures, run35839856913: all four jobs passed. inspect107112075434 detected eligible unseen records; publish/literature_authorization107112131489 passed; publish/build107112206596 independently validated and merged new stored files; publish/deploy107112614542 succeeded. Thus actual inspection -> conditional reusable authorized build -> deployment works, rather than only a one-off Pages push.

Second automatic merge checkedAt1790153785603 (16:56:25.603): stageRows364, newEligible53, added23, retained14, held0, automatic count37, overall public body entries118, no stage read error. The prior14 exact DOI/id/SHA256/imageUrl/evidence fingerprints were independently compared across both downloaded publication snapshots and were all retained unchanged.

Second23 additions by DOI:10.1021/jacs.6c08653=8;10.1021/acs.orglett.6c03674=2;10.1021/acs.orglett.6c03512=5;10.1021/acs.orglett.6c03488=5;10.1021/acs.orglett.6c03411=3.

Second build artifact10741087345 downloaded and SHA256 verified as065fd57a7f668c2565581ad0a74258c8fa2dbb7c5bd8b76f2d367cdb1d9eb969.
Second live verifier35840067251, job107112750785: SUCCESS. Artifact10740908319 downloaded and independently SHA256 verified asfddd46e91cd1f1a882eb587d4c90dd7dfc2d28f5b08594ab73a41c45c1dcdd6b. checkedAt08:57:51.817Z, completedAt08:58:15.334Z. All37 actual published automatic files passed exact bytes/hash/DOI/id/label/evidence/ledger verification, including every prior14 file; the second five actual cards decoded8/2/5/5/3 figures with exact labels and URLs, no browser errors. All five final screenshots were inspected as a composite. Across both runs10 distinct affected cards were browser-tested and37 distinct automatic images published. The final verifier explicitly has individualSemanticReview=false.

Both verifiers report restoredTOC1=83 and restoredTOC2=18 preserved, and manualLedgerEntries=75. Automatic37 plus existing81 body entries yields118. Do not calculate from the earlier66 baseline or attribute intervening parallel manually approved additions to this automatic feature. Ledger approval coverage and all body-entry counts are different sets.

Browser tests used the real public GitHub Pages frontend and actual deployed image URLs; non-GET/HEAD/OPTIONS requests were blocked so no test user/analytics/media writes were generated. Lazy thumbnails were set eager only for decoding checks, without altering URLs or figure counts. This does not establish every mobile layout/viewer gesture or publisher-original maximum resolution.

## Operational behavior and boundaries

The mainline internal GitHub schedule is7,22,37,52 * * * *: one metadata inspection every15 minutes. Eligible unseen images conditionally invoke the same existing Pages workflow. Full literature_authorization remains mandatory; no08:00/18:00 literature slot or hourly manual exception-review task was changed. This turn proves the continuing workflow by an explicit trigger push and two actual published batches; a NATURALLY scheduled tick has not yet been observed. GitHub may delay scheduled runs, so15 minutes is a polling interval, not a guaranteed capture-to-display latency. No claim of permanent ChatGPT monitoring or automatic code repair is made.

Eligible initial rollout: newly server-marked current-generation JACS, Organic Letters, JOC and ACS Catalysis body files with validated task/page/source DOI, canonical evidence fingerprint, article-specific trusted numbered CDN asset, caption/figure identity, exact R2 object identity, real SHA256/size/type/dimensions, no detected cross-identity duplicate conflicts and isolated browser image decoding. At most5 newly affected articles/30 new figures per build; existing10-thumbnail card display limit retained. The two actual batches admitted14 then23; they did not fill all30 slots because only five article slots were available per batch.

Markers remain storage evidence, not semantic approval. The automatic publication step does not set manual approved flags and labels its records automated_provenance_bytes_and_decode, individualSemanticReview:false. Old sealed, unmarked, opaque-source, out-of-scope/held and same-id replacement cases are not blanket-released. Nature/Wiley are not in this first automated source whitelist; current failures there still need separate treatment. No claim of complete article inventories or max-resolution images.

Prior automatic publication snapshots and actual immutable images are revalidated on subsequent builds. Stage-feed outages preserve prior publication. Mixed snapshot identities or unreadable prior automatic files stop before output modification, rather than publishing a stripped gallery. Invalid new images are held separately and bounded retry state is preserved. No new publisher request, R2 staged-original deletion, old-time rewriting or historical unquarantine occurs.

Stored receipt published:false still describes the immediate staging receipt, NOT the later static publication ledger. The37 verified files remain preserved in staging while published copies are visible on cards. The installation remains Bridge2.2.23 with protocol6.2.20; no reinstall or recapture is required for this feature. Existing upload503, ACS generic-MIME and Wiley discovery issues are not claimed fixed by the publishing change.

## Confirmed user artifacts

/mnt/data/new-body-auto-live-verification-20260923.json contains both actual acceptance reports and exact previous14 preservation comparison.
/mnt/data/new-body-auto-live/cards-overview.png contains the second five real card screenshots.
/mnt/data/new-body-auto-live/first/cards-overview.png contains the first five real card screenshots.

## Additional progress reply

第一轮已经实际自动上架了14张新正文图，5篇卡片的线上图片、图号和文件哈希均已通过验收。
我正在验证下一轮能否自动接续，并保留刚上线的图片。这一步通过后，合格的ACS新图就不再需要我逐篇手工打包发布。
