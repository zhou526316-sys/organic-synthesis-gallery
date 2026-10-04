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
