# WeChat daily publisher

Initial production-safe helper for building the Official Account daily literature
index from the Gallery's latest verified publication receipt.

## Safety

- Reads `WECHAT_MP_APP_ID` and `WECHAT_MP_APP_SECRET` from
  `/etc/osg-wechat-relay/env`.
- Never prints the AppSecret or access token.
- Default mode only renders a local HTML preview.
- `--create` uploads/reuses a permanent cover and writes one draft.
- It does not call `freepublish/submit` and does not call mass-send APIs.

## Preview

```bash
cd /opt/organic-synthesis-gallery
sudo git pull --ff-only
sudo python3 ops/wechat-publisher/create-draft.py
```

## Create the test draft

Only after the preview reports the expected publication slot and DOI list:

```bash
sudo python3 ops/wechat-publisher/create-draft.py --create
```

The draft's article-level `content_source_url` currently defaults to the Gallery
home page. Before production publishing, replace this with the immutable edition
URL that highlights the release DOI set.
