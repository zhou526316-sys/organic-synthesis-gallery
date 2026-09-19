# TOC Collector handoff — 2026-09-19 23:34 +08:00

Project: 抓取有机合成文献并持续更新网页
Repository: zhou526316-sys/organic-synthesis-gallery, branch main
Public site: https://zhou526316-sys.github.io/organic-synthesis-gallery/
Worker fallback: https://organic-synthesis-gallery.zhou526316.workers.dev
Primary Collector API configured in app: https://api.gczhouwld.com
User local repo: C:\Users\asus\organic-synthesis-gallery-main\toc-collector

## Mandatory project rule

Read PROJECT_RULES.md before doing anything.

From 2026-09-19 onward, every GPT reply in every chat window belonging to this ChatGPT Project must be synchronized to Git:
- append replies to audit/gpt-responses/YYYY-MM-DD.md;
- include Beijing time and chat/task context;
- preserve the reply substantially as sent;
- include related commit SHAs when available;
- never log secrets, tokens, passwords, or cookies;
- if Git is temporarily unavailable, queue the reply for the next successful Git operation.

Relevant rule commits:
- ea68724472d45ea206de60b4129a7ed9f4990549 — Add project-wide GPT response sync rule
- 17252b88bbd7e00a2bda5693696d665ba275b26a — Apply GPT response sync rule to every project chat
- efdbbbb355e1448f273f506f0b023e0e7650e3ee — Log GPT response: project-wide all-chat sync scope

## User intent and environment

ChatGPT web remains the controller for literature discovery, semantic review, TOC strategy, audits, and website updates. The Windows Collector is only a VPN/authenticated-browser bridge for protected publisher media.

Environment:
- Windows desktop
- local source C:\Users\asus\organic-synthesis-gallery-main\toc-collector
- verge-mihomo 127.0.0.1:7899
- Windows system proxy disabled
- school VPN aTrust, TUN off
- do not ask user to enable global/system proxy

TOC policy:
- official TOC / Graphical Abstract / Visual Abstract preferred
- if official visual cannot be obtained, Figure 1 fallback is acceptable
- Figure 1 must never be labeled as official TOC
- no silent missing media
- rerun unresolved live gaps only; do not restart the old 168-item historical set

## Current authoritative website/media state

GitHub Pages run 35451043210 completed successfully at commit c01e3dad0bcb489d4f87271384eb98d4999e2f75.

Final build state:
- media-index records: 460
- figure metadata: 718
- PMC fallbacks: 26
- Springer Nature Figure 1 fallbacks: 15
- static media integrity failures: 0
- Pages deployment: success

The first full local VPN scan uploaded 80 captures:
- success 80
- failed 0
- R2 capture count 80
- all 80 marked official in that first upload
- Pages merge saw captures=80, official=80, merged=77, failures=0
- 3 did not overwrite because an official TOC already existed

## Critical ACS broken-image incident

The user correctly observed dozens of ACS cards visually missing TOCs even though an early demand script said only 7 ACS gaps.

Root cause:
- 66 of the 80 local captures contained SVG bytes but were incorrectly named/served as JPEG
- 63 mapped to current ACS cards:
  - Organic Letters 46
  - JACS 12
  - ACS Catalysis 5

Example:
10.1021/acs.orglett.6c03505
old broken path: media-mirror/local-3c38ea4d335e186f34924766fcd5.jpg
repaired path: media-mirror/local-3c38ea4d335e186f34924766fcd5.svg

Relevant fixes:
- d5cb2879b7ea4361a09afa989f0eb628b1867cdd — Pages byte sniff and SVG repair
- 2d557586187d72f0f3867fb6286c2a1432c718ea — R2 byte sniff
- 391a1a36c591886b339bf9022a4a68f8e322787a — Collector SVG preservation
- 74f42cc6ee3a8b3f0891db200776212a14dc35f6 — block Pages deploys with broken media references
- ea855e435d370aa2eea19f6900e180ef507e6d3c — sanitize invalid media
- c01e3dad0bcb489d4f87271384eb98d4999e2f75 — successful sanitized Pages deployment

During repair:
- invalid Nature fallback for 10.1038/s41586-026-11043-z was removed and returned to genuine missing state
- bad JACS Figure 1 for 10.1021/jacs.6c08653 was pruned; its official TOC remained
- final STATIC_MEDIA_INTEGRITY failures=0

Do not revert the SVG sniffing, sanitizer, or integrity guard.

## Current live TOC demand after SVG repair

Authoritative workflow:
Refresh live TOC demand queue
run 35451795560
basis commit 9ceb6c01636b49687a448e7c8d467e5263c53549
conclusion success

It loads all 478 deployed cards, including literature-supplement.json.

Result:
- webpage DOI total 478
- media records 460
- visible gaps 20
- missing official TOC total 88
- fallback-only official upgrades 68

Visible gaps:
- ACS 7
- Wiley/Angew 11
- Nature family 2
- Science 0
- Other 0

