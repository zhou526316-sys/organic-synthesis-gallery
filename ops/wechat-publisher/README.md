# WeChat draft-first preview

This preview workflow treats the WeChat Official Account draft as the only
source of truth.

Flow:

1. Build article content.
2. Create or update the actual WeChat draft.
3. Call `draft/get` and read the stored draft back from WeChat.
4. Render a preview page from the returned `news_item[0].content`.
5. Publish that preview under `https://relay.gczhouwld.com/wechat-preview/<token>.html`.

The preview page must never be authored independently from the draft.

## One-time Nginx setup

```bash
cd "$HOME/organic-synthesis-gallery-publisher"
git pull --ff-only
cd ops/wechat-publisher
sudo bash enable-draft-preview.sh
```

## Adopt the current 2026-10-04 test draft once

```bash
sudo python3 create-draft.py --create --media-id "<existing media_id>"
```

On subsequent runs for the same Beijing publication date, the script reuses the
saved draft media_id and calls `draft/update` rather than creating duplicate
drafts.

A successful run prints `preview_url`. That URL is generated only after
`draft/get` succeeds.


## Featured-paper source PDFs

Featured-paper source PDFs are repository assets. The publisher reads the path
from `public/wechat-featured/YYYY-MM-DD.json -> pdf_repo_path`.

Current example:

```text
assets/wechat-featured/2026-10-04/s41467-026-78226-0_reference.pdf
```

Normal Ubuntu publishing therefore needs only `git pull --ff-only`; no Windows
download path or `scp` step is part of the standard workflow. The
`--featured-pdf` option remains an emergency override only.
