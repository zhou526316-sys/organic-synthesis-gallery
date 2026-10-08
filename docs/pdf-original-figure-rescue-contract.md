# Owner PDF original-figure recovery contract

Effective: 2026-10-09 (Beijing time). Applies to the Organic Synthesis Gallery media-acquisition project.

## Trigger and evidence
- Reuse official publisher TOC and DOI-bound article Figure/Scheme assets whenever available. PDF fallback is for a genuine unfilled image gap, not a reason to replace a correct already-stored figure.
- An eligible document must be an actually acquired, owner-authorized original PDF associated with the target admitted DOI. Do not access private PDFs via unlicensed sharing or bypass publisher authentication.
- For user-requested post-2026-10-01 acquisitions, preserve `addedDate >= 2026-10-01` as the authority; publication dates cannot substitute for admission dates.
- A textual figure label on a PDF page is a **locator only**. It is not an authenticated figure image, TOC, capture receipt or public publication. Scan up to a bounded number of pages to preserve China-first device performance.
- A PDF with a contradicting DOI must be rejected. When DOI is not present or text extraction is ambiguous, mark `unverified` and require visual human review.

## Scientific image integrity
- Recover only an unredrawn fragment rendered from the authentic PDF page or exact embedded image; do not use AI to recreate molecules, bonds, labels, stereochemistry, arrows or reaction conditions.
- Cross-check the entire proposed figure region, figure/scheme label, caption, source page number, DOI, image resolution and completeness. Do not call a generic PDF page, thumbnail, header or title page an official TOC.
- A true Figure 1 may serve as a Figure 1 fallback only after DOI-bound scientific review and proper media provenance. Keep its identity distinct from an official journal graphical abstract.
- Record source DOI, original PDF page, candidate label, normalized crop geometry, rendered pixel size and SHA-256, with an explicit scientific-review state. Conflicting or unverified identities are non-publishable.

## Authorization and publication
- The private original PDF, viewing session and entitlement remain with the owner. Do not include tokens, signed PDF URLs or raw source PDF bytes in public manifests, logs or transfers.
- Exported PNG and JSON provenance are **private owner-review candidates**. No automatic public upload, official TOC promotion, feed update, or redistribution-right assumption is permitted.
- A later public figure import requires publisher-reuse permission review plus the existing production DOI, media quality and editorial controls. That import requires a separate audited implementation and an explicit positive receipt.
- Failed or deferred candidate extraction never deletes a previously verified TOC, body image or owner PDF, and does not claim the paper is complete.

## Current implementation
- `src/pdf-vault/figure-rescue.mjs`: in-browser text-layer candidate location, DOI identity and provenance manifest.
- `src/private-pdf-reader.mjs` + `pdf/index.html`: existing authorized PDF reader offers `从 PDF 找图`, jump-to-page and manual authentic raster crop export.
- `tests/pdf-original-figure-rescue.test.mjs`: 8-case source/DOI/bounded scan/crop/rights regressions.
- Public site availability depends on a successful Pages deployment of merge commit `b0b2129b2b1dfc52810490e55aee52c2408e5e84`, not merely the GitHub merge.