Official-upgrade queue:
- ACS 1
- Wiley 2
- Nature 63
- Science 2

Definitions:
- visible gap = deployed card has no usable visual; primary priority
- official upgrade = a Figure 1 or other fallback is already visible, but official TOC can replace it later

The earlier dozens of blank ACS cards were the broken SVG publishing issue. After repairing those 63 ACS cards, 7 is the current genuine ACS blank-card count.

### All 20 current visible-gap DOIs

ACS:
1. 10.1021/acscatal.6c04593
2. 10.1021/acscatal.6c05293
3. 10.1021/jacs.6c09678
4. 10.1021/jacs.6c13760
5. 10.1021/jacs.6c10408
6. 10.1021/acs.orglett.6c03247
7. 10.1021/acs.orglett.6c03255

Wiley / Angew:
1. 10.1002/anie.5852828
2. 10.1002/anie.6992524
3. 10.1002/anie.8911828
4. 10.1002/anie.1537547
5. 10.1002/anie.5796773
6. 10.1002/anie.8651160
7. 10.1002/anie.2218878
8. 10.1002/anie.5041475
9. 10.1002/anie.8789956
10. 10.1002/anie.5070160
11. 10.1002/anie.5617321

Nature family:
1. 10.1038/s41586-026-11043-z
2. 10.1038/s41467-026-76235-7

Science: no visible gap.

## Collector diagnostics and publisher-specific causes

Diagnostic infrastructure is implemented:
- per-DOI diagnostics
- automatic retry queue
- R2 diagnostic upload/read
- capture sync after retry
- diagnostic sync after retry

Key commits:
- 5b2d0809210f00d56f86f7fb43485a18520a1feb — per-DOI diagnostics
- 573f28d71739ff580c3fdbe6a867c5ffa04ac06c and c3f8bf... and 83d036... — R2 diagnostic channel
- 1b3da433b7c4026e97b5a4c8065c817309ebc794 — auto sync after retry

Diagnostic endpoint:
GET https://organic-synthesis-gallery.zhou526316.workers.dev/api/media/local-diagnostics

Local diagnostics:
%APPDATA%\organic-synthesis-gallery-toc-collector\toc-diagnostics\
diagnostics.jsonl
latest-summary.json
retry-dois.txt
official-upgrade-dois.txt

### ACS
An 8-DOI diagnostic retry previously gave:
- total 8
- retry 8
- officialSaved 0
- figure1Saved 0
- all failure class image_download_failed
- underlying error image_http_403

The TOC was recognized; ACS/Silverchair CDN refused the secondary request.

Fix:
9779765b823513bcd3b68fb3fc1a0c029ce7cfaa
It reuses the publisher-authenticated Electron session and, if CDN still refuses, captures the already-rendered visual element from the article page.

Future ACS retry must use current background.mjs.

### Wiley
Known first-run problems:
- institutional authentication could outlive the old short window
- visual labels vary

Current code:
- auth/captcha/institution window can remain open about 8 minutes
- do not close the publisher window while authenticating
- recognizes Graphical Abstract, Visual Abstract, First Page Image, Graphical Synopsis/Summary, picture/source and relevant data-* attributes
- Figure 1 fallback enabled

### Nature
Only 2 current visible gaps. Most of the 63 Nature items in official-upgrade already have Figure 1 fallback and are not blank.

Diagnostics include proxy resolution and institutional-access signals. Electron DIRECT does not prove aTrust was bypassed.

### Science
Current visible gaps 0. Two official-upgrade items only.

## D1, R2, Cloudflare

Cloudflare D1 hit the Free daily row-read quota on 2026-09-19, causing D1-backed media endpoints to return 500. This did not mean media data was lost.

TOC publication was made D1-independent:
Local Collector -> R2 image/manifest -> Pages merge -> GitHub Pages

This path successfully published the 80 captures while D1 was exhausted.

## Feedback resilience

User requires Cloudflare quota exhaustion not to break reading or interaction.

Current approach:
- feedback queues locally and/or private R2 when D1/Worker is unavailable
- normal reading/search/local state remains usable
- optional Worker calls have short timeout
- feedback retries later

Relevant commits:
- 7bf550b9e4232e7a3aecdc3de11ab815bd7b6ffd — local feedback queue
- f011591e84786ce320af70057afc76e820103d25 — queued-state UI
- 285d431d1413061e5bf65e62fac0b32f64783e21 — private R2 fallback
- feedback export run 35451404074 success

## Immediate local-script issue

