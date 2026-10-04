# Private PDF -> Editorial Evidence -> Daily WeChat Selected Article

Status: phase 2 capture implementation deployed; owner activation pending. Raw capture may be enabled only for entitled owner sessions; PDF processing/activation remains disabled until phase 3.

## Non-negotiable separation

The existing Gallery acquisition path remains authoritative and independent:

- TOC/body figures/HTML evidence continue using the current media queue, DOI binding, quality thresholds, publication receipts and release slots.
- PDF capture is owner-only and private. A PDF failure never changes the success/failure state of TOC, body figures, HTML evidence, literature publication or website operation.
- Private PDFs never enter GitHub Pages or public media manifests.
- Publisher authentication, paywalls, CAPTCHA, DRM and 401/403/429 responses are not bypassed.

## Priority lanes

PDF is not a fourth hard missing field in the existing media queue.

1. `editorial_hot`: newest papers that enter the daily selected-article candidate pool. Goal: obtain and verify PDF before deep-reading selection.
2. `media_rescue`: a paper whose HTML TOC/body/fulltext acquisition is incomplete. PDF can provide a secondary evidence source after verification.
3. `archive_backfill`: automatic PDF capture is limited to Gallery `addedDate >= 2026-10-01`; papers added on 2026-09-30 or earlier are outside the automatic PDF scope.
4. `manual`: explicit owner request for one DOI; the current automatic capture path still applies the same 2026-10-01 cutoff.

The first implementation opportunistically captures one explicit publisher-provided PDF during an already-open publisher visit. Automatic PDF scope is keyed only by the Gallery website `addedDate` and requires `addedDate >= 2026-10-01`; publication date is not a fallback. A later independent PDF queue may cover eligible recent papers that did not need a media visit.

## Capture contract

Only explicit publisher-provided PDF candidates are allowed: `citation_pdf_url`, `link[type=application/pdf]` or clearly labelled PDF links in the bound article DOM.

Forbidden:

- guessing/synthesizing publisher download URLs;
- routing around 401/403/429 or anti-bot pages;
- borrowing a PDF link from another article or related-content block;
- treating Supporting Information as the article PDF;
- publishing raw PDF bytes to the public MEDIA bucket.

The browser verifies PDF magic/size and source host. Worker re-verifies lease, DOI syntax, publisher/source host, content type, PDF magic/EOF and SHA-256. Raw captures are stored `active=0`, `processing_state=raw`; therefore capture alone never makes a PDF readable or editorial-ready.

## Processing / verification contract

The private processor is responsible for activating a document. It should:

1. extract PDF metadata and text;
2. verify the DOI/title/authors against the Gallery paper record;
3. determine version type: Version of Record / Accepted Manuscript / Preprint / unknown;
4. extract page text blocks, captions and coordinates;
5. locate Figure/Scheme/Chart regions deterministically;
6. create a content-addressed manifest;
7. mark a PDF active only after identity verification.

If the PDF identity cannot be proven, it remains private/raw and is excluded from owner reading, media rescue and editorial generation.

## Editorial Evidence Bundle

The daily WeChat pipeline must not consume a raw PDF directly. It consumes a versioned `EditorialEvidenceBundle`.

Minimum bundle fields:

- DOI, title, journal, publication metadata;
- selected document id, version kind and SHA-256;
- evidence source priority and completeness;
- full text sections with page/block coordinates;
- figure/scheme/chart list with caption, page and region hash;
- abstract/HTML evidence hash when available;
- key claims linked to supporting blocks/figures;
- experimental controls/mechanistic evidence markers;
- limitations / uncertainty markers;
- source freshness and stale status.

For chemistry image safety, molecular/reaction drawings used in a selected post must come from verified publisher/PDF evidence. Generated illustrative graphics may explain concepts, but must never silently replace or redraw a chemical structure as if it were the source figure.

## Daily selected-post flow

1. Gather newly published Gallery papers.
2. Lightweight rank using title/abstract/TOC and journal priority.
3. Mark a small set as `editorial_hot`.
4. Capture/verify PDFs for those candidates first.
5. Build Editorial Evidence Bundles.
6. Deep-read candidates and choose the selected paper.
7. Generate a preview article from evidence-linked claims and verified figures.
8. Run chemical/figure consistency checks.
9. Only a bundle with `editorial_ready=true` can enter the automated publishing path.

If no candidate reaches editorial readiness, the system must delay/skip rather than publish a confident-looking but weakly evidenced article.

## Source resolver

For text:
Version-of-Record full PDF/HTML > complete accepted manuscript > abstract-only evidence.

For official TOC:
publisher HTML official TOC > PDF explicitly labelled Graphical Abstract/TOC graphic > existing Figure 1 fallback.

For body figures:
publisher HTML original figure > PDF region with exact Figure/Scheme/Chart label > missing.

A PDF-derived image still passes the current DOI, label, hash, decode, dimensions and publication gates before it can appear publicly.

## Operational safeguards

- Dedicated `PDF_PRIVATE` bucket.
- Separate read/capture/process capabilities.
- Short-lived read tokens and seven-day scoped capture leases.
- Server kill switches for read/capture/process.
- No PDF keys in public indexes.
- Capture lease cannot read PDFs or publish media.
- Processing and editorial jobs use their own service identity later.
- All derived bundles are content-addressed and become stale when the selected PDF hash changes.

This design makes PDF a high-confidence evidence source for deep reading and selected WeChat posts without making the existing Gallery dependent on PDF availability.
