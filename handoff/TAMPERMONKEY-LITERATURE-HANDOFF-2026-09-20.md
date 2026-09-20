# Tampermonkey ↔ GPT literature-update handoff — 2026-09-20

This file is the cross-chat contract between the primary GPT literature update and the Tampermonkey TOC/Figure1 mainline.

## Journal scope

The canonical source is `shared/literature-journals.js`. The current 15-journal set replaces Chinese Journal of Chemistry with Green Chemistry. Green Chemistry is prospective from 2026-09-19 and uses ISSNs 1463-9262 / 1463-9270.

## Literature -> media handoff

1. GPT discovers and semantically reviews literature.
2. Accepted papers are committed immediately to the authoritative literature supplement and deployed; media never blocks the card.
3. That data push triggers `Refresh live TOC demand queue`.
4. The queue builder writes `public/toc-demand-live.json` plus publisher-specific queues.
5. Tampermonkey consumes the live queue: first `visibleGaps`, then `officialUpgrades`.
6. Captures preserve DOI, publisher, article/source URL, asset semantics and capture time; use source identity `tampermonkey-toc-mainline`.
7. Official TOC / graphical abstract / abstract image is preferred. Figure 1 is fallback only and must never be relabeled as official TOC.
8. Captured media uses the existing authenticated Worker local/media import path and is subsequently merged into production media.
9. The 08:20 and 18:20 Asia/Shanghai queue refresh is a fallback. Accepted-paper commits trigger refresh immediately.

## RSC / Green Chemistry

Green Chemistry uses DOI prefix `10.1039/`. The RSC adapter derives journal code from the DOI: e.g. `10.1039/D6GC03578G` -> `/2026/gc/d6gc03578g`. Chemical Science uses the same adapter with `sc`.

## Coordination

Do not wholesale overwrite another chat's Tampermonkey extraction implementation. Both chats should converge on this queue/import contract. Before media writes, read current main and current queue; before Git writes, refetch current SHAs.