User's local RUN-LOCAL-VPN-RETRY.ps1 produced:
Missing closing '}' at line 30 around } else {

That local file is stale/corrupted. Do not manually add/remove braces.

Current repository file:
toc-collector/scripts/RUN-LOCAL-VPN-RETRY.ps1
blob SHA eed869b8c123551d419aa01bd98041d09b0e30ca

Corrected commits:
- c7c3d34f8c9f0da911b0353c583a6de2b3d620a1 — parser-safe rewrite
- 7c8e6d2aca4a3f6c563bfc13b1ae70b162d7cb3f — corrected runner stamped for local refresh

Windows build run:
35452268158 — success

First action in the new chat: overwrite the user's local retry runner from current main and perform a PowerShell Parser check before running anything.

Suggested command:

~~~powershell
cd C:\Users\asus\organic-synthesis-gallery-main\toc-collector

$target = ".\scripts\RUN-LOCAL-VPN-RETRY.ps1"
$url = "https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/main/toc-collector/scripts/RUN-LOCAL-VPN-RETRY.ps1"

try {
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 30
}
catch {
    curl.exe -L --proxy http://127.0.0.1:7899 --retry 3 --connect-timeout 20 -o $target $url
    if ($LASTEXITCODE -ne 0) { throw "RUN-LOCAL-VPN-RETRY.ps1 download failed" }
}

$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $target),
    [ref]$tokens,
    [ref]$errors
)

if ($errors.Count -gt 0) {
    $errors | Format-List
    throw "PowerShell parser check failed"
}

Write-Host "RUN-LOCAL-VPN-RETRY.ps1 parser check passed." -ForegroundColor Green
~~~

## Live queue behavior

RUN-LOCAL-VPN-RETRY.ps1 defaults to the live current-gallery queue, not the old 168 list.

BUILD-LIVE-TOC-DEMAND.ps1 reads:
- papers.gz.b64
- total-synthesis.json
- manual-supplement.json
- final-audit-supplement.json
- literature-supplement.json
- media-index.json

Including literature-supplement.json is mandatory to cover all 478 deployed cards.

The runner prints publisher, DOI count, queue path, queue mode, Browserbase disabled, Figure 1 fallback enabled, diagnostics enabled.

Workflow-generated queue files are not guaranteed to persist on main; the local live builder is authoritative for execution.

## Recommended next execution

After replacing and parsing the retry runner:

### ACS first

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\RUN-LOCAL-VPN-RETRY.ps1" -Publisher acs
~~~

Expected live queue: 7 visible ACS gaps.

After Collector says scan complete, close it normally so post-run sync executes:
- captures -> R2
- diagnostics -> R2

Then GPT should read the R2 diagnostic and capture endpoints directly. Do not ask the user for long logs unless diagnostic upload failed.

If captures increased, trigger Pages refresh and require STATIC_MEDIA_INTEGRITY failures=0.

### Wiley second

Run with -Publisher wiley.
Expected visible gaps: 11.
User may need to complete institutional login/captcha. Do not force-close the publisher window.

### Nature third

Run only the 2 visible gaps first. Do not waste time on the 63 lower-priority official upgrades until blank cards are zero.

### Science

No blank cards. Optional official upgrades only.

## Completion criteria

Primary goal: zero visible blank media cards among current 478 papers.

For each DOI:
1. official TOC if obtainable
2. otherwise Figure 1 fallback
3. never leave an index record pointing to missing/corrupt/mismatched media
4. never label Figure 1 as official
5. every failed DOI gets a diagnostic reason

After each publisher batch:
- inspect R2 diagnostics
- merge new captures
- deploy Pages
- require STATIC_MEDIA_INTEGRITY failures=0
- regenerate live demand
- verify gap count decreases

Only after visible gaps reach zero should official-upgrade queues be processed.

## Relevant functional commits

9779765... protected-image session reuse and rendered-element fallback
5b2d080... per-DOI diagnostics
1b3da433... automatic capture/diagnostic sync
d5cb287... Pages byte sniff and SVG repair
2d55758... R2 byte sniff
391a1a3... Collector SVG preservation
74f42cc... strict media integrity gate
ea855e4... media sanitizer
c01e3da... successful sanitized Pages deploy
9ceb6c0... all-478-card demand model
c7c3d34... parser-safe retry runner
7c8e6d2... corrected retry runner for local refresh
285d431... feedback private-R2 fallback

## Do not repeat these mistakes

- Do not call the old 168 historical set the current remaining TOC set.
- Do not trust media-index available=true without static-media integrity validation.
- Do not call 60+ Nature official upgrades blank cards.
- Do not infer current ACS blank count from the pre-repair screenshot; 63 cards were already captured but mispublished SVG.
- Do not rerun all 478 or all 168 when a publisher-specific live gap queue is sufficient.
- Do not manually patch braces into the retry runner; replace from current main.
- Do not depend on D1 for TOC publication.
- Do not allow Cloudflare quota exhaustion to break reading/search/feedback.
- Do not forget the project-global GPT reply-to-Git synchronization rule.

## First instruction for the next chat

Before any code change:
1. read PROJECT_RULES.md
2. read this handoff
3. fetch current RUN-LOCAL-VPN-RETRY.ps1 and current Actions status
4. log the GPT reply to audit/gpt-responses/YYYY-MM-DD.md
5. guide the user to overwrite the stale local runner and run the 7-DOI ACS live batch
