# WeChat Featured PDF Handoff Contract

Status: production design candidate
Date: 2026-10-04

## Goal

The user never manually uploads a daily featured PDF to the WeChat publisher and
never runs the Ubuntu publisher command after the one-time autopublisher
bootstrap.

## Source flow

1. The user selects a featured DOI in ChatGPT.
2. `public/wechat-featured/YYYY-MM-DD.json` records that DOI and the deep-reading
   content contract.
3. Tampermonkey/VPN Bridge detects that DOI as a PDF demand item and retrieves
   the publisher PDF through the user's authenticated/VPN browser session.
4. The Bridge computes SHA-256 before handoff.
5. The PDF source is made available to the publisher:
   - Open-access / redistribution-permitted PDF: repository asset may be used at
     `assets/wechat-featured/YYYY-MM-DD/<doi-safe>.pdf` and the manifest sets
     `pdf_repo_path`.
   - Subscription / restricted PDF: do **not** commit the full PDF into the
     public GitHub repository. Store it in the private Bridge/R2 path and record
     a private object key in the handoff manifest. Only derived article-body
     figures needed for the user's WeChat draft may be uploaded through the
     authorized fixed-IP publisher.
6. A successful source handoff updates GitHub state, which triggers
   `.github/workflows/wechat-draft-publisher.yml`.
7. GitHub Actions calls the authenticated fixed-IP relay endpoint
   `POST /wechat/publisher/run`.
8. The Ubuntu relay pulls main, runs the publisher, updates the existing daily
   WeChat draft, calls `draft/get`, writes the reader preview, and returns
   `preview_url`.
9. The workflow records the result in
   `audit/wechat-publisher/latest.json`.

## Tampermonkey queue fields

For a requested featured paper, expose at least:

- doi
- requested_date
- priority = featured
- missing = pdf
- fetch_status = queued | downloading | ready | failed
- sha256
- storage_kind = repo | private_bridge
- repo_path OR private_object_key
- captured_at

Featured PDF requests outrank historical PDF gaps but do not interrupt a
currently active individual browser fetch.

## Publisher invariant

There is no independently authored preview page.

`WeChat draft -> draft/get -> preview`

The draft is the source of truth.

## Image invariant

Chemical structures are never AI-redrawn for the featured article. Figures are
rendered/cropped from the captured source PDF or publisher original image bytes,
then normalized only for pixel format/size required by WeChat.
