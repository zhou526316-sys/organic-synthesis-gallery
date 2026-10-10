# 2026-10-10 18:02 CST — 125 titles backfill handoff

User request: “把待核验标题的都把标题回填上”.

## Confirmed
- Published DOI membership: 938 unique.
- Placeholder/missing English titles in authorized `public/papers.gz.b64` baseline: 125 DOI/125 rows.
- 125 titles matched by DOI against another published source, Crossref DOI, or OpenAlex DOI. 0 unresolved. Evidence: `audit/title-backfill/verified-titles-20261010.json`.
- Initial PR #483 merged data correction to main, but violated protected fixed-slot blob (quality gate rightfully failed); it has been rectified without weakening authorization.
- PR #486 merged at `eeb8be588a2191573452c9dbc2f702e92b863d94`. This restored `public/papers.gz.b64` exact SHA `85a62cf86f1b87047386e2fc4c30bf9eeb4c2353` matching the immutable fixed-slot marker, retaining 125 verified titles in the audit receipt.
- During Pages build, `cloudflare/scripts/merge-curated-pages.mjs` calls `scripts/apply-verified-title-presentation.mjs` to project these titles by already-approved DOI into **generated** `public/literature-supplement.json`. This is not an off-slot literature admission or mutation of the repository-authorized 7 literature inputs.
- CI [#38043255806](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38043255806): passed production release authorization, unit tests and real corpus isolated metadata presentation. Result: 938 approved DOIs, 125 gaps, 125 receipts, 125 derived supplemental rows, zero new DOI, zero protected file changed.
- Main fixed-slot protected gate passed after #486. Separate broad literature quality gate #38043322168 failed on existing unresolved/pending candidate audit issues including `10.1039/d6sc06879k`, not on title backfill; these belong to primary literature review owners. Do not change release policy for this.
- Live Pages deployment **not yet confirmed** as of this note; concurrent Pages queue and other main commits ongoing. At 18:02 CST, pending Pages run #38043354801; prior run for #486 SHA canceled in favor of newer main. Future verification must check a *successful* Pages run whose source commit contains #486 and then check published `literature-supplement.json` and architecture search for the 125 DOI titles.
- Follow-up: verify live title display and search, and report actual deployment SHA/status. Do not repeat DOI metadata requests or change scope, release date, TOC, figures or PDF.
