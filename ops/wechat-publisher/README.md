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

## Cover requirement

The draft cover is uploaded as a permanent WeChat `thumb` material. The helper
converts the repository PNG placeholder to a JPG below 64 KiB using Pillow.
Install the Ubuntu package once if needed:

```bash
sudo apt-get update
sudo apt-get install -y python3-pil
```

Article-body figures are a different path and will use `media/uploadimg` rather
than the cover thumbnail endpoint.

## Create the test draft

Only after the preview reports the expected publication slot and DOI list:

```bash
sudo python3 ops/wechat-publisher/create-draft.py --create
```

The draft's article-level `content_source_url` currently defaults to the Gallery
home page. Before production publishing, replace this with the immutable edition
URL that highlights the release DOI set.
