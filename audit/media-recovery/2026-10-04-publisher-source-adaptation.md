# Publisher source adaptation — 2026-10-04

User approval: 将问题解决，但不要触发到其他核心规则。不能影响整体使用。
This collector-only repair follows deployed stored-media PR266. Base2357bb1ff3bc3e23d074a0b52bbf25b6eee54752. It does not replace or undo the SVG mirror and full publication metadata fix.

## Narrow changes

ACS body candidates: the previous selector evaluated only the first4 candidates, even though isolated figure DOM could already provide up to6 variants. The new ACS/body-only selector prioritizes explicit non-viewer .svg links from that same candidate set, deduplicates URLs and evaluates at most6. It does not guess download URLs, alter request authorization, retry around403, parse an HTML viewer as image bytes or lower measured resolution/SVG safety checks. Other publishers and official TOC ranking keep the4-candidate behavior. Repeated identical same-figure currentSrc fallback measurements are deduplicated.

Wiley body candidates: add an exact numbered-heading/ARIA label fallback INSIDE the isolated figure block when the existing caption/alt rule produced no label. Exactly one Figure/Scheme/Chart number is required. Cross-block ARIA references, mixed-number ancestors, related/recommended sections, graphical abstracts and foreign DOI assets remain excluded. Existing valid contexts are preserved. No figure number is inferred from a filename. If discovery remains empty, emit only DOM element counts (images, figure blocks, numbered headings), not page text, cookies or credentials.

Controller2.2.39/protocol6.2.20/generation1790082000000 remain. Marker PUBLISHER_MEDIA_REVISION=20261004-publisher-sources-v7. Panel 全队列补缺6 · 图源适配7. Complete immediate-start/queue runtime, website-date/journal priority, figure quality function and SVG validator regions were compared before/after and are byte-identical. Protected rules, policy and existing workflows likewise hash-identical. No new publisher host permissions, credentials, media resets or publication-policy changes.

## Verification and limits

Run37174050959 passed. Artifact11292826202 downloaded; exact source matches independent local patch bytes.157 existing unit cases passed (queue, missing-only, immediate restart, lifecycle, newest/retry, upload, release and diagnostic suites).17 Chromium DOM/image-selection fixtures passed with0console errors and0page errors, and no real publisher requests. They cover separated numbered titles, independent figure caption isolation, same-block versus cross-block ARIA, multiple-title rejection, recommendations/GA exclusion, foreign DOI rejection, unchanged old captions, ACS fifth explicit vector candidate, bounded supplied URLs, HTML viewer exclusion, unchanged other-publisher/TOC behavior, unchanged520x586 rejection and unsafe-SVG rejection.

These are deterministic DOM fixtures, not proof that all14 recent Angew pages use that layout or that the user's institution can access blocked ACS full-resolution assets. Optional read-only publisher inspection returned a Wiley abstract-view reference and a later bot_blocked response; no access-control bypass or credentials were attempted. Browserbase discovery found no available plugin and the available TinyFish profile has no publisher sign-in. The actual installed user-browser DOM remains the authority; new receipts/DOM counts must confirm recovery after adoption. A publisher access restriction is not made successful by this patch.

Installer SHA2564c34c6a3e08588523765873ec38c6cb62e6380439d7c729006c74c0a6c1f2c61. Source SHA2561d65a4f47d62460be5643bb28357ea4514acd3d8542b29a10ee10d1c4b25ff48. Compatible installer syntax/contract validation passed. PR checks, canonical online bytes and user-desktop adoption are separate acceptance steps; no blanket all-failures-resolved claim.
